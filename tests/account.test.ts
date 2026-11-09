// Tests for editing/deleting, blocking, search, profiles, data export, account
// deletion, sign-up checks and password reset, against the preview backend
// (which applies the same rules as the server). Run: npm run test:account

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
};

const api = await import("../src/preview/api");
const { supabase } = await import("../src/preview/supabase");

let failures = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) failures++; };
const throwsWith = async (fn: () => Promise<unknown>, re: RegExp) => {
  try { await fn(); return false; } catch (e: any) { return re.test(String(e?.message)); }
};
const human = { formMs: 6000 };
const tok = async (email: string, password = "longpass1") => {
  const r = await supabase.auth.signInWithPassword({ email, password });
  return r.data.session?.access_token ?? "";
};

// ── Sign-up checks ───────────────────────────────────────────────────────────
ok(await throwsWith(() => api.signUp("bot@x.ng", "longpass1", "Botty", { website: "http://spam", formMs: 6000 }), /Something went wrong/), "sign-up: hidden field filled → rejected");
ok(await throwsWith(() => api.signUp("fast@x.ng", "longpass1", "Speedy", { formMs: 800 }), /Something went wrong/), "sign-up: submitted too fast → rejected");
ok(await throwsWith(() => api.signUp("short@x.ng", "short", "Shorty", human), /at least 8/), "sign-up: password under 8 characters → rejected");
ok(await throwsWith(() => api.signUp("res@x.ng", "longpass1", "NaijaNewsBot", human), /reserved/), "sign-up: bot names reserved");
ok(await throwsWith(() => api.signUp("res2@x.ng", "longpass1", "deleted", human), /reserved/), "sign-up: '[deleted]' reserved");
const created = await api.signUp("ada@x.ng", "longpass1", "Ada", human);
ok(created.needsConfirmation === false, "sign-up: preview confirms straight away");
ok(await throwsWith(() => api.signUp("ada2@x.ng", "longpass1", "ADA", human), /taken/), "sign-up: usernames are unique regardless of case");
await api.signUp("bayo@x.ng", "longpass1", "Bayo", human);
await api.signUp("chi@x.ng", "longpass1", "Chi", human);
const A = await tok("ada@x.ng"), B = await tok("bayo@x.ng"), C = await tok("chi@x.ng");

// ── Editing and deleting posts ───────────────────────────────────────────────
const post = await api.createPost(A, { community: "Lagos", title: "Original title", body: "First draft" });
const edited = await api.editPost(A, String(post.id), { title: "Fixed title", body: "Second draft", flair: "Ask", flairColor: "#2fb37f" });
ok(edited.title === "Fixed title" && edited.body === "Second draft" && !!edited.editedAt && edited.flair === "Ask", "edit post: title, text and flair change, marked edited");
ok(await throwsWith(() => api.editPost(B, String(post.id), { body: "hijack" }), /only edit your own/), "edit post: others can't edit");
// Age the post past the title window
const stored = JSON.parse(mem.get("threadit-preview:posts")!);
stored.find((p: any) => p.id === post.id).createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
mem.set("threadit-preview:posts", JSON.stringify(stored));
ok(await throwsWith(() => api.editPost(A, String(post.id), { title: "Too late" }), /first 15 minutes/), "edit post: title locked after 15 minutes");
ok((await api.editPost(A, String(post.id), { body: "Still editable" })).body === "Still editable", "edit post: text still editable later");

// ── Comments: edit, delete with and without replies ──────────────────────────
const c1 = await api.createComment(B, String(post.id), "Bayo's comment");
const reply = await api.createComment(C, String(post.id), "Chi replies", c1.id);
const lone = await api.createComment(B, String(post.id), "Lone comment");
ok((await api.editComment(B, c1.id, "Bayo's comment, edited")).body === "Bayo's comment, edited", "edit comment: own comment updates");
ok(await throwsWith(() => api.editComment(A, c1.id, "nope"), /only edit your own/), "edit comment: others can't edit");
const delWithReplies = await api.deleteComment(B, c1.id);
ok(delWithReplies.placeholder === true, "delete comment with replies → placeholder kept");
const del2 = await api.deleteComment(B, lone.id);
ok(del2.placeholder === false, "delete comment without replies → removed");
let detail = await api.getPost(String(post.id), A);
const ph = detail.comments.find(c => c.id === c1.id)!;
ok(ph.deleted === true && ph.author === "[deleted]" && ph.body === "", "placeholder shows as [deleted] with no text");
ok(detail.comments.some(c => c.id === reply.id) && !detail.comments.some(c => c.id === lone.id), "reply survives; lone comment gone");
ok(detail.post.comments === 2, `comment count updates after delete (expected 2, got ${detail.post.comments})`);

// ── Blocking ─────────────────────────────────────────────────────────────────
const chiPost = await api.createPost(C, { community: "Kano", title: "Chi's post about Kano" });
await api.setBlocked(A, "Chi", true);
ok((await api.getBlocks(A)).some(b => b.username === "Chi"), "block: added to list");
ok(!(await api.getPosts(A)).some(p => p.id === chiPost.id), "block: blocked person's posts leave your feed");
ok((await api.getPosts(B)).some(p => p.id === chiPost.id), "block: other people still see them");
detail = await api.getPost(String(post.id), A);
const blockedReply = detail.comments.find(c => c.id === reply.id)!;
ok(blockedReply.blocked === true && blockedReply.body === "", "block: their comments are hidden in threads");
const notesBefore = (await api.getNotifications(A)).length;
await api.createComment(C, String(post.id), "Chi comments on Ada's post");
ok((await api.getNotifications(A)).length === notesBefore, "block: they can't notify you");
ok(await throwsWith(() => api.setBlocked(A, "Ada", true), /block yourself/), "block: can't block yourself");
ok((await api.search("Kano", A)).every(p => p.id !== chiPost.id), "block: blocked posts left out of search");
await api.setBlocked(A, "Chi", false);
ok((await api.getPosts(A)).some(p => p.id === chiPost.id), "unblock: posts come back");

// ── Search ───────────────────────────────────────────────────────────────────
await api.createPost(B, { community: "AskNaija", title: "Where to buy a generator in Ibadan?", body: "Looking for a reliable dealer" });
await api.createPost(B, { community: "Oyo", title: "Ibadan traffic today", body: "Generator smoke everywhere at Dugbe" });
const r1 = await api.search("ibadan generator", null);
ok(r1.length === 2, `search: every word must appear (2 results, got ${r1.length})`);
ok(r1[0].title.startsWith("Where to buy a generator"), "search: title matches rank first");
ok((await api.search("dealer", null)).length === 1, "search: finds words in the post text");
ok((await api.search("ibadan", null, "Oyo")).length === 1, "search: can be limited to one community");
ok((await api.search("x", null)).length === 0, "search: needs at least 2 characters");

// ── Profiles ─────────────────────────────────────────────────────────────────
const prof = await api.getUser("Bayo", A);
ok(prof.username === "Bayo" && prof.postCount === 2 && !prof.isMe, "profile: shows posts and counts");
ok(prof.comments.every(c => !c.deleted), "profile: deleted comments aren't listed");
ok((await api.getUser("Ada", A)).isMe, "profile: knows when it's your own");
ok((await api.getUser("NaijaNewsBot", A)).isBot, "profile: bot accounts marked as bots");
ok(await throwsWith(() => api.getUser("nobody_here", A), /No one has that username/), "profile: unknown username → not found");

// ── Data export ──────────────────────────────────────────────────────────────
const data: any = await api.exportAccount(B);
ok(data.account.username === "Bayo" && data.posts.length === 2 && data.comments.length >= 2, "export: includes account, posts and comments");
ok(data.comments.some((c: any) => c.deleted), "export: includes deleted comments, marked as deleted");

// ── Account deletion ─────────────────────────────────────────────────────────
ok(await throwsWith(() => api.deleteAccount(B, false, "yes"), /Type "delete"/), "delete account: needs typed confirmation");
await api.deleteAccount(B, false, "delete");
const afterKeep = await api.getPosts(null);
const kept = afterKeep.filter(p => p.title.includes("Ibadan"));
ok(kept.length === 2 && kept.every(p => p.author === "[deleted]"), "delete account (keep content): posts stay, author shown as [deleted]");
ok(!(await supabase.auth.signInWithPassword({ email: "bayo@x.ng", password: "longpass1" })).data.session, "delete account: can't sign in afterwards");
ok(!!(await api.signUp("bayo2@x.ng", "longpass1", "Bayo", human)), "delete account: username becomes available again");

const C2 = await tok("chi@x.ng");
await api.deleteAccount(C2, true, "delete");
ok(!(await api.getPosts(null)).some(p => p.id === chiPost.id), "delete account (delete content): posts removed");
const thread = await api.getPost(String(post.id), null);
ok(thread.comments.filter(c => c.author === "[deleted]").every(c => c.body === ""), "delete account (delete content): comments emptied");

// ── Password reset ───────────────────────────────────────────────────────────
await supabase.auth.signOut();
let recovered = false;
supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") recovered = true; });
await supabase.auth.resetPasswordForEmail("ada@x.ng");
await new Promise(r => setTimeout(r, 500));
ok(recovered, "password reset: recovery event fires (preview simulates the email link)");
const weak = await supabase.auth.updateUser({ password: "short" });
ok(!!weak.error, "password reset: short password rejected");
await supabase.auth.updateUser({ password: "brandnew99" });
await supabase.auth.signOut();
ok(!(await supabase.auth.signInWithPassword({ email: "ada@x.ng", password: "longpass1" })).data.session, "password reset: old password stops working");
ok(!!(await supabase.auth.signInWithPassword({ email: "ada@x.ng", password: "brandnew99" })).data.session, "password reset: new password works");

console.log(failures ? `\n${failures} failed` : "\nAll account tests passed");
if (failures) process.exitCode = 1;
