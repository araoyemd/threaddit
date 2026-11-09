// ─── Threadit bots ────────────────────────────────────────────────────────────
// Temporary helpers that keep the site lively until real members take over.
// Every bot is a visibly labeled bot account (isBot: true). None of them pose
// as people, earn gold, or vote.
//
//   NaijaNewsBot       posts headlines from Nigerian outlets' public RSS feeds,
//                      with a link to the original story
//   GistStarterBot   starts discussion questions in quiet communities, and
//                      nudges unanswered "Ask" posts
//   WelcomeBot           welcomes people on their first post
//   AnswerBot            answers "Ask" questions nobody has answered yet, using
//                      Claude (needs ANTHROPIC_API_KEY; skips anything it
//                      can't answer safely, which then gets a nudge instead)
//
// Bots step back automatically: once a community has RETIRE_AFTER real posts
// in the last 7 days, news and discussion bots stop posting there.
//
// This file has no Deno- or browser-specific code. The server (index.tsx) and
// the hosted preview each give it a BotStore that reads and writes their data.

export interface BotPost {
  id: string;
  community: string;
  author: string;
  authorId: string | null;
  isBot?: boolean;
  title: string;
  body: string;
  flair: string | null;
  flairColor: string | null;
  votes: number;
  comments: number;
  pinned?: boolean;
  createdAt: string;
  removed?: boolean;
  hidden?: boolean;
  source?: { outlet: string; url: string };
  /** How many of `comments` came from bots, so bot replies don't count as answers */
  botComments?: number;
}

export interface BotComment {
  id: string;
  postId: string;
  parentId: string | null;
  author: string;
  authorId: string;
  isBot?: boolean;
  body: string;
  votes: number;
  createdAt: string;
}

export interface BotStore {
  listPosts(): Promise<BotPost[]>;
  savePost(p: BotPost): Promise<void>;
  addComment(c: BotComment): Promise<void>;
  notify(userId: string, n: { type: string; text: string; postId?: string; community?: string }): Promise<void>;
  getFlag(key: string): Promise<string | null>;
  setFlag(key: string, value: string): Promise<void>;
}

export interface Feed { outlet: string; url: string; defaultCommunity?: string }

export interface BotDeps {
  store: BotStore;
  fetch?: typeof fetch;
  now?: () => number;
  uuid?: () => string;
  /** Optional. When set, news posts get a two-sentence summary written by Claude,
   *  and AnswerBot answers unanswered questions. */
  anthropicKey?: string;
  /** Model AnswerBot uses. Defaults to ANSWER_MODEL. */
  answerModel?: string;
  feeds?: Feed[];
}

export type BotJob = "news" | "gist" | "welcome" | "answer" | "helper";

export interface BotReport {
  ranAt: string;
  paused: boolean;
  news: { posted: number; skipped: Record<string, number>; feeds: { outlet: string; ok: boolean; items: number; error?: string }[] };
  gist: { posted: number };
  welcome: { commented: number };
  /** answered: replies posted; skipped: questions it declined (left for people and the nudge) */
  answer: { answered: number; skipped: number; failed: number };
  helper: { commented: number };
  retiredCommunities: string[];
}

export const BOTS = {
  news: { id: "bot:news", name: "NaijaNewsBot" },
  gist: { id: "bot:gist", name: "GistStarterBot" },
  welcome: { id: "bot:welcome", name: "WelcomeBot" },
  answer: { id: "bot:answer", name: "AnswerBot" },
  threadit: { id: "bot:threadit", name: "ThreaditBot" },
} as const;

/** Usernames are shown without a prefix; older records may still have "u/" */
export const bareName = (name: unknown) => String(name ?? "").replace(/^u\//i, "");

const BOT_NAMES = new Set<string>(Object.values(BOTS).map(b => b.name.toLowerCase()));
export const isBotAuthor = (p: { author?: string; authorId?: string | null; isBot?: boolean }) =>
  !!p.isBot || String(p.authorId ?? "").startsWith("bot:") || BOT_NAMES.has(bareName(p.author).toLowerCase());

// ─── Limits ───────────────────────────────────────────────────────────────────

export const LIMITS = {
  newsPerRun: 5,
  newsPerDay: 24,
  newsPerCommunityPerDay: 3,
  newsMaxAgeHours: 36,
  gistPerRun: 3,
  gistEveryDaysPerCommunity: 7,
  answerPerRun: 4,
  answerPerDay: 40,
  /** Give members this long to answer first */
  answerAfterMinutes: 45,
  answerMaxAgeHours: 48,
  helperPerRun: 5,
  helperAfterHours: 6,
  welcomeAfterMinutes: 5,
  /** Real posts in 7 days after which bots stop posting in a community */
  retireAfter: 15,
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ─── News sources ─────────────────────────────────────────────────────────────
// Public RSS feeds from established Nigerian outlets. Override with the
// THREADIT_NEWS_FEEDS environment variable ("Outlet|https://url,Outlet|https://url").

export const DEFAULT_FEEDS: Feed[] = [
  { outlet: "Premium Times", url: "https://www.premiumtimesng.com/feed" },
  { outlet: "Punch", url: "https://punchng.com/feed/" },
  { outlet: "TheCable", url: "https://www.thecable.ng/feed" },
  { outlet: "Channels TV", url: "https://www.channelstv.com/feed/" },
  { outlet: "Vanguard", url: "https://www.vanguardngr.com/feed/" },
  { outlet: "TechCabal", url: "https://techcabal.com/feed/", defaultCommunity: "TechNigeria" },
];

export function parseFeedList(env: string | undefined): Feed[] | undefined {
  if (!env?.trim()) return undefined;
  const feeds = env.split(",").map(s => s.trim()).filter(Boolean).map(entry => {
    const [outlet, url, community] = entry.split("|").map(x => x.trim());
    return /^https:\/\//.test(url ?? "") ? { outlet, url, defaultCommunity: community || undefined } : null;
  }).filter(Boolean) as Feed[];
  return feeds.length ? feeds : undefined;
}

// ─── RSS / Atom parsing (no DOM needed) ───────────────────────────────────────

export interface FeedItem { title: string; link: string; published: number | null; description: string }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", naira: "₦" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const stripCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
export const stripHtml = (s: string) =>
  decodeEntities(stripCdata(s).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : null;
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, "title") ?? "");
    let link = stripHtml(tag(b, "link") ?? "");
    if (!link) link = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const date = stripHtml(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date") ?? "");
    const parsed = date ? Date.parse(date) : NaN;
    const description = stripHtml(tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content:encoded") ?? "");
    if (title && /^https?:\/\//.test(link)) {
      items.push({ title, link: decodeEntities(link), published: Number.isFinite(parsed) ? parsed : null, description });
    }
  }
  return items;
}

// ─── Which community does a story belong in? ──────────────────────────────────

// [community, ...keywords]. Matched on whole words, case-insensitive.
const PLACE_KEYWORDS: string[][] = [
  ["Lagos", "lagos", "ikeja", "lekki", "ikorodu", "surulere", "yaba", "badagry", "epe", "ajah", "victoria island", "sanwo-olu"],
  ["Abuja", "abuja", "fct", "wuse", "garki", "gwagwalada", "kubwa"],
  ["Rivers", "rivers state", "port harcourt", "obio-akpor", "bonny"],
  ["Kano", "kano"], ["Kaduna", "kaduna", "zaria"], ["Oyo", "oyo state", "ibadan", "ogbomoso"],
  ["Enugu", "enugu", "nsukka"], ["Anambra", "anambra", "onitsha", "awka", "nnewi"],
  ["Edo", "edo state", "benin city", "auchi"], ["Delta", "delta state", "asaba", "warri", "sapele"],
  ["Borno", "borno", "maiduguri"], ["Plateau", "plateau", "jos"], ["CrossRiver", "cross river", "calabar"],
  ["AkwaIbom", "akwa ibom", "uyo", "eket"], ["Ogun", "ogun", "abeokuta", "ota", "sagamu", "ijebu"],
  ["Kwara", "kwara", "ilorin"], ["Imo", "imo state", "owerri"], ["Abia", "abia", "umuahia", "aba"],
  ["Adamawa", "adamawa", "yola", "mubi"], ["Bauchi", "bauchi"], ["Bayelsa", "bayelsa", "yenagoa"],
  ["Benue", "benue", "makurdi"], ["Ebonyi", "ebonyi", "abakaliki"], ["Ekiti", "ekiti", "ado-ekiti"],
  ["Gombe", "gombe"], ["Jigawa", "jigawa", "dutse"], ["Katsina", "katsina"], ["Kebbi", "kebbi", "birnin kebbi"],
  ["Kogi", "kogi", "lokoja"], ["Nasarawa", "nasarawa", "lafia", "keffi"], ["Niger", "niger state", "minna", "suleja", "bida"],
  ["Ondo", "ondo", "akure"], ["Osun", "osun", "osogbo", "ile-ife", "ilesa"], ["Sokoto", "sokoto"],
  ["Taraba", "taraba", "jalingo"], ["Yobe", "yobe", "damaturu"], ["Zamfara", "zamfara", "gusau"],
];
const TOPIC_KEYWORDS: string[][] = [
  ["SuperEagles", "super eagles", "super falcons", "npfl", "afcon", "golden eaglets", "flying eagles"],
  ["TechNigeria", "startup", "startups", "fintech", "tech", "technology", "artificial intelligence", "software", "ncc", "nitda", "telecoms", "broadband"],
  ["Nollywood", "nollywood", "box office", "film", "movie", "actress", "actor"],
  ["Jobs", "recruitment", "vacancy", "vacancies", "unemployment", "job seekers"],
  ["Japa", "visa", "visas", "emigration", "migrants", "diaspora", "japa", "immigration"],
  ["NYSC", "nysc", "corps member", "corps members", "corper", "corpers"],
];

const wordRe = (k: string) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i");

export function routeStory(title: string, description: string, fallback = "Nigeria"): string {
  const text = `${title} ${description}`.toLowerCase();
  const head = title.toLowerCase();
  // Topics first by headline (a Lagos tech story belongs in TechNigeria)
  for (const [c, ...keys] of TOPIC_KEYWORDS) if (keys.some(k => wordRe(k).test(head))) return c;
  for (const [c, ...keys] of PLACE_KEYWORDS) if (keys.some(k => wordRe(k).test(head))) return c;
  for (const [c, ...keys] of PLACE_KEYWORDS) if (keys.some(k => wordRe(k).test(text))) return c;
  return fallback;
}

// ─── Discussion prompts ───────────────────────────────────────────────────────

type Kind = "national" | "state" | "campus" | "interest";
export const BOT_COMMUNITIES: { name: string; label: string; kind: Kind }[] = [
  { name: "Nigeria", label: "Nigeria", kind: "national" },
  ...["AskNaija|Ask Naija", "TechNigeria|Tech Nigeria", "NYSC|NYSC", "Jobs|Jobs", "Japa|Japa", "Nollywood|Nollywood",
    "SuperEagles|Super Eagles", "Owambe|Owambe", "NaijaFood|Naija Food"].map(s => { const [name, label] = s.split("|"); return { name, label, kind: "interest" as Kind }; }),
  ...["Abuja|Abuja", "Abia|Abia", "Adamawa|Adamawa", "AkwaIbom|Akwa Ibom", "Anambra|Anambra", "Bauchi|Bauchi", "Bayelsa|Bayelsa",
    "Benue|Benue", "Borno|Borno", "CrossRiver|Cross River", "Delta|Delta", "Ebonyi|Ebonyi", "Edo|Edo", "Ekiti|Ekiti", "Enugu|Enugu",
    "Gombe|Gombe", "Imo|Imo", "Jigawa|Jigawa", "Kaduna|Kaduna", "Kano|Kano", "Katsina|Katsina", "Kebbi|Kebbi", "Kogi|Kogi",
    "Kwara|Kwara", "Lagos|Lagos", "Nasarawa|Nasarawa", "Niger|Niger", "Ogun|Ogun", "Ondo|Ondo", "Osun|Osun", "Oyo|Oyo",
    "Plateau|Plateau", "Rivers|Rivers", "Sokoto|Sokoto", "Taraba|Taraba", "Yobe|Yobe", "Zamfara|Zamfara"]
    .map(s => { const [name, label] = s.split("|"); return { name, label, kind: "state" as Kind }; }),
  ...["UNILAG|UNILAG", "UI|UI", "OAU|OAU", "UNN|UNN", "ABU|ABU", "UNIBEN|UNIBEN", "LASU|LASU", "FUTA|FUTA", "Covenant|Covenant"]
    .map(s => { const [name, label] = s.split("|"); return { name, label, kind: "campus" as Kind }; }),
];

const PROMPTS: Record<Kind, string[]> = {
  state: [
    "What's one thing visitors always get wrong about {label}?",
    "Where's the best place to eat in {label} right now, and what should people order?",
    "How is transport in your part of {label} this week? Share your route and what you paid.",
    "What's a small business in {label} that deserves more customers?",
    "If you could fix one thing in {label} this year, what would it be?",
    "What's the best weekend spot in {label} that isn't too expensive?",
  ],
  campus: [
    "Freshers at {label}: what do you wish someone had told you in your first week?",
    "Which {label} lecturer or course changed how you think? Tell us why.",
    "Hostel or off-campus at {label}: which is better right now, and what does it cost?",
    "What's the best affordable food spot near {label}?",
  ],
  interest: [
    "What's the most useful thing you learned about {label} this month?",
    "Beginners' thread for {label}: ask anything, and experienced members answer.",
    "What's one {label} myth you think people should stop believing?",
    "Share a {label} win from this week, big or small.",
  ],
  national: [
    "What's one Nigerian everyday win from this week? Good news only.",
    "Which Nigerian product or service surprised you recently, in a good way?",
    "What should every Nigerian know before moving to a new state?",
  ],
};

export function promptFor(c: { label: string; kind: Kind }, index: number): string {
  const list = PROMPTS[c.kind];
  return list[index % list.length].replace(/\{label\}/g, c.label);
}

// ─── Optional summaries (Claude API) ──────────────────────────────────────────

function sharedRun(a: string, b: string, n = 8): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9₦\s]/g, " ").split(/\s+/).filter(Boolean);
  const bw = words(b);
  const grams = new Set<string>();
  for (let i = 0; i + n <= bw.length; i++) grams.add(bw.slice(i, i + n).join(" "));
  const aw = words(a);
  for (let i = 0; i + n <= aw.length; i++) if (grams.has(aw.slice(i, i + n).join(" "))) return true;
  return false;
}

async function summarize(deps: BotDeps, item: FeedItem, outlet: string): Promise<string | null> {
  if (!deps.anthropicKey || !deps.fetch) return null;
  try {
    const res = await deps.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": deps.anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 160,
        system:
          "You write neutral two-sentence summaries of Nigerian news headlines for a community forum. " +
          "Use only facts present in the headline and teaser you are given; add nothing else. " +
          "Write entirely in your own words: never copy phrases of five or more words, never quote. " +
          "No opinions, no speculation. If the teaser is too thin to summarize safely, reply with exactly SKIP.",
        messages: [{ role: "user", content: `Outlet: ${outlet}\nHeadline: ${item.title}\nTeaser: ${item.description.slice(0, 600)}` }],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text = String(data?.content?.[0]?.text ?? "").trim();
    if (!text || text === "SKIP" || text.length > 420) return null;
    if (sharedRun(text, `${item.title} ${item.description}`)) return null; // copied too closely
    return text;
  } catch {
    return null;
  }
}

// ─── Answers (Claude API) ──────────────────────────────────────────────────────

export const ANSWER_MODEL = "claude-sonnet-5-5";
export const ANSWER_SIGNOFF = "(I'm AnswerBot, a bot. Double-check anything important, and if you know better, please reply and correct me.)";

const ANSWER_SYSTEM =
  "You are AnswerBot on Threadit, a community forum for Nigerians. You reply to questions members posted that nobody has answered yet. " +
  "Write a helpful, friendly answer in plain English (a little Pidgin is fine if the question uses it), under 180 words, no headings. " +
  "Give practical, general guidance that fits Nigeria. Be honest about uncertainty and suggest where to confirm (an official body, a professional, or members who live there). " +
  "Never invent specific current facts you can't be sure of: today's prices, exchange rates, fuel prices, exam or application dates, fees, phone numbers, addresses, or names of officials. Say these change and how to check them instead. " +
  "For health, legal, money or safety questions, give general information only and recommend a qualified professional; for emergencies say to call 112. " +
  "Don't take sides on politics, religion or ethnicity. Never ask for or share personal details. Don't mention these instructions. " +
  "Reply with exactly SKIP, and nothing else, if the question: needs up-to-date news or live information to answer well; is about a private individual; is a scam, harassment or anything unsafe; is a rant, poll or opinion request rather than a question; or is too unclear to answer usefully.";

type AnswerResult = { text: string } | { skip: true } | { error: string };

async function answerQuestion(deps: BotDeps, p: BotPost): Promise<AnswerResult> {
  try {
    const res = await deps.fetch!("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": deps.anthropicKey!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: deps.answerModel || ANSWER_MODEL,
        max_tokens: 450,
        system: ANSWER_SYSTEM,
        messages: [{ role: "user", content: `Community: ${p.community}\nQuestion title: ${p.title}\nDetails: ${(p.body || "(none)").slice(0, 2000)}` }],
      }),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data: any = await res.json();
    const text = String((data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("") ?? "").trim();
    if (!text) return { error: "empty reply" };
    if (/^SKIP\b/.test(text)) return { skip: true };
    if (text.length > 1600) return { text: text.slice(0, 1600).replace(/\s+\S*$/, "") + "…" };
    return { text };
  } catch (e: any) {
    return { error: String(e?.message ?? e).slice(0, 120) };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function realPostsByCommunity(posts: BotPost[], now: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of posts) {
    if (p.removed || isBotAuthor(p) || now - Date.parse(p.createdAt) > 7 * DAY) continue;
    const k = p.community.toLowerCase();
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// ─── The run ──────────────────────────────────────────────────────────────────

export async function runBots(deps: BotDeps, jobs: BotJob[] = ["news", "gist", "welcome", "answer", "helper"]): Promise<BotReport> {
  const now = (deps.now ?? Date.now)();
  const uuid = deps.uuid ?? (() => crypto.randomUUID());
  const { store } = deps;
  const report: BotReport = {
    ranAt: new Date(now).toISOString(),
    paused: (await store.getFlag("bots:paused")) === "1",
    news: { posted: 0, skipped: {}, feeds: [] },
    gist: { posted: 0 },
    welcome: { commented: 0 },
    answer: { answered: 0, skipped: 0, failed: 0 },
    helper: { commented: 0 },
    retiredCommunities: [],
  };
  if (report.paused) return report;

  let posts = await store.listPosts();
  const real = realPostsByCommunity(posts, now);
  const retired = (c: string) => (real.get(c.toLowerCase()) ?? 0) >= LIMITS.retireAfter;
  report.retiredCommunities = [...real.entries()].filter(([, n]) => n >= LIMITS.retireAfter).map(([c]) => c);
  const skip = (why: string) => { report.news.skipped[why] = (report.news.skipped[why] ?? 0) + 1; };

  // ── News ───────────────────────────────────────────────────────────────────
  if (jobs.includes("news") && deps.fetch) {
    const today = day(now);
    let postedToday = Number(await store.getFlag(`botnews:day:${today}`) ?? 0);
    const perCommunity = new Map<string, number>();
    const existingTitles = new Set(posts.filter(p => now - Date.parse(p.createdAt) < 3 * DAY).map(p => normTitle(p.title)));

    const candidates: { item: FeedItem; feed: Feed }[] = [];
    for (const feed of deps.feeds ?? DEFAULT_FEEDS) {
      try {
        const res = await deps.fetch(feed.url, { headers: { "user-agent": "ThreaditNewsBot/1.0 (+community forum; links to original stories)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const items = parseFeed(await res.text());
        report.news.feeds.push({ outlet: feed.outlet, ok: true, items: items.length });
        for (const item of items) candidates.push({ item, feed });
      } catch (e: any) {
        report.news.feeds.push({ outlet: feed.outlet, ok: false, items: 0, error: String(e?.message ?? e).slice(0, 120) });
      }
    }
    // Newest first, alternating outlets so one source doesn't dominate
    candidates.sort((a, b) => (b.item.published ?? 0) - (a.item.published ?? 0));
    const byOutlet = new Map<string, number>();

    for (const { item, feed } of candidates) {
      if (report.news.posted >= LIMITS.newsPerRun) break;
      if (postedToday >= LIMITS.newsPerDay) { skip("daily limit"); break; }
      if (!item.published || now - item.published > LIMITS.newsMaxAgeHours * HOUR) { skip("too old or undated"); continue; }
      if (item.published > now + HOUR) { skip("future date"); continue; }
      const seenKey = `botseen:${hash(item.link)}`;
      if (await store.getFlag(seenKey)) { skip("already posted"); continue; }
      if (existingTitles.has(normTitle(item.title))) { skip("duplicate headline"); continue; }
      if ((byOutlet.get(feed.outlet) ?? 0) >= 2) { skip("outlet limit this run"); continue; }
      const community = routeStory(item.title, item.description, feed.defaultCommunity ?? "Nigeria");
      if (retired(community)) { skip("community has enough real posts"); continue; }
      const dayKey = `botnews:${community.toLowerCase()}:${today}`;
      const forCommunity = perCommunity.get(community) ?? Number(await store.getFlag(dayKey) ?? 0);
      if (forCommunity >= LIMITS.newsPerCommunityPerDay) { skip("community daily limit"); continue; }

      const summary = await summarize(deps, item, feed.outlet);
      const when = new Date(item.published).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
      const body = [
        summary,
        `Source: ${feed.outlet} · ${when} WAT`,
        item.link,
        "This is an automated news post. Read the full story at the source before sharing. What do you think?",
      ].filter(Boolean).join("\n\n");

      const post: BotPost = {
        id: uuid(), community, author: BOTS.news.name, authorId: BOTS.news.id, isBot: true,
        title: item.title.slice(0, 300), body, flair: "News", flairColor: "#4fa3e0",
        votes: 1, comments: 0, createdAt: new Date(now).toISOString(),
        source: { outlet: feed.outlet, url: item.link },
      };
      await store.savePost(post);
      await store.setFlag(seenKey, "1");
      await store.setFlag(dayKey, String(forCommunity + 1));
      postedToday += 1;
      await store.setFlag(`botnews:day:${today}`, String(postedToday));
      perCommunity.set(community, forCommunity + 1);
      byOutlet.set(feed.outlet, (byOutlet.get(feed.outlet) ?? 0) + 1);
      existingTitles.add(normTitle(item.title));
      posts.push(post);
      report.news.posted += 1;
    }
  }

  // ── Discussion starters in quiet communities ───────────────────────────────
  if (jobs.includes("gist")) {
    const recent = new Map<string, number>();
    for (const p of posts) {
      if (p.removed || now - Date.parse(p.createdAt) > 3 * DAY) continue;
      recent.set(p.community.toLowerCase(), (recent.get(p.community.toLowerCase()) ?? 0) + 1);
    }
    const eligible: { c: (typeof BOT_COMMUNITIES)[number]; last: number }[] = [];
    for (const c of BOT_COMMUNITIES) {
      if (retired(c.name)) continue;
      if ((recent.get(c.name.toLowerCase()) ?? 0) >= 2) continue; // not quiet
      const last = Number(await store.getFlag(`gistlast:${c.name.toLowerCase()}`) ?? 0);
      if (now - last < LIMITS.gistEveryDaysPerCommunity * DAY) continue;
      eligible.push({ c, last });
    }
    // Least recently prompted first; national and interest before states, states before campuses
    const order: Record<Kind, number> = { national: 0, interest: 1, state: 2, campus: 3 };
    eligible.sort((a, b) => a.last - b.last || order[a.c.kind] - order[b.c.kind]);
    for (const { c } of eligible.slice(0, LIMITS.gistPerRun)) {
      const idx = Number(await store.getFlag(`gistidx:${c.name.toLowerCase()}`) ?? 0);
      const post: BotPost = {
        id: uuid(), community: c.name, author: BOTS.gist.name, authorId: BOTS.gist.id, isBot: true,
        title: promptFor(c, idx),
        body: "A conversation starter from GistStarterBot while this community grows. Jump in with your own experience.",
        flair: "Discussion", flairColor: "#a66bff", votes: 1, comments: 0, createdAt: new Date(now).toISOString(),
      };
      await store.savePost(post);
      await store.setFlag(`gistlast:${c.name.toLowerCase()}`, String(now));
      await store.setFlag(`gistidx:${c.name.toLowerCase()}`, String(idx + 1));
      posts.push(post);
      report.gist.posted += 1;
    }
  }

  // ── Welcome first-time posters ─────────────────────────────────────────────
  if (jobs.includes("welcome")) {
    const firstByAuthor = new Map<string, BotPost>();
    for (const p of [...posts].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
      if (!p.authorId || isBotAuthor(p) || firstByAuthor.has(p.authorId)) continue;
      firstByAuthor.set(p.authorId, p);
    }
    for (const [authorId, p] of firstByAuthor) {
      const age = now - Date.parse(p.createdAt);
      if (p.removed || p.hidden || age < LIMITS.welcomeAfterMinutes * 60_000 || age > 2 * DAY) continue;
      const key = `botwelcomed:${authorId}`;
      if (await store.getFlag(key)) continue;
      await store.setFlag(key, "1");
      await store.addComment({
        id: uuid(), postId: p.id, parentId: null, author: BOTS.welcome.name, authorId: BOTS.welcome.id, isBot: true,
        body: `Welcome to Threadit, ${bareName(p.author)}! Thanks for your first post. Tips: join the communities for your state and campus to see what's happening near you, and use the Scam Alert flair if you spot a scam. (I'm a bot.)`,
        votes: 1, createdAt: new Date(now).toISOString(),
      });
      p.comments += 1;
      p.botComments = (p.botComments ?? 0) + 1;
      await store.savePost(p);
      await store.notify(authorId, { type: "comment", text: `${BOTS.welcome.name} welcomed you to Threadit`, postId: p.id, community: p.community });
      report.welcome.commented += 1;
    }
  }

  // ── Answer questions nobody has answered ───────────────────────────────────
  // "Ask" posts with no replies from people after answerAfterMinutes. Questions
  // Claude declines are marked so they aren't retried; they get the nudge below.
  if (jobs.includes("answer") && deps.anthropicKey && deps.fetch) {
    const today = day(now);
    let answeredToday = Number(await store.getFlag(`botanswer:day:${today}`) ?? 0);
    const waiting = posts.filter(p => {
      const age = now - Date.parse(p.createdAt);
      const fromPeople = p.comments - (p.botComments ?? 0);
      return !p.removed && !p.hidden && !isBotAuthor(p) && p.flair === "Ask" && fromPeople <= 0
        && age >= LIMITS.answerAfterMinutes * 60_000 && age <= LIMITS.answerMaxAgeHours * HOUR;
    }).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    for (const p of waiting) {
      if (report.answer.answered >= LIMITS.answerPerRun || answeredToday >= LIMITS.answerPerDay) break;
      const key = `botanswered:${p.id}`;
      if (await store.getFlag(key)) continue;
      const result = await answerQuestion(deps, p);
      if ("error" in result) { report.answer.failed += 1; continue; } // try again next run
      if ("skip" in result) { await store.setFlag(key, "skip"); report.answer.skipped += 1; continue; }
      await store.setFlag(key, "1");
      await store.addComment({
        id: uuid(), postId: p.id, parentId: null, author: BOTS.answer.name, authorId: BOTS.answer.id, isBot: true,
        body: `${result.text}\n\n${ANSWER_SIGNOFF}`,
        votes: 1, createdAt: new Date(now).toISOString(),
      });
      p.comments += 1;
      p.botComments = (p.botComments ?? 0) + 1;
      await store.savePost(p);
      if (p.authorId) await store.notify(p.authorId, { type: "comment", text: `${BOTS.answer.name} answered your question`, postId: p.id, community: p.community });
      answeredToday += 1;
      await store.setFlag(`botanswer:day:${today}`, String(answeredToday));
      report.answer.answered += 1;
    }
  }

  // ── Nudge unanswered questions ─────────────────────────────────────────────
  // Skips questions AnswerBot already answered.
  if (jobs.includes("helper")) {
    const waiting = posts.filter(p => {
      const age = now - Date.parse(p.createdAt);
      const fromPeople = p.comments - (p.botComments ?? 0);
      return !p.removed && !p.hidden && !isBotAuthor(p) && p.flair === "Ask" && fromPeople <= 0
        && age >= LIMITS.helperAfterHours * HOUR && age <= 7 * DAY;
    }).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    for (const p of waiting) {
      if (report.helper.commented >= LIMITS.helperPerRun) break;
      const key = `bothelped:${p.id}`;
      if (await store.getFlag(key)) continue;
      if ((await store.getFlag(`botanswered:${p.id}`)) === "1") continue;
      await store.setFlag(key, "1");
      await store.addComment({
        id: uuid(), postId: p.id, parentId: null, author: BOTS.gist.name, authorId: BOTS.gist.id, isBot: true,
        body: `No answers yet. If you know about this, please share what you know. ${bareName(p.author)}, adding your area and dates can help people answer. (I'm a bot.)`,
        votes: 1, createdAt: new Date(now).toISOString(),
      });
      p.comments += 1;
      p.botComments = (p.botComments ?? 0) + 1;
      await store.savePost(p);
      report.helper.commented += 1;
    }
  }

  // Keep a short run history for the admin panel
  const history = JSON.parse((await store.getFlag("bots:history")) ?? "[]") as BotReport[];
  history.unshift(report);
  await store.setFlag("bots:history", JSON.stringify(history.slice(0, 20)));
  return report;
}
