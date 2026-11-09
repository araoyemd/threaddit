// ─── Preview stand-in for src/app/api.ts ──────────────────────────────────────
// Same functions and the same rules as supabase/functions/server/index.tsx,
// but stored in this browser so the hosted preview works without a server.
// Keep the rules here in step with the server file.

import { read, write, users, userFromToken, isPreviewAdmin, delay, type PreviewUser } from "./store";
import { AWARDS, PROFILE_FLAIRS, PROFILE_FLAIR_COST, MILESTONES, BUILTIN_COMMUNITIES } from "../app/data";
import type {
  Post, PostDetail, Comment, Community, AppNotification, Gold, ModItem, ReportReason, AwardKind, VoteDir,
} from "../app/types";
import { EMPTY_GOLD, goldBalance } from "../app/types";
import type { BotRunReport, BotStatus, UserProfile } from "../app/types";
import { runBots as runBotEngine, isBotAuthor, bareName, BOTS, type BotStore, type BotJob, type BotPost } from "../../supabase/functions/server/bots";

const GOLD_POST = 10;
const GOLD_UPVOTE_RECEIVED = 1;
const GOLD_COMMUNITY = 50;
const COMMUNITY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const HIDE_AFTER_REPORTS = 3;
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;
const DAILY_LIMITS = { post: { newAccount: 3, regular: 20 }, comment: { newAccount: 20, regular: 300 } };
const BUILTIN = BUILTIN_COMMUNITIES.map(c => c.name.toLowerCase()).concat("naija");
const BOT_AUTHOR = BOTS.threadit.name;

type StoredPost = Post & { createdAt: string; removed?: boolean; milestones?: number[]; recurring?: string };
type StoredComment = Comment & { removed?: boolean };
const TITLE_EDIT_WINDOW_MS = 15 * 60 * 1000;
type VoteResult = { votes: number; userVote: VoteDir | null };

function requireUser(token: string | null | undefined, message = "Authorization required"): PreviewUser {
  const u = userFromToken(token);
  if (!u) throw new Error(message);
  return u;
}

const goldOf = (id: string): Gold => ({ ...EMPTY_GOLD, ...read<Record<string, Partial<Gold>>>("gold", {})[id] });
function saveGold(id: string, g: Gold) {
  const all = read<Record<string, Gold>>("gold", {});
  all[id] = g;
  write("gold", all);
}
function addGold(id: string, amount: number, type: keyof Gold) {
  const g = goldOf(id);
  g[type] += amount;
  saveGold(id, g);
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const posts = () => read<StoredPost[]>("posts", []);
const savePosts = (p: StoredPost[]) => write("posts", p);
const comments = () => read<StoredComment[]>("comments", []);
const saveComments = (c: StoredComment[]) => write("comments", c);
const profile = (id: string) => read<Record<string, { flair?: string | null; owned?: string[] }>>("profiles", {})[id] ?? {};
function saveProfile(id: string, p: { flair?: string | null; owned?: string[] }) {
  const all = read<Record<string, any>>("profiles", {});
  all[id] = p;
  write("profiles", all);
}

function notify(userId: string, n: Omit<AppNotification, "id" | "createdAt" | "read">, actorId?: string) {
  if (!userId || userId.startsWith("bot:")) return;
  if (actorId && blockedIds(userId).has(actorId)) return;
  const all = read<Record<string, AppNotification[]>>("notifs", {});
  const list = all[userId] ?? [];
  list.unshift({ id: crypto.randomUUID(), ...n, createdAt: new Date().toISOString(), read: false });
  all[userId] = list.slice(0, 100);
  write("notifs", all);
}

function checkRateLimit(user: PreviewUser, kind: "post" | "comment") {
  const day = new Date().toISOString().slice(0, 10);
  const all = read<Record<string, number>>("ratelimits", {});
  const key = `${kind}:${user.id}:${day}`;
  const isNew = Date.now() - new Date(user.createdAt).getTime() < NEW_ACCOUNT_MS;
  const limit = isNew ? DAILY_LIMITS[kind].newAccount : DAILY_LIMITS[kind].regular;
  if ((all[key] ?? 0) >= limit) {
    throw new Error(isNew
      ? `New accounts can make ${limit} ${kind}s a day while we check for spam. Try again tomorrow.`
      : `You've reached today's limit of ${limit} ${kind}s. Try again tomorrow.`);
  }
  all[key] = (all[key] ?? 0) + 1;
  write("ratelimits", all);
}

function membersMap() { return read<Record<string, string[]>>("members", {}); }
function isModerator(user: PreviewUser | null, community: string) {
  if (!user) return false;
  if (isPreviewAdmin(user)) return true;
  return read<any[]>("communities", []).some(c => c.name.toLowerCase() === community.toLowerCase() && c.founderId === user.id);
}

function publicPost(p: StoredPost, user?: PreviewUser | null): Post {
  const { removed: _r, milestones: _m, recurring: _rc, ...rest } = p;
  const out: Post = { ...rest, author: bareName(p.author), isBot: isBotAuthor(p), timeAgo: timeAgo(p.createdAt) };
  if (user) out.userVote = read<Record<string, VoteDir>>("votes", {})[`${p.id}:${user.id}`] ?? null;
  return out;
}
function publicComment(c: StoredComment): Comment {
  const { removed: _r, ...rest } = c;
  return {
    ...rest,
    author: c.deleted ? "[deleted]" : bareName(c.author), authorId: c.deleted ? undefined : c.authorId,
    isBot: !c.deleted && isBotAuthor(c), body: c.hidden || c.deleted ? "" : c.body, timeAgo: timeAgo(c.createdAt),
  };
}

type BlockEntry = { id: string; username: string };
const blocksOf = (userId?: string | null): BlockEntry[] =>
  (userId ? read<Record<string, BlockEntry[]>>("blocks", {})[userId] ?? [] : []).map(b => ({ ...b, username: bareName(b.username) }));
const blockedIds = (userId?: string | null) => new Set(blocksOf(userId).map(b => b.id));
function userIdFor(username: string): string | null {
  const target = bareName(username).toLowerCase();
  const bot = Object.values(BOTS).find(b => b.name.toLowerCase() === target);
  if (bot) return bot.id;
  return Object.values(users()).find(u => bareName(u.username).toLowerCase() === target)?.id ?? null;
}

// ── Recurring threads (same as the server) ───────────────────────────────────

function ensureRecurringThreads() {
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7;
  const ws = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const weekLabel = ws.toLocaleDateString("en-NG", { day: "numeric", month: "long", timeZone: "UTC" });
  const monthLabel = now.toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
  const threads = [
    {
      key: `fuel:${ws.toISOString().slice(0, 10)}`, community: "Nigeria",
      title: `Weekly fuel price check-in: what are you paying? (week of ${weekLabel})`,
      body: "Share your state, city, filling station and the price per litre you paid this week. Include the date so others can compare.",
      flair: "Discussion", flairColor: "#a66bff",
    },
    {
      key: `nysc:${now.toISOString().slice(0, 7)}`, community: "NYSC",
      title: `NYSC questions thread: postings, camp and PPA (${monthLabel})`,
      body: "Ask anything about call-up letters, camp, redeployment, PPA and allowances. Corpers and ex-corpers, share what you know.",
      flair: "Ask", flairColor: "#2fb37f",
    },
  ];
  const list = posts();
  let changed = false;
  for (const t of threads) {
    if (list.some(p => p.recurring === t.key)) continue;
    const kind = t.key.split(":")[0];
    list.forEach(p => { if (p.recurring?.startsWith(kind + ":")) p.pinned = false; });
    list.push({
      id: crypto.randomUUID(), community: t.community, author: BOT_AUTHOR, authorId: BOTS.threadit.id, isBot: true, title: t.title, body: t.body,
      flair: t.flair, flairColor: t.flairColor, votes: 1, comments: 0, pinned: true,
      createdAt: now.toISOString(), timeAgo: "just now", recurring: t.key,
    });
    changed = true;
  }
  if (changed) savePosts(list);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string, username: string, checks: { website?: string; formMs?: number } = {}) {
  await delay();
  if (checks.website || (typeof checks.formMs === "number" && checks.formMs < 2500)) {
    throw new Error("Something went wrong. Wait a moment and try again.");
  }
  if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
  if (["deleted", "admin", "threadit", "moderator"].includes(username.replace(/^u\//i, "").toLowerCase()) || userIdFor(username)?.startsWith("bot:")) {
    throw new Error("That username is reserved. Try another.");
  }
  const key = email.trim().toLowerCase();
  const all = users();
  const handle = username.replace(/^u\//i, "");
  if (all[key]) throw new Error("Signup failed: an account with this email already exists. Sign in instead.");
  if (!/^[A-Za-z0-9_]{3,30}$/.test(handle)) throw new Error("Usernames need 3–30 letters, numbers or underscores.");
  if (Object.values(all).some(u => bareName(u.username).toLowerCase() === handle.toLowerCase())) {
    throw new Error("That username is taken. Try another.");
  }
  const id = crypto.randomUUID();
  all[key] = { id, email: key, password, username: handle, createdAt: new Date().toISOString() };
  write("users", all);
  // The preview can't send email, so accounts are confirmed straight away
  return { userId: id, username: handle, needsConfirmation: false };
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function getPosts(token?: string | null, community?: string): Promise<Post[]> {
  await delay();
  ensureRecurringThreads();
  const user = userFromToken(token);
  const blocked = blockedIds(user?.id);
  const c = community?.toLowerCase();
  return posts()
    .filter(p => !p.removed && !blocked.has(String(p.authorId)) && (!p.hidden || (user && p.authorId === user.id)))
    .filter(p => !c || p.community.toLowerCase() === c)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(p => publicPost(p, user));
}

export async function getPost(id: string, token?: string | null): Promise<PostDetail> {
  await delay(120);
  const p = posts().find(x => String(x.id) === id);
  if (!p || p.removed) throw new Error("This post doesn't exist or was removed.");
  const viewer = userFromToken(token);
  const blocked = blockedIds(viewer?.id);
  const post = publicPost(p, viewer);
  if (blocked.has(String(p.authorId))) post.blocked = true;
  return {
    post,
    comments: comments()
      .filter(c => c.postId === id && !c.removed)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(c => {
        const out = publicComment(c);
        if (blocked.has(String(c.authorId))) { out.blocked = true; out.body = ""; }
        return out;
      }),
  };
}

export async function createPost(token: string, data: {
  community: string; communityIcon?: string; title: string; body?: string; flair?: string | null; flairColor?: string | null;
}): Promise<Post> {
  await delay();
  const user = requireUser(token, "Sign in to create a post");
  const community = String(data.community).replace(/^r\//i, "").trim();
  const title = String(data.title ?? "").trim();
  if (!community || !title) throw new Error("Choose a community and write a title.");
  if (title.length > 300) throw new Error("Titles can be up to 300 characters.");
  checkRateLimit(user, "post");
  const post: StoredPost = {
    id: crypto.randomUUID(), community, communityIcon: data.communityIcon ?? "",
    author: user.username, authorId: user.id, authorFlair: profile(user.id).flair ?? null,
    title, body: data.body ?? "", flair: data.flair ?? null, flairColor: data.flairColor ?? null,
    votes: 1, comments: 0, awards: {}, milestones: [], createdAt: new Date().toISOString(), timeAgo: "just now",
  };
  savePosts([...posts(), post]);
  write("votes", { ...read("votes", {}), [`${post.id}:${user.id}`]: "up" });
  addGold(user.id, GOLD_POST, "posts");
  for (const m of membersMap()[community.toLowerCase()] ?? []) {
    if (m !== user.id) notify(m, { type: "community", text: `New in ${community}: ${title.slice(0, 90)}`, postId: String(post.id), community }, user.id);
  }
  return publicPost(post, user);
}

export async function votePost(token: string, postId: string, direction: VoteDir): Promise<VoteResult> {
  await delay(120);
  const user = requireUser(token, "Sign in to vote");
  const list = posts();
  const post = list.find(p => String(p.id) === postId);
  if (!post || post.removed) throw new Error("Post not found");
  const votes = read<Record<string, VoteDir>>("votes", {});
  const key = `${postId}:${user.id}`;
  const prev = votes[key];
  let newVote: VoteDir | null = direction;
  let delta: number;
  if (prev === direction) { delete votes[key]; delta = direction === "up" ? -1 : 1; newVote = null; }
  else { delta = direction === "up" ? (prev ? 2 : 1) : (prev ? -2 : -1); votes[key] = direction; }
  post.votes += delta;
  post.milestones = post.milestones ?? [];
  const hit = MILESTONES.filter(m => post.votes >= m && !post.milestones!.includes(m));
  if (hit.length && post.authorId) {
    post.milestones.push(...hit);
    notify(post.authorId, { type: "milestone", text: `Your post hit ${Math.max(...hit)} upvotes: ${post.title.slice(0, 80)}`, postId, community: post.community });
  }
  write("votes", votes);
  savePosts(list);
  if (newVote === "up" && post.authorId && post.authorId !== user.id && !isBotAuthor(post)) {
    const awarded = read<Record<string, true>>("goldAwarded", {});
    if (!awarded[key]) {
      awarded[key] = true;
      write("goldAwarded", awarded);
      addGold(post.authorId, GOLD_UPVOTE_RECEIVED, "votes");
    }
  }
  return { votes: post.votes, userVote: newVote };
}

export async function giveAward(token: string, postId: string, award: AwardKind) {
  await delay();
  const user = requireUser(token, "Sign in to give awards");
  const spec = AWARDS[award];
  if (!spec) throw new Error("Unknown award");
  const list = posts();
  const post = list.find(p => String(p.id) === postId);
  if (!post || post.removed) throw new Error("Post not found");
  if (!post.authorId || isBotAuthor(post)) throw new Error("Bot posts can't receive awards.");
  if (post.authorId === user.id) throw new Error("You can't give an award to your own post.");
  const gold = goldOf(user.id);
  if (goldBalance(gold) < spec.cost) throw new Error(`You need ${spec.cost} gold for this award. You have ${goldBalance(gold)}.`);
  gold.spent += spec.cost;
  saveGold(user.id, gold);
  addGold(post.authorId, spec.toAuthor, "awards");
  post.awards = { ...post.awards, [award]: (post.awards?.[award] ?? 0) + 1 };
  savePosts(list);
  notify(post.authorId, { type: "award", text: `${user.username} gave your post a ${spec.label} award (+${spec.toAuthor} gold)`, postId, community: post.community }, user.id);
  return { awards: post.awards, gold };
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function createComment(token: string, postId: string, body: string, parentId?: string | null): Promise<Comment> {
  await delay();
  const user = requireUser(token, "Sign in to comment");
  const text = body.trim();
  if (!text) throw new Error("Write something before posting.");
  const list = posts();
  const post = list.find(p => String(p.id) === postId);
  if (!post || post.removed) throw new Error("Post not found");
  const all = comments();
  const parent = parentId ? all.find(c => c.id === parentId) : null;
  if (parentId && !parent) throw new Error("The comment you're replying to was removed.");
  checkRateLimit(user, "comment");
  const comment: StoredComment = {
    id: crypto.randomUUID(), postId, parentId: parentId ?? null, author: user.username, authorId: user.id,
    authorFlair: profile(user.id).flair ?? null, body: text, votes: 1,
    createdAt: new Date().toISOString(), timeAgo: "just now",
  };
  saveComments([...all, comment]);
  post.comments += 1;
  savePosts(list);
  if (parent?.authorId && parent.authorId !== user.id) {
    notify(parent.authorId, { type: "reply", text: `${user.username} replied to your comment: ${text.slice(0, 80)}`, postId, community: post.community }, user.id);
  }
  if (post.authorId && post.authorId !== user.id && (!parent || parent.authorId !== post.authorId)) {
    notify(post.authorId, { type: "comment", text: `${user.username} commented on your post: ${text.slice(0, 80)}`, postId, community: post.community }, user.id);
  }
  return publicComment(comment);
}

export async function voteComment(token: string, commentId: string, direction: VoteDir): Promise<VoteResult> {
  await delay(100);
  const user = requireUser(token, "Sign in to vote");
  const all = comments();
  const cm = all.find(c => c.id === commentId);
  if (!cm || cm.removed) throw new Error("Comment not found");
  const votes = read<Record<string, VoteDir>>("cvotes", {});
  const key = `${commentId}:${user.id}`;
  const prev = votes[key];
  let newVote: VoteDir | null = direction;
  let delta: number;
  if (prev === direction) { delete votes[key]; delta = direction === "up" ? -1 : 1; newVote = null; }
  else { delta = direction === "up" ? (prev ? 2 : 1) : (prev ? -2 : -1); votes[key] = direction; }
  cm.votes += delta;
  write("cvotes", votes);
  saveComments(all);
  return { votes: cm.votes, userVote: newVote };
}

// ── Reports & moderation ──────────────────────────────────────────────────────

type ReportSum = {
  targetType: "post" | "comment"; targetId: string; postId: string; community: string;
  title: string; excerpt: string; author: string; reasons: Record<string, number>; reporters: string[]; resolved?: string;
};

export async function report(token: string, targetType: "post" | "comment", targetId: string, reason: ReportReason) {
  await delay();
  const user = requireUser(token, "Sign in to report");
  const sums = read<Record<string, ReportSum>>("reports", {});
  const key = `${targetType}:${targetId}`;
  const plist = posts();
  const clist = comments();
  const target: any = targetType === "post" ? plist.find(p => String(p.id) === targetId) : clist.find(c => c.id === targetId);
  if (!target || target.removed) throw new Error("That content no longer exists.");
  const post = targetType === "post" ? target : plist.find(p => String(p.id) === target.postId);
  const sum = sums[key] ?? {
    targetType, targetId, postId: String(post?.id ?? ""), community: post?.community ?? "",
    title: post?.title ?? "", excerpt: String(targetType === "post" ? (target.body || target.title) : target.body).slice(0, 200),
    author: target.author, reasons: {}, reporters: [],
  };
  if (sum.reporters.includes(user.id)) return { ok: true, alreadyReported: true };
  sum.reporters.push(user.id);
  sum.reasons[reason] = (sum.reasons[reason] ?? 0) + 1;
  sums[key] = sum;
  write("reports", sums);
  if (sum.reporters.length >= HIDE_AFTER_REPORTS && !target.hidden) {
    target.hidden = true;
    targetType === "post" ? savePosts(plist) : saveComments(clist);
  }
  return { ok: true, hidden: !!target.hidden };
}

export async function getModQueue(token: string, community: string): Promise<ModItem[]> {
  await delay();
  const user = userFromToken(token);
  if (!isModerator(user, community)) throw new Error("Only moderators can see this queue.");
  return Object.values(read<Record<string, ReportSum>>("reports", {}))
    .filter(s => s.community.toLowerCase() === community.toLowerCase() && !s.resolved)
    .map(s => ({
      targetType: s.targetType, targetId: s.targetId, postId: s.postId, community: s.community,
      title: s.title, excerpt: s.excerpt, author: s.author,
      reports: Object.entries(s.reasons).map(([reason, count]) => ({ reason: reason as ReportReason, count })),
      hidden: s.reporters.length >= HIDE_AFTER_REPORTS,
    }));
}

export async function moderate(token: string, targetType: "post" | "comment", targetId: string, action: "approve" | "remove") {
  await delay();
  const user = userFromToken(token);
  const sums = read<Record<string, ReportSum>>("reports", {});
  const sum = sums[`${targetType}:${targetId}`];
  if (!sum) throw new Error("Nothing to moderate");
  if (!isModerator(user, sum.community)) throw new Error("Only moderators can do this.");
  if (targetType === "post") {
    const list = posts();
    const p = list.find(x => String(x.id) === targetId);
    if (p) { if (action === "approve") p.hidden = false; else { p.removed = true; p.hidden = true; } savePosts(list); }
  } else {
    const list = comments();
    const cm = list.find(x => x.id === targetId);
    if (cm) {
      if (action === "approve") cm.hidden = false;
      else {
        cm.removed = true; cm.hidden = true;
        const pl = posts(); const p = pl.find(x => String(x.id) === cm.postId);
        if (p) { p.comments = Math.max(0, p.comments - 1); savePosts(pl); }
      }
      saveComments(list);
    }
  }
  sum.resolved = action;
  write("reports", sums);
  return { ok: true };
}

export async function getModerates(token: string): Promise<string[]> {
  const user = userFromToken(token);
  if (!user) return [];
  if (isPreviewAdmin(user)) return ["*"];
  return read<any[]>("communities", []).filter(c => c.founderId === user.id).map(c => c.name);
}

// ── Communities ───────────────────────────────────────────────────────────────

export type CommunityDTO = Community;

export async function getCommunities(): Promise<Community[]> {
  await delay();
  const m = membersMap();
  return read<any[]>("communities", []).map(({ founderId: _f, createdAt: _c, ...pub }) => ({
    ...pub, members: (m[pub.name.toLowerCase()] ?? []).length,
  }));
}

export async function getCommunityCounts(): Promise<Record<string, number>> {
  const m = membersMap();
  const names = read<Record<string, string>>("memberNames", {});
  return Object.fromEntries(Object.entries(m).map(([k, ids]) => [names[k] ?? k, ids.length]));
}

export async function createCommunity(token: string, data: { name: string; description?: string }): Promise<Community> {
  await delay();
  const user = requireUser(token, "Sign in to create a community");
  const clean = String(data.name ?? "").trim();
  if (!/^[A-Za-z0-9_]{3,21}$/.test(clean)) throw new Error("Community names need 3–21 letters, numbers or underscores, with no spaces.");
  const list = read<any[]>("communities", []);
  if (BUILTIN.includes(clean.toLowerCase()) || list.some(c => c.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`${clean} already exists. Try a different name.`);
  }
  const last = read<Record<string, number>>("lastCommunity", {});
  if (last[user.id] && Date.now() - last[user.id] < COMMUNITY_COOLDOWN_MS) {
    throw new Error("You can found one new community per day. Try again tomorrow.");
  }
  const community = {
    name: clean, icon: clean.slice(0, 2).toUpperCase(), kind: "user" as const,
    description: String(data.description ?? "").slice(0, 300) || "A new Threadit community.",
    color: "#2bb3a3", founderId: user.id, createdAt: new Date().toISOString(),
  };
  write("communities", [...list, community]);
  write("lastCommunity", { ...last, [user.id]: Date.now() });
  await setJoined(token, clean, true);
  addGold(user.id, GOLD_COMMUNITY, "communities");
  const { founderId: _f, createdAt: _c, ...pub } = community;
  return { ...pub, members: 1 };
}

export async function getMemberships(token: string): Promise<string[]> {
  const user = requireUser(token);
  return read<Record<string, string[]>>("memberships", {})[user.id] ?? [];
}

export async function setJoined(token: string, community: string, join: boolean) {
  const user = requireUser(token, "Sign in to join communities");
  const m = membersMap();
  const lower = community.toLowerCase();
  const ids = new Set(m[lower] ?? []);
  join ? ids.add(user.id) : ids.delete(user.id);
  m[lower] = [...ids];
  write("members", m);
  write("memberNames", { ...read("memberNames", {}), [lower]: community });
  const ms = read<Record<string, string[]>>("memberships", {});
  const mine = new Set(ms[user.id] ?? []);
  join ? mine.add(community) : mine.delete(community);
  ms[user.id] = [...mine];
  write("memberships", ms);
  return { members: ids.size, joined: [...mine] };
}

export async function getCommunityStats(): Promise<Record<string, number>> {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const counts: Record<string, number> = {};
  for (const p of posts()) {
    if (p.removed || new Date(p.createdAt).getTime() < since) continue;
    counts[p.community] = (counts[p.community] ?? 0) + 1;
  }
  return counts;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(token: string): Promise<AppNotification[]> {
  const user = requireUser(token);
  return read<Record<string, AppNotification[]>>("notifs", {})[user.id] ?? [];
}

export async function markNotificationsRead(token: string, ids?: string[]) {
  const user = requireUser(token);
  const all = read<Record<string, AppNotification[]>>("notifs", {});
  (all[user.id] ?? []).forEach(n => { if (!ids || ids.includes(n.id)) n.read = true; });
  write("notifs", all);
  return { ok: true };
}

// ── Pins (not used by the app yet; kept so imports match) ────────────────────

export async function getPins() { return read<any[]>("pins", []); }
export async function createPin(token: string, data: any) {
  const user = requireUser(token);
  const pin = { id: crypto.randomUUID(), ...data, author: user.username, authorId: user.id, votes: 1, createdAt: new Date().toISOString() };
  write("pins", [...read<any[]>("pins", []), pin]);
  return pin;
}
export async function editPin(token: string, id: string, data: any) {
  const user = requireUser(token);
  const pins = read<any[]>("pins", []);
  const pin = pins.find(p => p.id === id);
  if (!pin) throw new Error("Pin not found");
  if (pin.authorId !== user.id) throw new Error("You can only edit your own pins");
  Object.assign(pin, data);
  write("pins", pins);
  return pin;
}
export async function deletePin(token: string, id: string) {
  const user = requireUser(token);
  const pins = read<any[]>("pins", []);
  if (!pins.some(p => p.id === id && p.authorId === user.id)) throw new Error("Pin not found");
  write("pins", pins.filter(p => p.id !== id));
  return { success: true };
}

// ── Gold & profile ────────────────────────────────────────────────────────────

export async function getGold(token: string): Promise<Gold> {
  await delay(60);
  return goldOf(requireUser(token).id);
}

export async function setProfileFlair(token: string, flair: string | null) {
  await delay();
  const user = requireUser(token, "Sign in to buy flair");
  const prof = profile(user.id);
  if (flair === null) { saveProfile(user.id, { ...prof, flair: null }); return { flair: null, gold: goldOf(user.id) }; }
  if (!PROFILE_FLAIRS.includes(flair)) throw new Error("Choose a flair from the shop.");
  const owned = prof.owned ?? [];
  const gold = goldOf(user.id);
  if (!owned.includes(flair)) {
    if (goldBalance(gold) < PROFILE_FLAIR_COST) throw new Error(`You need ${PROFILE_FLAIR_COST} gold for this flair. You have ${goldBalance(gold)}.`);
    gold.spent += PROFILE_FLAIR_COST;
    saveGold(user.id, gold);
    owned.push(flair);
  }
  saveProfile(user.id, { flair, owned });
  return { flair, owned, gold };
}

export async function getProfile(token: string) {
  const user = requireUser(token);
  const prof = profile(user.id);
  return {
    userId: user.id, username: user.username, email: user.email, gold: goldOf(user.id),
    flair: prof.flair ?? null, flairsOwned: prof.owned ?? [], isAdmin: isPreviewAdmin(user),
  };
}

// ── Bots ──────────────────────────────────────────────────────────────────────
// The same bot engine as the server (supabase/functions/server/bots.ts), run
// against this browser's data. The preview can't reach news sites, so only the
// discussion, welcome and unanswered-question bots run here.

const previewBotStore: BotStore = {
  async listPosts() { return posts() as unknown as BotPost[]; },
  async savePost(p) {
    const list = posts();
    const i = list.findIndex(x => String(x.id) === p.id);
    const stored = { ...(p as unknown as StoredPost), timeAgo: "just now" };
    if (i >= 0) list[i] = { ...list[i], ...stored }; else list.push(stored);
    savePosts(list);
  },
  async addComment(c) { saveComments([...comments(), { ...c, timeAgo: "just now" }]); },
  async notify(userId, n) { notify(userId, n as Omit<AppNotification, "id" | "createdAt" | "read">); },
  async getFlag(k) { return read<Record<string, string>>("botflags", {})[k] ?? null; },
  async setFlag(k, v) { write("botflags", { ...read<Record<string, string>>("botflags", {}), [k]: v }); },
};

function requireAdmin(token: string | null | undefined) {
  const user = userFromToken(token);
  if (!isPreviewAdmin(user)) throw new Error("Only admins can manage bots. In the preview, that's the first account created in this browser.");
  return user!;
}

export async function runBots(token: string, jobs?: BotJob[]): Promise<BotRunReport> {
  await delay();
  requireAdmin(token);
  ensureRecurringThreads();
  const allowed: BotJob[] = ["gist", "welcome", "helper"];
  return runBotEngine({ store: previewBotStore }, (jobs ?? allowed).filter(j => allowed.includes(j)));
}

export async function getBotStatus(token: string): Promise<BotStatus> {
  requireAdmin(token);
  const flags = read<Record<string, string>>("botflags", {});
  return {
    paused: flags["bots:paused"] === "1",
    enabled: true,
    summaries: false,
    canFetchNews: false,
    history: JSON.parse(flags["bots:history"] ?? "[]"),
  };
}

export async function setBotsPaused(token: string, paused: boolean) {
  requireAdmin(token);
  await previewBotStore.setFlag("bots:paused", paused ? "1" : "0");
  return { paused };
}

export type { BotJob };

// ── Editing and deleting your own posts and comments ─────────────────────────

export async function editPost(token: string, postId: string, changes: { title?: string; body?: string; flair?: string | null; flairColor?: string | null }): Promise<Post> {
  await delay();
  const user = requireUser(token, "Sign in to edit");
  const list = posts();
  const post = list.find(p => String(p.id) === postId);
  if (!post || post.removed) throw new Error("Post not found");
  if (post.authorId !== user.id) throw new Error("You can only edit your own posts.");
  if (changes.title !== undefined && changes.title.trim() !== post.title) {
    if (Date.now() - new Date(post.createdAt).getTime() > TITLE_EDIT_WINDOW_MS) {
      throw new Error("Titles can only be changed in the first 15 minutes. You can still edit the text.");
    }
    if (!changes.title.trim() || changes.title.length > 300) throw new Error("Titles need 1–300 characters.");
    post.title = changes.title.trim();
  }
  if (changes.body !== undefined) post.body = changes.body;
  if (changes.flair !== undefined) { post.flair = changes.flair || null; post.flairColor = changes.flair ? changes.flairColor ?? null : null; }
  post.editedAt = new Date().toISOString();
  savePosts(list);
  return publicPost(post, user);
}

export async function deletePost(token: string, postId: string) {
  await delay();
  const user = requireUser(token, "Sign in to delete");
  const list = posts();
  const post = list.find(p => String(p.id) === postId);
  if (!post || post.removed) throw new Error("Post not found");
  if (post.authorId !== user.id) throw new Error("You can only delete your own posts.");
  post.removed = true;
  savePosts(list);
  return { ok: true };
}

export async function editComment(token: string, commentId: string, body: string): Promise<Comment> {
  await delay();
  const user = requireUser(token, "Sign in to edit");
  const all = comments();
  const cm = all.find(c => c.id === commentId);
  if (!cm || cm.removed || cm.deleted) throw new Error("Comment not found");
  if (cm.authorId !== user.id) throw new Error("You can only edit your own comments.");
  if (!body.trim()) throw new Error("Comments need 1–10,000 characters.");
  cm.body = body.trim();
  cm.editedAt = new Date().toISOString();
  saveComments(all);
  return publicComment(cm);
}

export async function deleteComment(token: string, commentId: string) {
  await delay();
  const user = requireUser(token, "Sign in to delete");
  const all = comments();
  const cm = all.find(c => c.id === commentId);
  if (!cm || cm.removed || cm.deleted) throw new Error("Comment not found");
  if (cm.authorId !== user.id) throw new Error("You can only delete your own comments.");
  const hasReplies = all.some(c => c.parentId === commentId && !c.removed);
  if (hasReplies) { cm.deleted = true; cm.body = ""; }
  else {
    cm.removed = true;
    const pl = posts(); const p = pl.find(x => String(x.id) === cm.postId);
    if (p) { p.comments = Math.max(0, p.comments - 1); savePosts(pl); }
  }
  saveComments(all);
  return { ok: true, placeholder: hasReplies };
}

// ── Profiles, blocking, search ────────────────────────────────────────────────

export async function getUser(username: string, token?: string | null): Promise<UserProfile> {
  await delay();
  const target = bareName(username).toLowerCase();
  const viewer = userFromToken(token);
  const id = userIdFor(target);
  const bot = Object.values(BOTS).find(b => b.name.toLowerCase() === target);
  const mine = posts().filter(p => !p.removed && !p.hidden && bareName(p.author).toLowerCase() === target)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cms = comments().filter(c => !c.removed && !c.deleted && !c.hidden && bareName(c.author).toLowerCase() === target)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
  if (!id && !mine.length && !cms.length) throw new Error("No one has that username.");
  const account = Object.values(users()).find(u => u.id === id);
  const g = id && !bot ? goldOf(id) : EMPTY_GOLD;
  const plist = posts();
  return {
    username: bareName(account?.username ?? bot?.name ?? mine[0]?.author ?? cms[0]?.author ?? target),
    isBot: !!bot,
    flair: id ? profile(id).flair ?? null : null,
    joinedAt: account?.createdAt ?? null,
    goldEarned: g.posts + g.votes + g.communities + g.awards,
    postCount: mine.length,
    commentCount: cms.length,
    blockedByMe: !!(viewer && id && blockedIds(viewer.id).has(id)),
    isMe: !!(viewer && id === viewer.id),
    posts: mine.slice(0, 50).map(p => publicPost(p, viewer)),
    comments: cms.map(c => {
      const post = plist.find(p => String(p.id) === c.postId);
      return { ...publicComment(c), postTitle: post?.title ?? "", postCommunity: post?.community ?? "" };
    }).filter(c => c.postTitle),
  };
}

export async function getBlocks(token: string) {
  return blocksOf(requireUser(token).id);
}

export async function setBlocked(token: string, username: string, block: boolean) {
  await delay();
  const user = requireUser(token, "Sign in to block people");
  const name = bareName(username);
  const id = userIdFor(name);
  if (!id) throw new Error("No one has that username.");
  if (id === user.id) throw new Error("You can't block yourself.");
  const all = read<Record<string, BlockEntry[]>>("blocks", {});
  const list = (all[user.id] ?? []).filter(b => b.id !== id);
  if (block) list.push({ id, username: name });
  all[user.id] = list;
  write("blocks", all);
  return list;
}

export async function search(q: string, token?: string | null, community?: string): Promise<Post[]> {
  await delay(120);
  const query = q.trim().toLowerCase().replace(/^#/, "");
  if (query.length < 2) return [];
  const viewer = userFromToken(token);
  const blocked = blockedIds(viewer?.id);
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 8);
  return posts()
    .filter(p => !p.removed && !p.hidden && !blocked.has(String(p.authorId)))
    .filter(p => !community || p.community.toLowerCase() === community.toLowerCase())
    .map(p => {
      const title = p.title.toLowerCase(), body = (p.body ?? "").toLowerCase(), comm = p.community.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 3;
        else if (body.includes(t)) score += 1;
        else if (comm.includes(t)) score += 1;
        else return { p, score: 0 };
      }
      if (title.includes(query)) score += 3;
      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.createdAt.localeCompare(a.p.createdAt))
    .slice(0, 40)
    .map(x => publicPost(x.p, viewer));
}

// ── Your account ──────────────────────────────────────────────────────────────

export async function exportAccount(token: string) {
  await delay();
  const user = requireUser(token);
  return {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt },
    profile: profile(user.id),
    gold: goldOf(user.id),
    communitiesJoined: read<Record<string, string[]>>("memberships", {})[user.id] ?? [],
    blockedUsers: blocksOf(user.id).map(b => b.username),
    posts: posts().filter(p => p.authorId === user.id).map(p => ({ id: p.id, community: p.community, title: p.title, body: p.body, createdAt: p.createdAt, editedAt: p.editedAt ?? null, deleted: !!p.removed })),
    comments: comments().filter(c => c.authorId === user.id).map(c => ({ id: c.id, postId: c.postId, body: c.body, createdAt: c.createdAt, editedAt: c.editedAt ?? null, deleted: !!(c.removed || c.deleted) })),
    notifications: read<Record<string, AppNotification[]>>("notifs", {})[user.id] ?? [],
  };
}

export async function deleteAccount(token: string, deleteContent: boolean, confirm: string) {
  await delay();
  const user = requireUser(token);
  if (confirm.toLowerCase() !== "delete") throw new Error('Type "delete" to confirm.');
  const pl = posts();
  for (const p of pl) if (p.authorId === user.id) {
    if (deleteContent) p.removed = true;
    p.author = "[deleted]"; p.authorId = undefined; p.authorFlair = null;
  }
  savePosts(pl);
  const cl = comments();
  for (const c of cl) if (c.authorId === user.id) {
    c.author = "[deleted]"; c.authorId = undefined; c.authorFlair = null;
    if (deleteContent) { c.deleted = true; c.body = ""; }
  }
  saveComments(cl);
  const votes = read<Record<string, VoteDir>>("votes", {});
  for (const k of Object.keys(votes)) if (k.endsWith(`:${user.id}`)) delete votes[k];
  write("votes", votes);
  const m = membersMap();
  for (const k of Object.keys(m)) m[k] = m[k].filter(i => i !== user.id);
  write("members", m);
  for (const key of ["gold", "profiles", "notifs", "memberships", "blocks"]) {
    const all = read<Record<string, unknown>>(key, {});
    delete all[user.id];
    write(key, all);
  }
  const all = users();
  delete all[user.email];
  write("users", all);
  const { supabase } = await import("./supabase");
  await supabase.auth.signOut();
  return { ok: true };
}
