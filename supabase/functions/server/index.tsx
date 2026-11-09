import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";
import { runBots, isBotAuthor, bareName, BOTS, parseFeedList, type BotStore, type BotJob } from "./bots.ts";

const app = new Hono();
const PREFIX = "/make-server-8937b06c";

app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

// Admin Supabase client (server-side only — never expose service role key to frontend)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Sign-up protection
const SIGNUPS_PER_IP_PER_HOUR = 5;
const MIN_SIGNUP_FORM_MS = 2500;             // faster than this is almost certainly a script
const TITLE_EDIT_WINDOW_MS = 15 * 60 * 1000; // titles can be fixed for 15 minutes; bodies any time

// ─── Rules ────────────────────────────────────────────────────────────────────
// Gold (the only place gold is awarded or spent):
//   +10 publishing a post
//   +1  to the post's AUTHOR per upvote, once per voter per post, never your own
//   +50 founding a community (one new community per user per 24 hours)
//   Awards: the giver pays the cost, the author receives part of it
//   Profile flair costs 150 gold
const GOLD_POST = 10;
const GOLD_UPVOTE_RECEIVED = 1;
const GOLD_COMMUNITY = 50;
const COMMUNITY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const AWARDS = {
  helpful: { label: "Helpful", cost: 20, toAuthor: 10 },
  gold: { label: "Gold", cost: 100, toAuthor: 50 },
} as const;
const PROFILE_FLAIRS = ["Eko Native", "Corper", "Techie", "Naija Abroad", "Foodie", "Football Head", "Campus Gist", "Owambe Royalty"];
const PROFILE_FLAIR_COST = 150;
const MILESTONES = [10, 50, 100, 500, 1000];

// Moderation
const HIDE_AFTER_REPORTS = 3;            // distinct reporters
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;
const DAILY_LIMITS = {                   // per user per day
  post: { newAccount: 3, regular: 20 },
  comment: { newAccount: 20, regular: 300 },
};
const REPORT_REASONS = ["scam", "hate", "misinformation", "spam", "harassment", "other"];
// Comma-separated emails or usernames with moderator rights everywhere.
// Set THREADIT_ADMINS in the Supabase function's environment variables.
const ADMINS = (Deno.env.get("THREADIT_ADMINS") ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// Community activity notifications: at most one per community per user per 6 hours
const COMMUNITY_NOTIFY_THROTTLE_MS = 6 * 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 100;

// Built-in communities users can't re-create (kept in step with src/app/data.ts)
const BUILTIN_COMMUNITY_NAMES = [
  "nigeria", "naija", "asknaija", "technigeria", "nysc", "jobs", "japa", "nollywood", "supereagles", "owambe", "naijafood",
  "abuja", "abia", "adamawa", "akwaibom", "anambra", "bauchi", "bayelsa", "benue", "borno", "crossriver", "delta", "ebonyi",
  "edo", "ekiti", "enugu", "gombe", "imo", "jigawa", "kaduna", "kano", "katsina", "kebbi", "kogi", "kwara", "lagos",
  "nasarawa", "niger", "ogun", "ondo", "osun", "oyo", "plateau", "rivers", "sokoto", "taraba", "yobe", "zamfara",
  "unilag", "ui", "oau", "unn", "abu", "uniben", "lasu", "futa", "covenant",
];

const BOT_AUTHOR = BOTS.threadit.name;

type Gold = { posts: number; votes: number; communities: number; awards: number; spent: number };
const EMPTY_GOLD: Gold = { posts: 0, votes: 0, communities: 0, awards: 0, spent: 0 };
const balance = (g: Gold) => g.posts + g.votes + g.communities + g.awards - g.spent;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthedUser(c: any) {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (!token) return null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) return null;
    return user ?? null;
  } catch (e) {
    console.log("getAuthedUser error:", e);
    return null;
  }
}

function usernameFrom(user: any): string {
  return bareName(user.user_metadata?.username ?? user.email?.split("@")[0] ?? "anon");
}

const isAdmin = (user: any) =>
  !!user && (ADMINS.includes(String(user.email ?? "").toLowerCase()) || ADMINS.includes(usernameFrom(user).toLowerCase()));

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const cleanName = (s: unknown) => String(s ?? "").replace(/^r\//i, "").trim();
const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};
const parseAll = (rows: string[]) => rows.map(r => parse<any>(r, null)).filter(Boolean);

async function getGold(userId: string): Promise<Gold> {
  return { ...EMPTY_GOLD, ...parse<Partial<Gold>>(await kv.get(`gold:${userId}`), {}) };
}

async function addGold(userId: string, amount: number, type: keyof Gold) {
  try {
    const g = await getGold(userId);
    g[type] = (g[type] ?? 0) + amount;
    await kv.set(`gold:${userId}`, JSON.stringify(g));
    return g;
  } catch (e) {
    console.log("addGold error:", e);
    return null;
  }
}

async function getProfile(userId: string) {
  return parse<{ flair?: string | null }>(await kv.get(`profile:${userId}`), {});
}

type BlockEntry = { id: string; username: string };
async function getBlocks(userId: string): Promise<BlockEntry[]> {
  return parse<BlockEntry[]>(await kv.get(`blocks:${userId}`), []).map(b => ({ ...b, username: bareName(b.username) }));
}
async function blockedIds(userId?: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  return new Set((await getBlocks(userId)).map(b => b.id));
}

const BOT_IDS: Record<string, string> = Object.fromEntries(Object.values(BOTS).map(b => [b.name.toLowerCase(), b.id]));
const sameName = (a: unknown, b: unknown) => bareName(a).toLowerCase() === bareName(b).toLowerCase();

/** Finds a user id from a username (bots included; an old "u/" prefix is ignored) */
async function userIdFor(username: string): Promise<string | null> {
  const handle = bareName(username).toLowerCase();
  if (BOT_IDS[handle]) return BOT_IDS[handle];
  const id = await kv.get(`usernameTaken:${handle}`);
  if (id) return id;
  // Accounts created before usernames were reserved: find one of their posts or comments
  const post = parseAll(await kv.getByPrefix("post:")).find((p: any) => sameName(p.author, handle) && p.authorId);
  if (post) return post.authorId;
  const cm = parseAll(await kv.getByPrefix("comment:")).find((x: any) => sameName(x.author, handle) && x.authorId);
  return cm?.authorId ?? null;
}

async function notify(userId: string, n: { type: string; text: string; postId?: string; community?: string }, actorId?: string) {
  if (!userId || userId.startsWith("bot:")) return;
  if (actorId && (await blockedIds(userId)).has(actorId)) return; // they blocked this person
  try {
    const list = parse<any[]>(await kv.get(`notifs:${userId}`), []);
    list.unshift({ id: crypto.randomUUID(), ...n, createdAt: new Date().toISOString(), read: false });
    await kv.set(`notifs:${userId}`, JSON.stringify(list.slice(0, MAX_NOTIFICATIONS)));
  } catch (e) {
    console.log("notify error:", e);
  }
}

// Daily rate limit. Returns an error message when the user is over the limit.
async function checkRateLimit(user: any, kind: keyof typeof DAILY_LIMITS): Promise<string | null> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${kind}:${user.id}:${day}`;
  const count = Number(await kv.get(key) ?? 0);
  const isNew = Date.now() - new Date(user.created_at ?? 0).getTime() < NEW_ACCOUNT_MS;
  const limit = isNew ? DAILY_LIMITS[kind].newAccount : DAILY_LIMITS[kind].regular;
  if (count >= limit) {
    return isNew
      ? `New accounts can make ${limit} ${kind}s a day while we check for spam. Try again tomorrow.`
      : `You've reached today's limit of ${limit} ${kind}s. Try again tomorrow.`;
  }
  await kv.set(key, String(count + 1));
  return null;
}

async function isModerator(user: any, community: string): Promise<boolean> {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const comm = parse<any>(await kv.get(`community:${community.toLowerCase()}`), null);
  return !!comm && comm.founderId === user.id;
}

async function members(community: string): Promise<string[]> {
  return parse<{ ids: string[] }>(await kv.get(`members:${community.toLowerCase()}`), { ids: [] }).ids ?? [];
}

// ─── Recurring threads ────────────────────────────────────────────────────────
// Created on demand the first time the feed is loaded in a new week or month.

function weekStart(d = new Date()) {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return start;
}

async function ensureRecurringThreads() {
  const now = new Date();
  const ws = weekStart(now);
  const weekLabel = ws.toLocaleDateString("en-NG", { day: "numeric", month: "long", timeZone: "UTC" });
  const monthLabel = now.toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
  const threads = [
    {
      key: `fuel:${ws.toISOString().slice(0, 10)}`,
      community: "Nigeria",
      title: `Weekly fuel price check-in: what are you paying? (week of ${weekLabel})`,
      body: "Share your state, city, filling station and the price per litre you paid this week. Include the date so others can compare.",
      flair: "Discussion", flairColor: "#a66bff",
    },
    {
      key: `nysc:${now.toISOString().slice(0, 7)}`,
      community: "NYSC",
      title: `NYSC questions thread: postings, camp and PPA (${monthLabel})`,
      body: "Ask anything about call-up letters, camp, redeployment, PPA and allowances. Corpers and ex-corpers, share what you know.",
      flair: "Ask", flairColor: "#2fb37f",
    },
  ];
  for (const t of threads) {
    if (await kv.get(`recurring:${t.key}`)) continue;
    const id = crypto.randomUUID();
    const post = {
      id, community: t.community, communityIcon: "", author: BOT_AUTHOR, authorId: BOTS.threadit.id, isBot: true, authorFlair: null,
      title: t.title, body: t.body, flair: t.flair, flairColor: t.flairColor,
      votes: 1, comments: 0, pinned: true, createdAt: now.toISOString(), recurring: t.key,
    };
    await kv.set(`recurring:${t.key}`, id);
    await kv.set(`post:${id}`, JSON.stringify(post));
    // Unpin last period's thread of the same kind
    const kind = t.key.split(":")[0];
    const lastId = await kv.get(`recurringLatest:${kind}`);
    if (lastId) {
      const last = parse<any>(await kv.get(`post:${lastId}`), null);
      if (last) { last.pinned = false; await kv.set(`post:${lastId}`, JSON.stringify(last)); }
    }
    await kv.set(`recurringLatest:${kind}`, id);
  }
}

// Shape a stored post for clients
function publicPost(p: any) {
  return {
    id: p.id, community: cleanName(p.community), communityIcon: p.communityIcon ?? "",
    author: bareName(p.author), authorId: p.authorId ?? null, authorFlair: p.authorFlair ?? null, isBot: isBotAuthor(p),
    title: p.title, body: p.body ?? "", images: p.images ?? undefined,
    flair: p.flair ?? null, flairColor: p.flairColor ?? null,
    votes: p.votes ?? 0, comments: p.comments ?? 0, pinned: !!p.pinned,
    hidden: !!p.hidden, awards: p.awards ?? {},
    createdAt: p.createdAt, timeAgo: timeAgo(p.createdAt),
    editedAt: p.editedAt ?? undefined,
  };
}

function publicComment(cm: any) {
  return {
    id: cm.id, postId: cm.postId, parentId: cm.parentId ?? null,
    author: cm.deleted ? "[deleted]" : bareName(cm.author), authorId: cm.deleted ? null : cm.authorId,
    authorFlair: cm.deleted ? null : cm.authorFlair ?? null, isBot: !cm.deleted && isBotAuthor(cm),
    body: cm.hidden || cm.deleted ? "" : cm.body, hidden: !!cm.hidden, deleted: !!cm.deleted,
    votes: cm.votes ?? 0, createdAt: cm.createdAt, timeAgo: timeAgo(cm.createdAt),
    editedAt: cm.editedAt ?? undefined,
  };
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get(`${PREFIX}/health`, (c) => c.json({ status: "ok" }));

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Sign up. Sends Supabase's confirmation email when "Confirm email" is on in
// the project's Auth settings (recommended). Protected by a hidden form field,
// a minimum fill time, a per-IP hourly limit and, optionally, Cloudflare Turnstile.
app.post(`${PREFIX}/auth/signup`, async (c) => {
  try {
    const { email, password, username, website, formMs, captchaToken, redirectTo } = await c.req.json();
    if (!email || !password || !username) {
      return c.json({ error: "Email, password and username are all required." }, 400);
    }
    // Bots fill in hidden fields and submit instantly; people don't
    if (website || (typeof formMs === "number" && formMs < MIN_SIGNUP_FORM_MS)) {
      return c.json({ error: "Something went wrong. Wait a moment and try again." }, 400);
    }
    const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const hourKey = `rl:signup:${ip}:${new Date().toISOString().slice(0, 13)}`;
    const attempts = Number(await kv.get(hourKey) ?? 0);
    if (attempts >= SIGNUPS_PER_IP_PER_HOUR) {
      return c.json({ error: "Too many sign-ups from this network. Try again in an hour." }, 429);
    }
    await kv.set(hourKey, String(attempts + 1));

    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (turnstileSecret) {
      const form = new FormData();
      form.append("secret", turnstileSecret);
      form.append("response", String(captchaToken ?? ""));
      if (ip !== "unknown") form.append("remoteip", ip);
      const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
        .then(r => r.json()).catch(() => ({ success: false }));
      if (!v.success) return c.json({ error: "Please complete the check that you're not a robot." }, 400);
    }

    const handle = String(username).replace(/^u\//i, "");
    if (!/^[A-Za-z0-9_]{3,30}$/.test(handle)) {
      return c.json({ error: "Usernames need 3–30 letters, numbers or underscores." }, 400);
    }
    if (BOT_IDS[handle.toLowerCase()] || ["deleted", "admin", "threadit", "moderator"].includes(handle.toLowerCase())) {
      return c.json({ error: "That username is reserved. Try another." }, 409);
    }
    if (await kv.get(`usernameTaken:${handle.toLowerCase()}`)) {
      return c.json({ error: "That username is taken. Try another." }, 409);
    }
    if (String(password).length < 8) return c.json({ error: "Use a password of at least 8 characters." }, 400);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: handle },
        emailRedirectTo: typeof redirectTo === "string" ? redirectTo : Deno.env.get("THREADIT_SITE_URL") ?? undefined,
      },
    });
    if (error) return c.json({ error: `Sign-up failed: ${error.message}` }, 400);
    const userId = data.user?.id;
    if (!userId) return c.json({ error: "Sign-up failed. Try again." }, 400);
    // Supabase returns a user with no identities when the email is already registered
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return c.json({ error: "An account with this email already exists. Sign in, or reset your password." }, 409);
    }

    await Promise.all([
      kv.set(`gold:${userId}`, JSON.stringify(EMPTY_GOLD)),
      kv.set(`username:${userId}`, handle),
      kv.set(`usernameTaken:${handle.toLowerCase()}`, userId),
    ]);
    return c.json({ userId, username: handle, needsConfirmation: !data.session }, 201);
  } catch (e) {
    console.log("Signup error:", e);
    return c.json({ error: `Server error during signup: ${e}` }, 500);
  }
});

// ─── Posts ────────────────────────────────────────────────────────────────────

// List posts. ?community=Lagos to filter. Hidden posts show only to their author.
app.get(`${PREFIX}/posts`, async (c) => {
  try {
    await ensureRecurringThreads();
    const user = await getAuthedUser(c);
    const blocked = await blockedIds(user?.id);
    const community = cleanName(c.req.query("community")).toLowerCase();
    const posts = parseAll(await kv.getByPrefix("post:"))
      .filter((p: any) => !p.removed)
      .filter((p: any) => !blocked.has(p.authorId))
      .filter((p: any) => !p.hidden || (user && p.authorId === user.id))
      .filter((p: any) => !community || cleanName(p.community).toLowerCase() === community)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(publicPost);

    if (user) {
      const votes = await Promise.all(posts.map((p: any) => kv.get(`vote:${p.id}:${user.id}`)));
      posts.forEach((p: any, i: number) => { p.userVote = votes[i] ?? null; });
    }
    return c.json(posts);
  } catch (e) {
    console.log("Get posts error:", e);
    return c.json({ error: `Error fetching posts: ${e}` }, 500);
  }
});

// One post with its comments (used by post pages and the Next.js site)
app.get(`${PREFIX}/posts/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    const p = parse<any>(await kv.get(`post:${id}`), null);
    if (!p || p.removed) return c.json({ error: "This post doesn't exist or was removed." }, 404);
    const user = await getAuthedUser(c);
    const blocked = await blockedIds(user?.id);
    const post = publicPost(p) as any;
    if (user) post.userVote = (await kv.get(`vote:${id}:${user.id}`)) ?? null;
    if (blocked.has(p.authorId)) post.blocked = true;
    const comments = parseAll(await kv.getByPrefix(`comment:${id}:`))
      .filter((cm: any) => !cm.removed)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((cm: any) => {
        const out: any = publicComment(cm);
        // Keep the thread shape, but don't show what blocked people wrote
        if (blocked.has(cm.authorId)) { out.blocked = true; out.body = ""; }
        return out;
      });
    return c.json({ post, comments });
  } catch (e) {
    console.log("Get post error:", e);
    return c.json({ error: `Error fetching post: ${e}` }, 500);
  }
});

app.post(`${PREFIX}/posts`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to create a post" }, 401);

    const { community, communityIcon, title, body, flair, flairColor } = await c.req.json();
    const cleanCommunity = cleanName(community);
    const cleanTitle = String(title ?? "").trim();
    if (!cleanCommunity || !cleanTitle) return c.json({ error: "Choose a community and write a title." }, 400);
    if (cleanTitle.length > 300) return c.json({ error: "Titles can be up to 300 characters." }, 400);
    if (String(body ?? "").length > 20000) return c.json({ error: "Posts can be up to 20,000 characters." }, 400);

    const limited = await checkRateLimit(user, "post");
    if (limited) return c.json({ error: limited }, 429);

    const profile = await getProfile(user.id);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const post = {
      id, community: cleanCommunity,
      communityIcon: communityIcon ?? "",
      author: usernameFrom(user),
      authorId: user.id,
      authorFlair: profile.flair ?? null,
      title: cleanTitle,
      body: String(body ?? ""),
      flair: flair ?? null,
      flairColor: flairColor ?? null,
      votes: 1,
      comments: 0,
      awards: {},
      milestones: [],
      createdAt: now,
    };

    await kv.set(`post:${id}`, JSON.stringify(post));
    await kv.set(`vote:${id}:${user.id}`, "up"); // authors start upvoted, like Reddit
    await addGold(user.id, GOLD_POST, "posts");

    // Tell members of the community, at most once per 6 hours each
    const memberIds = (await members(cleanCommunity)).filter(m => m !== user.id).slice(0, 500);
    await Promise.all(memberIds.map(async (m) => {
      const tKey = `throttle:${cleanCommunity.toLowerCase()}:${m}`;
      const last = Number(await kv.get(tKey) ?? 0);
      if (Date.now() - last < COMMUNITY_NOTIFY_THROTTLE_MS) return;
      await kv.set(tKey, String(Date.now()));
      await notify(m, { type: "community", text: `New in ${cleanCommunity}: ${cleanTitle.slice(0, 90)}`, postId: id, community: cleanCommunity }, user.id);
    }));

    return c.json(publicPost(post), 201);
  } catch (e) {
    console.log("Create post error:", e);
    return c.json({ error: `Error creating post: ${e}` }, 500);
  }
});

// Upvote / downvote a post
app.post(`${PREFIX}/posts/:id/vote`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to vote" }, 401);

    const postId = c.req.param("id");
    const { direction } = await c.req.json<{ direction: "up" | "down" }>();
    if (direction !== "up" && direction !== "down") {
      return c.json({ error: "direction must be 'up' or 'down'" }, 400);
    }

    const post = parse<any>(await kv.get(`post:${postId}`), null);
    if (!post || post.removed) return c.json({ error: "Post not found" }, 404);

    const voteKey = `vote:${postId}:${user.id}`;
    const prev = await kv.get(voteKey);

    let delta = 0;
    let newVote: string | null = direction;
    if (prev === direction) {
      await kv.del(voteKey);
      delta = direction === "up" ? -1 : 1;
      newVote = null;
    } else {
      delta = direction === "up" ? (prev ? 2 : 1) : (prev ? -2 : -1);
      await kv.set(voteKey, direction);
    }

    post.votes = (post.votes ?? 0) + delta;

    // Upvote milestones notify the author once each
    post.milestones = post.milestones ?? [];
    const hit = MILESTONES.filter(m => post.votes >= m && !post.milestones.includes(m));
    if (hit.length && post.authorId) {
      post.milestones.push(...hit);
      const top = Math.max(...hit);
      await notify(post.authorId, { type: "milestone", text: `Your post hit ${top} upvotes: ${String(post.title).slice(0, 80)}`, postId, community: post.community });
    }
    await kv.set(`post:${postId}`, JSON.stringify(post));

    // Gold goes to the author, once per voter per post, never for your own post
    if (newVote === "up" && post.authorId && post.authorId !== user.id && !isBotAuthor(post)) {
      const awardKey = `goldAwarded:${postId}:${user.id}`;
      if (!(await kv.get(awardKey))) {
        await kv.set(awardKey, "1");
        await addGold(post.authorId, GOLD_UPVOTE_RECEIVED, "votes");
      }
    }

    return c.json({ votes: post.votes, userVote: newVote });
  } catch (e) {
    console.log("Vote error:", e);
    return c.json({ error: `Error voting: ${e}` }, 500);
  }
});

// Give an award: the giver pays, the author receives part of it
app.post(`${PREFIX}/posts/:id/award`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to give awards" }, 401);
    const postId = c.req.param("id");
    const { award } = await c.req.json<{ award: keyof typeof AWARDS }>();
    const spec = AWARDS[award];
    if (!spec) return c.json({ error: "Unknown award" }, 400);

    const post = parse<any>(await kv.get(`post:${postId}`), null);
    if (!post || post.removed) return c.json({ error: "Post not found" }, 404);
    if (!post.authorId || isBotAuthor(post)) return c.json({ error: "Bot posts can't receive awards." }, 400);
    if (post.authorId === user.id) return c.json({ error: "You can't give an award to your own post." }, 400);

    const gold = await getGold(user.id);
    if (balance(gold) < spec.cost) {
      return c.json({ error: `You need ${spec.cost} gold for this award. You have ${balance(gold)}.` }, 402);
    }
    gold.spent += spec.cost;
    await kv.set(`gold:${user.id}`, JSON.stringify(gold));
    await addGold(post.authorId, spec.toAuthor, "awards");

    post.awards = post.awards ?? {};
    post.awards[award] = (post.awards[award] ?? 0) + 1;
    await kv.set(`post:${postId}`, JSON.stringify(post));
    await notify(post.authorId, {
      type: "award",
      text: `${usernameFrom(user)} gave your post a ${spec.label} award (+${spec.toAuthor} gold)`,
      postId, community: post.community,
    }, user.id);
    return c.json({ awards: post.awards, gold });
  } catch (e) {
    console.log("Award error:", e);
    return c.json({ error: `Error giving award: ${e}` }, 500);
  }
});

// ─── Comments ─────────────────────────────────────────────────────────────────

app.post(`${PREFIX}/posts/:id/comments`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to comment" }, 401);
    const postId = c.req.param("id");
    const { body, parentId } = await c.req.json<{ body: string; parentId?: string | null }>();
    const text = String(body ?? "").trim();
    if (!text) return c.json({ error: "Write something before posting." }, 400);
    if (text.length > 10000) return c.json({ error: "Comments can be up to 10,000 characters." }, 400);

    const post = parse<any>(await kv.get(`post:${postId}`), null);
    if (!post || post.removed) return c.json({ error: "Post not found" }, 404);

    let parent: any = null;
    if (parentId) {
      parent = parse<any>(await kv.get(`comment:${postId}:${parentId}`), null);
      if (!parent) return c.json({ error: "The comment you're replying to was removed." }, 404);
    }

    const limited = await checkRateLimit(user, "comment");
    if (limited) return c.json({ error: limited }, 429);

    const profile = await getProfile(user.id);
    const id = crypto.randomUUID();
    const comment = {
      id, postId, parentId: parentId ?? null,
      author: usernameFrom(user), authorId: user.id, authorFlair: profile.flair ?? null,
      body: text, votes: 1, createdAt: new Date().toISOString(),
    };
    await kv.set(`comment:${postId}:${id}`, JSON.stringify(comment));
    await kv.set(`commentIndex:${id}`, postId);
    post.comments = (post.comments ?? 0) + 1;
    await kv.set(`post:${postId}`, JSON.stringify(post));

    const name = usernameFrom(user);
    if (parent && parent.authorId && parent.authorId !== user.id) {
      await notify(parent.authorId, { type: "reply", text: `${name} replied to your comment: ${text.slice(0, 80)}`, postId, community: post.community }, user.id);
    }
    if (post.authorId && post.authorId !== user.id && (!parent || parent.authorId !== post.authorId)) {
      await notify(post.authorId, { type: "comment", text: `${name} commented on your post: ${text.slice(0, 80)}`, postId, community: post.community }, user.id);
    }
    return c.json(publicComment(comment), 201);
  } catch (e) {
    console.log("Comment error:", e);
    return c.json({ error: `Error posting comment: ${e}` }, 500);
  }
});

app.post(`${PREFIX}/comments/:id/vote`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to vote" }, 401);
    const id = c.req.param("id");
    const { direction } = await c.req.json<{ direction: "up" | "down" }>();
    if (direction !== "up" && direction !== "down") return c.json({ error: "direction must be 'up' or 'down'" }, 400);
    const postId = await kv.get(`commentIndex:${id}`);
    const cm = postId ? parse<any>(await kv.get(`comment:${postId}:${id}`), null) : null;
    if (!cm || cm.removed) return c.json({ error: "Comment not found" }, 404);

    const key = `cvote:${id}:${user.id}`;
    const prev = await kv.get(key);
    let delta: number; let newVote: string | null = direction;
    if (prev === direction) { await kv.del(key); delta = direction === "up" ? -1 : 1; newVote = null; }
    else { delta = direction === "up" ? (prev ? 2 : 1) : (prev ? -2 : -1); await kv.set(key, direction); }
    cm.votes = (cm.votes ?? 0) + delta;
    await kv.set(`comment:${postId}:${id}`, JSON.stringify(cm));
    return c.json({ votes: cm.votes, userVote: newVote });
  } catch (e) {
    console.log("Comment vote error:", e);
    return c.json({ error: `Error voting: ${e}` }, 500);
  }
});

// ─── Reports & moderation ─────────────────────────────────────────────────────

app.post(`${PREFIX}/reports`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to report" }, 401);
    const { targetType, targetId, reason } = await c.req.json<{ targetType: "post" | "comment"; targetId: string; reason: string }>();
    if (!["post", "comment"].includes(targetType) || !targetId) return c.json({ error: "Nothing to report" }, 400);
    if (!REPORT_REASONS.includes(reason)) return c.json({ error: "Choose a reason" }, 400);

    let target: any; let storeKey: string; let postId: string;
    if (targetType === "post") {
      postId = targetId; storeKey = `post:${targetId}`;
      target = parse<any>(await kv.get(storeKey), null);
    } else {
      postId = (await kv.get(`commentIndex:${targetId}`)) ?? "";
      storeKey = `comment:${postId}:${targetId}`;
      target = postId ? parse<any>(await kv.get(storeKey), null) : null;
    }
    if (!target || target.removed) return c.json({ error: "That content no longer exists." }, 404);

    const mine = `report:${targetType}:${targetId}:${user.id}`;
    if (await kv.get(mine)) return c.json({ ok: true, alreadyReported: true });
    await kv.set(mine, reason);

    const post = targetType === "post" ? target : parse<any>(await kv.get(`post:${postId}`), {});
    const sumKey = `reportsum:${targetType}:${targetId}`;
    const sum = parse<any>(await kv.get(sumKey), {
      targetType, targetId, postId, community: cleanName(post.community),
      title: post.title ?? "", excerpt: String(targetType === "post" ? (target.body || target.title) : target.body).slice(0, 200),
      author: target.author, reasons: {}, count: 0,
    });
    sum.reasons[reason] = (sum.reasons[reason] ?? 0) + 1;
    sum.count += 1;
    await kv.set(sumKey, JSON.stringify(sum));

    if (sum.count >= HIDE_AFTER_REPORTS && !target.hidden) {
      target.hidden = true;
      await kv.set(storeKey, JSON.stringify(target));
    }
    return c.json({ ok: true, hidden: !!target.hidden });
  } catch (e) {
    console.log("Report error:", e);
    return c.json({ error: `Error sending report: ${e}` }, 500);
  }
});

// Reported content for a community (moderators only)
app.get(`${PREFIX}/modqueue`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    const community = cleanName(c.req.query("community"));
    if (!user || !(await isModerator(user, community))) return c.json({ error: "Only moderators can see this queue." }, 403);
    const items = parseAll(await kv.getByPrefix("reportsum:"))
      .filter((s: any) => s.community.toLowerCase() === community.toLowerCase() && !s.resolved)
      .map((s: any) => ({
        targetType: s.targetType, targetId: s.targetId, postId: s.postId, community: s.community,
        title: s.title, excerpt: s.excerpt, author: s.author,
        reports: Object.entries(s.reasons).map(([reason, count]) => ({ reason, count })),
        hidden: s.count >= HIDE_AFTER_REPORTS,
      }));
    return c.json(items);
  } catch (e) {
    console.log("Mod queue error:", e);
    return c.json({ error: `Error loading queue: ${e}` }, 500);
  }
});

app.post(`${PREFIX}/moderate`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    const { targetType, targetId, action } = await c.req.json<{ targetType: "post" | "comment"; targetId: string; action: "approve" | "remove" }>();
    const sumKey = `reportsum:${targetType}:${targetId}`;
    const sum = parse<any>(await kv.get(sumKey), null);
    if (!sum) return c.json({ error: "Nothing to moderate" }, 404);
    if (!user || !(await isModerator(user, sum.community))) return c.json({ error: "Only moderators can do this." }, 403);

    const storeKey = targetType === "post" ? `post:${targetId}` : `comment:${sum.postId}:${targetId}`;
    const target = parse<any>(await kv.get(storeKey), null);
    if (target) {
      if (action === "approve") { target.hidden = false; target.approved = true; }
      else { target.removed = true; target.hidden = true; }
      await kv.set(storeKey, JSON.stringify(target));
      if (action === "remove" && targetType === "comment") {
        const post = parse<any>(await kv.get(`post:${sum.postId}`), null);
        if (post) { post.comments = Math.max(0, (post.comments ?? 1) - 1); await kv.set(`post:${sum.postId}`, JSON.stringify(post)); }
      }
    }
    sum.resolved = action;
    await kv.set(sumKey, JSON.stringify(sum));
    return c.json({ ok: true });
  } catch (e) {
    console.log("Moderate error:", e);
    return c.json({ error: `Error moderating: ${e}` }, 500);
  }
});

// ─── Communities & memberships ────────────────────────────────────────────────

app.get(`${PREFIX}/communities`, async (c) => {
  try {
    const list = parseAll(await kv.getByPrefix("community:"))
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const withCounts = await Promise.all(list.map(async ({ founderId: _f, ...pub }: any) => ({
      ...pub, name: cleanName(pub.name), members: (await members(pub.name)).length,
    })));
    return c.json(withCounts);
  } catch (e) {
    console.log("Get communities error:", e);
    return c.json({ error: `Error fetching communities: ${e}` }, 500);
  }
});

// Member counts for any communities (built-in ones included)
app.get(`${PREFIX}/communities/counts`, async (c) => {
  try {
    const rows = await kv.getByPrefix("members:");
    // getByPrefix returns values only, so counts are keyed by the stored name
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const v = parse<any>(r, null);
      if (v && v.name && Array.isArray(v.ids)) counts[v.name] = v.ids.length;
    }
    return c.json(counts);
  } catch (e) {
    return c.json({ error: `Error fetching counts: ${e}` }, 500);
  }
});

app.post(`${PREFIX}/communities`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to create a community" }, 401);

    const { name, description } = await c.req.json<{ name: string; description?: string }>();
    const clean = cleanName(name);
    if (!/^[A-Za-z0-9_]{3,21}$/.test(clean)) {
      return c.json({ error: "Community names need 3–21 letters, numbers or underscores, with no spaces." }, 400);
    }
    const key = `community:${clean.toLowerCase()}`;
    if (BUILTIN_COMMUNITY_NAMES.includes(clean.toLowerCase()) || await kv.get(key)) {
      return c.json({ error: `${clean} already exists. Try a different name.` }, 409);
    }

    const lastKey = `lastCommunity:${user.id}`;
    const last = await kv.get(lastKey);
    if (last && Date.now() - Number(last) < COMMUNITY_COOLDOWN_MS) {
      return c.json({ error: "You can found one new community per day. Try again tomorrow." }, 429);
    }

    const community = {
      name: clean,
      icon: clean.slice(0, 2).toUpperCase(),
      kind: "user",
      description: String(description ?? "").slice(0, 300) || "A new Threadit community.",
      color: "#2bb3a3",
      founderId: user.id,
      createdAt: new Date().toISOString(),
    };
    await kv.set(key, JSON.stringify(community));
    await kv.set(lastKey, String(Date.now()));
    await setMembership(user.id, clean, true);
    await addGold(user.id, GOLD_COMMUNITY, "communities");

    const { founderId: _f, ...pub } = community;
    return c.json({ ...pub, members: 1 }, 201);
  } catch (e) {
    console.log("Create community error:", e);
    return c.json({ error: `Error creating community: ${e}` }, 500);
  }
});

// Membership lists are stored per community ({name, ids}) and per user (names)
async function setMembership(userId: string, community: string, join: boolean) {
  const lower = community.toLowerCase();
  const rec = parse<{ name: string; ids: string[] }>(await kv.get(`members:${lower}`), { name: community, ids: [] });
  const ids = new Set(rec.ids);
  if (join) ids.add(userId); else ids.delete(userId);
  await kv.set(`members:${lower}`, JSON.stringify({ name: community, ids: [...ids] }));

  const mine = new Set(parse<string[]>(await kv.get(`membership:${userId}`), []));
  if (join) mine.add(community); else mine.delete(community);
  await kv.set(`membership:${userId}`, JSON.stringify([...mine]));
  return { members: ids.size, joined: [...mine] };
}

app.get(`${PREFIX}/memberships`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Authorization required" }, 401);
  return c.json(parse<string[]>(await kv.get(`membership:${user.id}`), []));
});

app.post(`${PREFIX}/communities/:name/join`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Sign in to join communities" }, 401);
  const { join } = await c.req.json<{ join: boolean }>().catch(() => ({ join: true }));
  return c.json(await setMembership(user.id, cleanName(c.req.param("name")), join !== false));
});

// Post counts per community over the last 7 days (for the activity map)
app.get(`${PREFIX}/stats/communities`, async (c) => {
  try {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const counts: Record<string, number> = {};
    for (const p of parseAll(await kv.getByPrefix("post:"))) {
      if (p.removed || new Date(p.createdAt).getTime() < since) continue;
      const n = cleanName(p.community);
      counts[n] = (counts[n] ?? 0) + 1;
    }
    return c.json(counts);
  } catch (e) {
    return c.json({ error: `Error fetching stats: ${e}` }, 500);
  }
});

// ─── Notifications ────────────────────────────────────────────────────────────

app.get(`${PREFIX}/notifications`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Authorization required" }, 401);
  return c.json(parse<any[]>(await kv.get(`notifs:${user.id}`), []));
});

app.post(`${PREFIX}/notifications/read`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Authorization required" }, 401);
  const { ids } = await c.req.json<{ ids?: string[] }>().catch(() => ({ ids: undefined }));
  const list = parse<any[]>(await kv.get(`notifs:${user.id}`), []);
  for (const n of list) if (!ids || ids.includes(n.id)) n.read = true;
  await kv.set(`notifs:${user.id}`, JSON.stringify(list));
  return c.json({ ok: true });
});

// ─── Gold & profile ───────────────────────────────────────────────────────────
// Read-only except for spending on flair. The old POST /gold/earn endpoint was
// removed because it let anyone add any amount of gold to themselves.

app.get(`${PREFIX}/gold`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Authorization required" }, 401);
  return c.json(await getGold(user.id));
});

app.post(`${PREFIX}/profile/flair`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to buy flair" }, 401);
    const { flair } = await c.req.json<{ flair: string | null }>();
    const profile = await getProfile(user.id);
    if (flair === null) {
      profile.flair = null;
      await kv.set(`profile:${user.id}`, JSON.stringify(profile));
      return c.json({ flair: null, gold: await getGold(user.id) });
    }
    if (!PROFILE_FLAIRS.includes(flair)) return c.json({ error: "Choose a flair from the shop." }, 400);
    const owned = parse<string[]>(await kv.get(`flairsOwned:${user.id}`), []);
    const gold = await getGold(user.id);
    if (!owned.includes(flair)) {
      if (balance(gold) < PROFILE_FLAIR_COST) {
        return c.json({ error: `You need ${PROFILE_FLAIR_COST} gold for this flair. You have ${balance(gold)}.` }, 402);
      }
      gold.spent += PROFILE_FLAIR_COST;
      await kv.set(`gold:${user.id}`, JSON.stringify(gold));
      owned.push(flair);
      await kv.set(`flairsOwned:${user.id}`, JSON.stringify(owned));
    }
    profile.flair = flair;
    await kv.set(`profile:${user.id}`, JSON.stringify(profile));
    return c.json({ flair, owned, gold });
  } catch (e) {
    console.log("Flair error:", e);
    return c.json({ error: `Error setting flair: ${e}` }, 500);
  }
});

app.get(`${PREFIX}/profile`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Authorization required" }, 401);
    const [gold, usernameRaw, profile, owned] = await Promise.all([
      getGold(user.id),
      kv.get(`username:${user.id}`),
      getProfile(user.id),
      kv.get(`flairsOwned:${user.id}`),
    ]);
    return c.json({
      userId: user.id, username: bareName(usernameRaw ?? usernameFrom(user)), email: user.email, gold,
      flair: profile.flair ?? null, flairsOwned: parse<string[]>(owned, []),
      isAdmin: isAdmin(user),
    });
  } catch (e) {
    console.log("Profile error:", e);
    return c.json({ error: `Error fetching profile: ${e}` }, 500);
  }
});

// Which communities this user moderates (founder of, or all when admin)
app.get(`${PREFIX}/moderates`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json([]);
  if (isAdmin(user)) return c.json(["*"]);
  const founded = parseAll(await kv.getByPrefix("community:")).filter((x: any) => x.founderId === user.id).map((x: any) => x.name);
  return c.json(founded);
});

// ─── Editing and deleting your own posts and comments ────────────────────────

app.put(`${PREFIX}/posts/:id`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to edit" }, 401);
    const id = c.req.param("id");
    const post = parse<any>(await kv.get(`post:${id}`), null);
    if (!post || post.removed) return c.json({ error: "Post not found" }, 404);
    if (post.authorId !== user.id) return c.json({ error: "You can only edit your own posts." }, 403);
    const { title, body, flair, flairColor } = await c.req.json();
    if (title !== undefined && String(title).trim() !== post.title) {
      if (Date.now() - new Date(post.createdAt).getTime() > TITLE_EDIT_WINDOW_MS) {
        return c.json({ error: "Titles can only be changed in the first 15 minutes. You can still edit the text." }, 400);
      }
      const t = String(title).trim();
      if (!t || t.length > 300) return c.json({ error: "Titles need 1–300 characters." }, 400);
      post.title = t;
    }
    if (body !== undefined) {
      if (String(body).length > 20000) return c.json({ error: "Posts can be up to 20,000 characters." }, 400);
      post.body = String(body);
    }
    if (flair !== undefined) { post.flair = flair || null; post.flairColor = flair ? flairColor ?? null : null; }
    post.editedAt = new Date().toISOString();
    await kv.set(`post:${id}`, JSON.stringify(post));
    return c.json(publicPost(post));
  } catch (e) {
    console.log("Edit post error:", e);
    return c.json({ error: `Error editing post: ${e}` }, 500);
  }
});

app.delete(`${PREFIX}/posts/:id`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Sign in to delete" }, 401);
  const id = c.req.param("id");
  const post = parse<any>(await kv.get(`post:${id}`), null);
  if (!post || post.removed) return c.json({ error: "Post not found" }, 404);
  if (post.authorId !== user.id) return c.json({ error: "You can only delete your own posts." }, 403);
  post.removed = true;
  post.deletedByAuthor = true;
  await kv.set(`post:${id}`, JSON.stringify(post));
  return c.json({ ok: true });
});

app.put(`${PREFIX}/comments/:id`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Sign in to edit" }, 401);
  const id = c.req.param("id");
  const postId = await kv.get(`commentIndex:${id}`);
  const cm = postId ? parse<any>(await kv.get(`comment:${postId}:${id}`), null) : null;
  if (!cm || cm.removed || cm.deleted) return c.json({ error: "Comment not found" }, 404);
  if (cm.authorId !== user.id) return c.json({ error: "You can only edit your own comments." }, 403);
  const { body } = await c.req.json<{ body: string }>();
  const text = String(body ?? "").trim();
  if (!text || text.length > 10000) return c.json({ error: "Comments need 1–10,000 characters." }, 400);
  cm.body = text;
  cm.editedAt = new Date().toISOString();
  await kv.set(`comment:${postId}:${id}`, JSON.stringify(cm));
  return c.json(publicComment(cm));
});

app.delete(`${PREFIX}/comments/:id`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Sign in to delete" }, 401);
  const id = c.req.param("id");
  const postId = await kv.get(`commentIndex:${id}`);
  const cm = postId ? parse<any>(await kv.get(`comment:${postId}:${id}`), null) : null;
  if (!cm || cm.removed || cm.deleted) return c.json({ error: "Comment not found" }, 404);
  if (cm.authorId !== user.id) return c.json({ error: "You can only delete your own comments." }, 403);
  const hasReplies = parseAll(await kv.getByPrefix(`comment:${postId}:`)).some((x: any) => x.parentId === id && !x.removed);
  // With replies, leave a "[deleted]" placeholder so the conversation still makes sense
  if (hasReplies) { cm.deleted = true; cm.body = ""; }
  else {
    cm.removed = true;
    const post = parse<any>(await kv.get(`post:${postId}`), null);
    if (post) { post.comments = Math.max(0, (post.comments ?? 1) - 1); await kv.set(`post:${postId}`, JSON.stringify(post)); }
  }
  await kv.set(`comment:${postId}:${id}`, JSON.stringify(cm));
  return c.json({ ok: true, placeholder: hasReplies });
});

// ─── Public profiles ──────────────────────────────────────────────────────────

app.get(`${PREFIX}/users/:username`, async (c) => {
  try {
    const name = bareName(c.req.param("username"));
    const lower = name.toLowerCase();
    const viewer = await getAuthedUser(c);
    const bot = Object.values(BOTS).find(b => b.name.toLowerCase() === lower);
    const posts = parseAll(await kv.getByPrefix("post:"))
      .filter((p: any) => !p.removed && !p.hidden && sameName(p.author, lower))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const allComments = parseAll(await kv.getByPrefix("comment:"))
      .filter((x: any) => !x.removed && !x.deleted && !x.hidden && sameName(x.author, lower))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
    const userId = bot?.id ?? (await userIdFor(name));
    if (!bot && !userId && posts.length === 0 && allComments.length === 0) {
      return c.json({ error: "No one has that username." }, 404);
    }
    const display = bareName(posts[0]?.author ?? allComments[0]?.author ?? (userId ? await kv.get(`username:${userId}`) : null) ?? name);
    const titles = new Map<string, any>();
    for (const cm of allComments) {
      if (!titles.has(cm.postId)) titles.set(cm.postId, parse<any>(await kv.get(`post:${cm.postId}`), null));
    }
    let joinedAt: string | null = null;
    if (userId && !bot) {
      try { joinedAt = (await supabase.auth.admin.getUserById(userId)).data.user?.created_at ?? null; } catch { /* ignore */ }
    }
    const gold = userId && !bot ? await getGold(userId) : EMPTY_GOLD;
    const profile = userId ? await getProfile(userId) : {};
    return c.json({
      username: display,
      isBot: !!bot,
      flair: profile.flair ?? null,
      joinedAt,
      goldEarned: gold.posts + gold.votes + gold.communities + gold.awards,
      postCount: posts.length,
      commentCount: allComments.length,
      blockedByMe: !!(viewer && userId && (await blockedIds(viewer.id)).has(userId)),
      isMe: !!(viewer && userId && viewer.id === userId),
      posts: posts.slice(0, 50).map(publicPost),
      comments: allComments.map((cm: any) => {
        const post = titles.get(cm.postId);
        return { ...publicComment(cm), postTitle: post?.title ?? "", postCommunity: cleanName(post?.community ?? "") };
      }).filter((x: any) => x.postTitle),
    });
  } catch (e) {
    console.log("Profile page error:", e);
    return c.json({ error: `Error loading profile: ${e}` }, 500);
  }
});

// ─── Blocking ─────────────────────────────────────────────────────────────────
// Blocking hides that person's posts and comments from you and stops their
// replies, comments and awards from notifying you. They aren't told.

app.get(`${PREFIX}/blocks`, async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Authorization required" }, 401);
  return c.json(await getBlocks(user.id));
});

app.post(`${PREFIX}/blocks`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Sign in to block people" }, 401);
    const { username, block } = await c.req.json<{ username: string; block: boolean }>();
    const name = bareName(username);
    const id = await userIdFor(name);
    if (!id) return c.json({ error: "No one has that username." }, 404);
    if (id === user.id) return c.json({ error: "You can't block yourself." }, 400);
    const list = (await getBlocks(user.id)).filter(b => b.id !== id);
    if (block !== false) list.push({ id, username: name });
    await kv.set(`blocks:${user.id}`, JSON.stringify(list));
    return c.json(list);
  } catch (e) {
    return c.json({ error: `Error updating blocks: ${e}` }, 500);
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────
// Searches every post's title, text and community. Titles count most, then
// recency breaks ties.

app.get(`${PREFIX}/search`, async (c) => {
  try {
    const q = String(c.req.query("q") ?? "").trim().toLowerCase().replace(/^#/, "");
    if (q.length < 2) return c.json([]);
    const community = cleanName(c.req.query("community")).toLowerCase();
    const user = await getAuthedUser(c);
    const blocked = await blockedIds(user?.id);
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
    const scored = parseAll(await kv.getByPrefix("post:"))
      .filter((p: any) => !p.removed && !p.hidden && !blocked.has(p.authorId))
      .filter((p: any) => !community || cleanName(p.community).toLowerCase() === community)
      .map((p: any) => {
        const title = String(p.title).toLowerCase();
        const body = String(p.body ?? "").toLowerCase();
        const comm = cleanName(p.community).toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (title.includes(t)) score += 3;
          else if (body.includes(t)) score += 1;
          else if (comm.includes(t)) score += 1;
          else return { p, score: 0 };   // every word must appear somewhere
        }
        if (title.includes(q)) score += 3; // whole phrase in the title
        return { p, score };
      })
      .filter((x: any) => x.score > 0)
      .sort((a: any, b: any) => b.score - a.score || new Date(b.p.createdAt).getTime() - new Date(a.p.createdAt).getTime())
      .slice(0, 40)
      .map((x: any) => publicPost(x.p));
    return c.json(scored);
  } catch (e) {
    return c.json({ error: `Error searching: ${e}` }, 500);
  }
});

// ─── Your account: download your data, or delete the account ─────────────────

app.get(`${PREFIX}/account/export`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Authorization required" }, 401);
    const posts = parseAll(await kv.getByPrefix("post:")).filter((p: any) => p.authorId === user.id);
    const comments = parseAll(await kv.getByPrefix("comment:")).filter((x: any) => x.authorId === user.id);
    const [gold, profile, memberships, notifications, blocks, flairsOwned] = await Promise.all([
      getGold(user.id), getProfile(user.id),
      kv.get(`membership:${user.id}`), kv.get(`notifs:${user.id}`), getBlocks(user.id), kv.get(`flairsOwned:${user.id}`),
    ]);
    return c.json({
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, username: usernameFrom(user), createdAt: user.created_at },
      profile: { ...profile, flairsOwned: parse<string[]>(flairsOwned, []) },
      gold,
      communitiesJoined: parse<string[]>(memberships, []),
      blockedUsers: blocks.map(b => b.username),
      posts: posts.map((p: any) => ({ id: p.id, community: p.community, title: p.title, body: p.body, createdAt: p.createdAt, editedAt: p.editedAt ?? null, deleted: !!p.removed })),
      comments: comments.map((x: any) => ({ id: x.id, postId: x.postId, body: x.body, createdAt: x.createdAt, editedAt: x.editedAt ?? null, deleted: !!(x.removed || x.deleted) })),
      notifications: parse<any[]>(notifications, []),
    });
  } catch (e) {
    return c.json({ error: `Error exporting data: ${e}` }, 500);
  }
});

// Deletes the account. With deleteContent, posts and comments are removed too;
// otherwise they stay up as "[deleted]" so conversations still make sense.
app.post(`${PREFIX}/account/delete`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Authorization required" }, 401);
    const { deleteContent, confirm } = await c.req.json<{ deleteContent?: boolean; confirm?: string }>();
    if (String(confirm ?? "").toLowerCase() !== "delete") return c.json({ error: 'Type "delete" to confirm.' }, 400);

    for (const p of parseAll(await kv.getByPrefix("post:"))) {
      let changed = false;
      if (p.authorId === user.id) {
        if (deleteContent) { p.removed = true; p.deletedByAuthor = true; }
        p.author = "[deleted]"; p.authorId = null; p.authorFlair = null;
        changed = true;
      }
      // Remove this person's votes from every post
      if (await kv.get(`vote:${p.id}:${user.id}`)) await kv.del(`vote:${p.id}:${user.id}`);
      if (changed) await kv.set(`post:${p.id}`, JSON.stringify(p));
    }
    for (const cm of parseAll(await kv.getByPrefix("comment:"))) {
      if (cm.authorId !== user.id) continue;
      cm.author = "[deleted]"; cm.authorId = null; cm.authorFlair = null;
      if (deleteContent) { cm.deleted = true; cm.body = ""; }
      await kv.set(`comment:${cm.postId}:${cm.id}`, JSON.stringify(cm));
    }
    for (const name of parse<string[]>(await kv.get(`membership:${user.id}`), [])) {
      const rec = parse<{ name: string; ids: string[] }>(await kv.get(`members:${name.toLowerCase()}`), { name, ids: [] });
      await kv.set(`members:${name.toLowerCase()}`, JSON.stringify({ ...rec, ids: rec.ids.filter(i => i !== user.id) }));
    }
    const username = bareName(await kv.get(`username:${user.id}`) ?? usernameFrom(user)).toLowerCase();
    for (const key of [`gold:${user.id}`, `profile:${user.id}`, `flairsOwned:${user.id}`, `notifs:${user.id}`, `membership:${user.id}`,
      `blocks:${user.id}`, `username:${user.id}`, `usernameTaken:${username}`, `lastCommunity:${user.id}`]) {
      await kv.del(key);
    }
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) return c.json({ error: `Your content was removed, but the login couldn't be deleted: ${error.message}. Contact support.` }, 500);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete account error:", e);
    return c.json({ error: `Error deleting account: ${e}` }, 500);
  }
});

// ─── Bots ─────────────────────────────────────────────────────────────────────
// Labeled bot accounts that keep the site lively early on (see bots.ts).
// Run them on a schedule with Supabase Cron (see README), or from the admin
// panel. Requests need the THREADIT_BOT_SECRET header or an admin sign-in.

const kvBotStore: BotStore = {
  async listPosts() { return parseAll(await kv.getByPrefix("post:")); },
  async savePost(p) { await kv.set(`post:${p.id}`, JSON.stringify(p)); },
  async addComment(cm) {
    await kv.set(`comment:${cm.postId}:${cm.id}`, JSON.stringify(cm));
    await kv.set(`commentIndex:${cm.id}`, cm.postId);
  },
  notify: (userId, n) => notify(userId, n),
  getFlag: (k) => kv.get(k),
  setFlag: (k, v) => kv.set(k, v),
};

async function botAccess(c: any): Promise<boolean> {
  const secret = Deno.env.get("THREADIT_BOT_SECRET") ?? "";
  const given = c.req.header("x-bot-secret") ?? "";
  if (secret && given && given.length === secret.length) {
    let diff = 0;
    for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ given.charCodeAt(i);
    if (diff === 0) return true;
  }
  return isAdmin(await getAuthedUser(c));
}

app.post(`${PREFIX}/bots/run`, async (c) => {
  try {
    if (!(await botAccess(c))) return c.json({ error: "Only admins or the scheduler can run bots." }, 403);
    if (Deno.env.get("THREADIT_BOTS_ENABLED") === "false") return c.json({ error: "Bots are turned off (THREADIT_BOTS_ENABLED=false)." }, 409);
    const { jobs } = await c.req.json<{ jobs?: BotJob[] }>().catch(() => ({ jobs: undefined }));
    const report = await runBots({
      store: kvBotStore,
      fetch,
      anthropicKey: Deno.env.get("ANTHROPIC_API_KEY") || undefined,
      answerModel: Deno.env.get("THREADIT_ANSWER_MODEL") || undefined,
      feeds: parseFeedList(Deno.env.get("THREADIT_NEWS_FEEDS")),
    }, jobs);
    return c.json(report);
  } catch (e) {
    console.log("Bots run error:", e);
    return c.json({ error: `Error running bots: ${e}` }, 500);
  }
});

app.get(`${PREFIX}/bots/status`, async (c) => {
  if (!(await botAccess(c))) return c.json({ error: "Only admins can see bot status." }, 403);
  return c.json({
    paused: (await kv.get("bots:paused")) === "1",
    enabled: Deno.env.get("THREADIT_BOTS_ENABLED") !== "false",
    summaries: !!Deno.env.get("ANTHROPIC_API_KEY"),
    answers: !!Deno.env.get("ANTHROPIC_API_KEY"),
    history: parse<any[]>(await kv.get("bots:history"), []),
  });
});

app.post(`${PREFIX}/bots/pause`, async (c) => {
  if (!(await botAccess(c))) return c.json({ error: "Only admins can pause bots." }, 403);
  const { paused } = await c.req.json<{ paused: boolean }>();
  await kv.set("bots:paused", paused ? "1" : "0");
  return c.json({ paused: !!paused });
});

// ─── Map Pins (unchanged) ─────────────────────────────────────────────────────

app.get(`${PREFIX}/pins`, async (c) => {
  try {
    const pins = parseAll(await kv.getByPrefix("pin:"))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((p: any) => ({ ...p, timeAgo: timeAgo(p.createdAt) }));
    return c.json(pins);
  } catch (e) {
    return c.json({ error: `Error fetching pins: ${e}` }, 500);
  }
});

app.post(`${PREFIX}/pins`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Authorization required to add a pin" }, 401);
    const { x, y, state, title, desc, category } = await c.req.json();
    if (!title || x === undefined || y === undefined) return c.json({ error: "x, y, and title are required" }, 400);
    const id = crypto.randomUUID();
    const pin = {
      id, x, y, state: state ?? "Unknown", title, desc: desc ?? "", category: category ?? "general",
      author: usernameFrom(user), authorId: user.id, votes: 1, createdAt: new Date().toISOString(),
    };
    await kv.set(`pin:${id}`, JSON.stringify(pin));
    return c.json(pin, 201);
  } catch (e) {
    return c.json({ error: `Error creating pin: ${e}` }, 500);
  }
});

app.put(`${PREFIX}/pins/:id`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Authorization required" }, 401);
    const pinId = c.req.param("id");
    const pin = parse<any>(await kv.get(`pin:${pinId}`), null);
    if (!pin) return c.json({ error: "Pin not found" }, 404);
    if (pin.authorId !== user.id) return c.json({ error: "You can only edit your own pins" }, 403);
    const { title, desc, category } = await c.req.json();
    const updated = { ...pin, title: title ?? pin.title, desc: desc ?? pin.desc, category: category ?? pin.category };
    await kv.set(`pin:${pinId}`, JSON.stringify(updated));
    return c.json(updated);
  } catch (e) {
    return c.json({ error: `Error editing pin: ${e}` }, 500);
  }
});

app.delete(`${PREFIX}/pins/:id`, async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Authorization required" }, 401);
    const pinId = c.req.param("id");
    const pin = parse<any>(await kv.get(`pin:${pinId}`), null);
    if (!pin) return c.json({ error: "Pin not found" }, 404);
    if (pin.authorId !== user.id) return c.json({ error: "You can only delete your own pins" }, 403);
    await kv.del(`pin:${pinId}`);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: `Error deleting pin: ${e}` }, 500);
  }
});

Deno.serve(app.fetch);
