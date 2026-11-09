// Tests for the bot engine and the preview backend's bot rules.
// Run: npm run test:bots
// Feed contents below are made-up test fixtures, not real headlines.

import {
  runBots, parseFeed, routeStory, isBotAuthor, LIMITS, BOTS,
  type BotStore, type BotPost, type BotComment, type Feed,
} from "../supabase/functions/server/bots";

let failures = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) failures++; };

// ── In-memory store ──────────────────────────────────────────────────────────
function memoryStore() {
  const posts: BotPost[] = [];
  const comments: BotComment[] = [];
  const flags = new Map<string, string>();
  const notes: { userId: string; text: string }[] = [];
  const store: BotStore = {
    async listPosts() { return posts.map(p => ({ ...p })); },
    async savePost(p) { const i = posts.findIndex(x => x.id === p.id); i >= 0 ? (posts[i] = { ...p }) : posts.push({ ...p }); },
    async addComment(c) { comments.push(c); },
    async notify(userId, n) { notes.push({ userId, text: n.text }); },
    async getFlag(k) { return flags.get(k) ?? null; },
    async setFlag(k, v) { flags.set(k, v); },
  };
  return { store, posts, comments, flags, notes };
}

let n = 0;
const uuid = () => `id-${++n}`;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toUTCString();
const isoHoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function rss(items: { title: string; link: string; date: string; desc?: string }[]) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>${items.map(i =>
    `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link><pubDate>${i.date}</pubDate><description><![CDATA[<p>${i.desc ?? "Teaser text for testing."}</p>]]></description></item>`).join("")}</channel></rss>`;
}

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (url: any) => {
    const u = String(url);
    const r = routes[u];
    if (!r) return new Response("not found", { status: 404 });
    return r();
  }) as typeof fetch;
}

// ── Parsing ──────────────────────────────────────────────────────────────────
{
  const items = parseFeed(rss([{ title: "Test &amp; check: ₦5bn &#8216;plan&#8217;", link: "https://example.ng/a", date: hoursAgo(1) }]));
  ok(items.length === 1 && items[0].title === "Test & check: ₦5bn ‘plan’", "RSS: CDATA and HTML entities decoded");
  ok(items[0].description === "Teaser text for testing.", "RSS: HTML stripped from description");
  ok(items[0].published === Date.parse(hoursAgo(1)), "RSS: publish date parsed");
  const atom = parseFeed(`<feed><entry><title>Atom item</title><link href="https://example.ng/b"/><updated>${isoHoursAgo(2)}</updated><summary>Sum</summary></entry></feed>`);
  ok(atom.length === 1 && atom[0].link === "https://example.ng/b", "Atom feeds supported");
  ok(parseFeed("<rss><item><title>No link</title></item></rss>").length === 0, "items without a link are ignored");
}

// ── Routing ──────────────────────────────────────────────────────────────────
{
  ok(routeStory("Flooding hits Ikorodu after heavy rain", "") === "Lagos", "routing: Ikorodu → Lagos");
  ok(routeStory("Super Eagles name squad for qualifier", "") === "SuperEagles", "routing: football → SuperEagles");
  ok(routeStory("Lagos fintech startup raises funding", "") === "TechNigeria", "routing: tech topic beats place");
  ok(routeStory("Niger Delta communities protest pipeline", "") === "Nigeria", "routing: 'Niger Delta' doesn't go to Niger State");
  ok(routeStory("Minna residents queue for fuel", "") === "Niger", "routing: Minna → Niger");
  ok(routeStory("Senate passes new bill", "The bill affects Kano traders") === "Kano", "routing: falls back to teaser text");
  ok(routeStory("Senate passes new bill", "") === "Nigeria", "routing: default → Nigeria");
  ok(routeStory("Aba traders reopen market", "") === "Abia", "routing: Aba → Abia");
  ok(routeStory("NYSC announces new batch dates", "") === "NYSC", "routing: NYSC");
}

// ── News run ─────────────────────────────────────────────────────────────────
{
  const m = memoryStore();
  const feeds: Feed[] = [
    { outlet: "Outlet A", url: "https://a.test/feed" },
    { outlet: "Outlet B", url: "https://b.test/feed" },
    { outlet: "Broken", url: "https://broken.test/feed" },
  ];
  const feedA = rss([
    { title: "Story A1 about Senate", link: "https://a.test/1", date: hoursAgo(1) },
    { title: "Story A2 about Ikeja roads", link: "https://a.test/2", date: hoursAgo(2) },
    { title: "Story A3 about markets", link: "https://a.test/3", date: hoursAgo(3) },
    { title: "Old story A4", link: "https://a.test/4", date: hoursAgo(60) },
  ]);
  const feedB = rss([
    { title: "Story B1 about Kano trade", link: "https://b.test/1", date: hoursAgo(1.5) },
    { title: "Story B2 about Enugu power", link: "https://b.test/2", date: hoursAgo(2.5) },
    { title: "Story B3 about Port Harcourt", link: "https://b.test/3", date: hoursAgo(3.5) },
    { title: "Story A1 about Senate", link: "https://b.test/dupe", date: hoursAgo(1) },
  ]);
  const fetch = fakeFetch({
    "https://a.test/feed": () => new Response(feedA),
    "https://b.test/feed": () => new Response(feedB),
    "https://broken.test/feed": () => new Response("down", { status: 503 }),
  });
  const deps = { store: m.store, fetch, now: () => NOW, uuid, feeds };
  const r1 = await runBots(deps, ["news"]);
  ok(r1.news.posted === 4, `first run posts 4 (2 per outlet limit), got ${r1.news.posted}`);
  ok(r1.news.feeds.find(f => f.outlet === "Broken")?.ok === false, "failing feed is reported, run continues");
  const news = m.posts.filter(p => p.author === BOTS.news.name);
  ok(news.every(p => p.isBot && p.authorId === BOTS.news.id && p.flair === "News"), "news posts are labeled bot posts");
  ok(news.every(p => p.body.includes("Source: Outlet") && /https:\/\/[ab]\.test\//.test(p.body) && p.body.includes("automated news post")), "news posts link the source and say they're automated");
  ok(!news.some(p => p.title.includes("Old story")), "stories older than 36 hours are skipped");
  ok(news.filter(p => p.title === "Story A1 about Senate").length === 1, "same headline from two outlets posted once");
  ok(news.some(p => p.community === "Lagos") && news.some(p => p.community === "Kano"), "stories routed to state communities");

  const r2 = await runBots(deps, ["news"]);
  const titles = m.posts.filter(p => p.author === BOTS.news.name).map(p => p.title);
  ok(new Set(titles).size === titles.length, "second run never reposts the same story");
  ok(r2.news.posted === 2, `second run posts the remaining fresh stories, got ${r2.news.posted}`);
  const r3 = await runBots(deps, ["news"]);
  ok(r3.news.posted === 0, "third run has nothing new to post");
}

// ── Daily and per-community caps ─────────────────────────────────────────────
{
  const m = memoryStore();
  const many = Array.from({ length: 40 }, (_, i) => ({ title: `Lagos item ${i}`, link: `https://c.test/${i}`, date: hoursAgo(1 + i * 0.1) }));
  const feeds: Feed[] = Array.from({ length: 20 }, (_, i) => ({ outlet: `O${i}`, url: `https://c.test/feed${i}` }));
  const routes: Record<string, () => Response> = {};
  feeds.forEach((f, i) => { routes[f.url] = () => new Response(rss(many.slice(i * 2, i * 2 + 2))); });
  const deps = { store: m.store, fetch: fakeFetch(routes), now: () => NOW, uuid, feeds };
  for (let i = 0; i < 6; i++) await runBots(deps, ["news"]);
  const lagos = m.posts.filter(p => p.community === "Lagos").length;
  ok(lagos === LIMITS.newsPerCommunityPerDay, `at most ${LIMITS.newsPerCommunityPerDay} news posts per community per day, got ${lagos}`);
}

// ── Optional Claude summaries ────────────────────────────────────────────────
{
  const make = (reply: string) => {
    const m = memoryStore();
    const fetch = (async (url: any) => {
      if (String(url).includes("anthropic.com")) return new Response(JSON.stringify({ content: [{ type: "text", text: reply }] }));
      return new Response(rss([{ title: "Governor opens new bridge in Ibadan", link: "https://d.test/1", date: hoursAgo(1), desc: "The state governor on Monday formally opened the new bridge linking two busy districts of the city" }]));
    }) as typeof fetch;
    return { m, deps: { store: m.store, fetch, now: () => NOW, uuid, anthropicKey: "test", feeds: [{ outlet: "D", url: "https://d.test/feed" }] } };
  };
  const a = make("A new bridge in Ibadan is now open to traffic. It connects two busy parts of the city.");
  await runBots(a.deps, ["news"]);
  ok(a.m.posts[0]?.body.startsWith("A new bridge in Ibadan is now open") === true, "summary added when it's in the bot's own words");
  ok(a.m.posts[0]?.community === "Oyo", "Ibadan story routed to Oyo");
  const b = make("The state governor on Monday formally opened the new bridge linking two busy districts.");
  await runBots(b.deps, ["news"]);
  ok(b.m.posts.length === 1 && !b.m.posts[0].body.includes("formally opened the new bridge linking"), "summary that copies the source is dropped");
}

// ── Retirement, discussion, welcome, helper, pause ───────────────────────────
{
  const m = memoryStore();
  // Lagos is busy: 15 real posts this week
  for (let i = 0; i < 15; i++) {
    await m.store.savePost({ id: `real-${i}`, community: "Lagos", author: `person${i}`, authorId: `user-${i}`, title: `Real ${i}`, body: "", flair: null, flairColor: null, votes: 1, comments: 1, createdAt: isoHoursAgo(10 + i) });
  }
  // A first-time poster (20 minutes ago) and a brand-new one (2 minutes ago)
  await m.store.savePost({ id: "first", community: "Kano", author: "newbie", authorId: "user-new", title: "Hello Kano", body: "", flair: null, flairColor: null, votes: 1, comments: 0, createdAt: isoHoursAgo(1 / 3) });
  await m.store.savePost({ id: "tooNew", community: "Kano", author: "justnow", authorId: "user-now", title: "Just joined", body: "", flair: null, flairColor: null, votes: 1, comments: 0, createdAt: isoHoursAgo(2 / 60) });
  // An unanswered question from 8 hours ago, and one from 1 hour ago
  await m.store.savePost({ id: "ask", community: "AskNaija", author: "asker", authorId: "user-ask", title: "Best bank for small business?", body: "", flair: "Ask", flairColor: null, votes: 1, comments: 0, createdAt: isoHoursAgo(8) });
  await m.store.savePost({ id: "askNew", community: "AskNaija", author: "asker2", authorId: "user-ask2", title: "Fresh question", body: "", flair: "Ask", flairColor: null, votes: 1, comments: 0, createdAt: isoHoursAgo(1) });

  const deps = { store: m.store, now: () => NOW, uuid };
  const r = await runBots(deps, ["gist", "welcome", "helper"]);
  ok(r.retiredCommunities.includes("lagos"), "busy community marked as retired for bots");
  const gist = m.posts.filter(p => p.author === BOTS.gist.name);
  ok(gist.length === LIMITS.gistPerRun, `discussion bot posts ${LIMITS.gistPerRun} per run, got ${gist.length}`);
  ok(!gist.some(p => p.community === "Lagos"), "no discussion posts in the retired community");
  ok(gist[0]?.community === "Nigeria", "national community prompted first");
  ok(gist.every(p => p.isBot && p.flair === "Discussion"), "discussion posts labeled");

  const welcomes = m.comments.filter(c => c.author === BOTS.welcome.name);
  ok(welcomes.length === 18, `every first-time poster from the last 2 days is welcomed (18), got ${welcomes.length}`);
  ok(welcomes.some(c => c.postId === "first") && !welcomes.some(c => c.postId === "tooNew"), "welcome waits 5 minutes after a first post");
  ok(welcomes.every(c => c.body.includes("(I'm a bot.)")), "welcome comments say they're from a bot");
  ok(m.notes.some(nn => nn.userId === "user-new"), "first-time poster is notified");
  const nudges = m.comments.filter(c => c.author === BOTS.gist.name);
  ok(nudges.length === 1 && nudges[0].postId === "ask", "only questions unanswered for 6+ hours are nudged");

  const before = { posts: m.posts.length, comments: m.comments.length };
  await runBots(deps, ["gist", "welcome", "helper"]);
  const gist2 = m.posts.filter(p => p.author === BOTS.gist.name);
  ok(m.comments.filter(c => c.postId === "first" && c.author === BOTS.welcome.name).length === 1, "each person is welcomed once");
  ok(m.comments.filter(c => c.postId === "ask" && c.author === BOTS.gist.name).length === 1, "each question is nudged once, even though the welcome bot also commented");
  ok(new Set(gist2.map(p => p.community)).size === gist2.length, "no community gets two discussion prompts in a week");
  ok(m.posts.length - before.posts <= LIMITS.gistPerRun, "second run stays within limits");

  m.flags.set("bots:paused", "1");
  const paused = await runBots(deps);
  const after = { posts: m.posts.length, comments: m.comments.length };
  await runBots(deps);
  ok(paused.paused && m.posts.length === after.posts && m.comments.length === after.comments, "pause stops all bot activity");
  ok(isBotAuthor({ author: "ThreaditBot" }) && isBotAuthor({ author: "u/ThreaditBot" }) && isBotAuthor({ authorId: "bot:news" }) && !isBotAuthor({ author: "Ada", authorId: "user-1" }), "bot detection (old u/ names too)");
}

// ── AnswerBot ────────────────────────────────────────────────────────────────
{
  const m = memoryStore();
  const ask = (id: string, over: Partial<BotPost> = {}): BotPost => ({
    id, community: "AskNaija", author: "Ada", authorId: `user-${id}`, title: `Question ${id}?`, body: "Details", flair: "Ask", flairColor: "#2fb37f",
    votes: 1, comments: 0, createdAt: isoHoursAgo(2), ...over,
  });
  m.posts.push(
    ask("q1"),                                              // answerable
    ask("q2", { title: "What is the fuel price today?" }),  // Claude says SKIP
    ask("q3", { createdAt: isoHoursAgo(0.2) }),             // too new: members get first go
    ask("q4", { comments: 1 }),                             // already answered by a person
    ask("q5", { flair: "Discussion" }),                     // not a question post
    ask("q6", { createdAt: isoHoursAgo(72) }),              // too old
    ask("q7", { removed: true }),
  );
  const calls: any[] = [];
  let failNext = false;
  const claude = (async (url: any, init: any) => {
    if (String(url) !== "https://api.anthropic.com/v1/messages") return new Response("no", { status: 404 });
    const body = JSON.parse(init.body);
    calls.push({ headers: init.headers, body });
    if (failNext) { failNext = false; return new Response("overloaded", { status: 529 }); }
    const q = body.messages[0].content as string;
    const text = /fuel price/.test(q) ? "SKIP" : "Try the state office first, then ask members who live there.";
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
  }) as typeof fetch;

  const none = await runBots({ store: m.store, now: () => NOW, uuid, fetch: claude }, ["answer"]);
  ok(none.answer.answered === 0 && calls.length === 0, "answer: does nothing without an API key");

  const deps = { store: m.store, now: () => NOW, uuid, fetch: claude, anthropicKey: "test-key" };
  const r = await runBots(deps, ["answer"]);
  ok(r.answer.answered === 1 && r.answer.skipped === 1, "answer: answers eligible questions, declines what Claude skips");
  ok(calls.length === 2, "answer: only eligible questions are sent to Claude (new, answered, non-Ask, old, removed are left alone)");
  ok(calls[0].headers["x-api-key"] === "test-key" && calls[0].body.model === "claude-sonnet-5-5", "answer: sends the key and default model");
  const reply = m.comments.find(c => c.postId === "q1")!;
  ok(!!reply && reply.author === BOTS.answer.name && reply.isBot === true && reply.authorId === BOTS.answer.id, "answer: reply is from the labelled AnswerBot");
  ok(/Try the state office/.test(reply.body) && /I'm AnswerBot, a bot/.test(reply.body), "answer: reply has the answer and the bot sign-off");
  ok(isBotAuthor({ author: "AnswerBot" }), "answer: AnswerBot is recognised as a bot");
  const q1 = m.posts.find(p => p.id === "q1")!;
  ok(q1.comments === 1 && q1.botComments === 1, "answer: bot reply doesn't count as a person's answer");
  ok(m.notes.some(n => n.userId === "user-q1" && /answered your question/.test(n.text)), "answer: asker is notified");
  ok(!m.comments.some(c => c.postId === "q2"), "answer: skipped question gets no reply");

  await runBots(deps, ["answer"]);
  ok(m.comments.filter(c => c.postId === "q1").length === 1 && calls.length === 2, "answer: never answers or retries the same question twice");

  // Helper nudge: not for answered questions, still for skipped ones
  const later = { ...deps, now: () => NOW + 6 * 3_600_000 };
  await runBots(later, ["helper"]);
  ok(!m.comments.some(c => c.postId === "q1" && c.author === BOTS.gist.name), "helper: doesn't nudge a question AnswerBot answered");
  ok(m.comments.some(c => c.postId === "q2" && c.author === BOTS.gist.name), "helper: still nudges a question AnswerBot declined");

  // A failed call is retried next run
  m.posts.push(ask("q8"));
  failNext = true;
  const f = await runBots(deps, ["answer"]);
  ok(f.answer.failed === 1 && !m.comments.some(c => c.postId === "q8"), "answer: API failure is reported, nothing posted");
  const f2 = await runBots(deps, ["answer"]);
  ok(f2.answer.answered === 1 && m.comments.some(c => c.postId === "q8"), "answer: failed question is retried next run");

  // Limits
  const m2 = memoryStore();
  for (let i = 0; i < 10; i++) m2.posts.push(ask(`L${i}`));
  const lr = await runBots({ ...deps, store: m2.store }, ["answer"]);
  ok(lr.answer.answered === LIMITS.answerPerRun, "answer: stays within the per-run limit");
  m2.flags.set(`botanswer:day:${new Date(NOW).toISOString().slice(0, 10)}`, String(LIMITS.answerPerDay));
  const capped = await runBots({ ...deps, store: m2.store }, ["answer"]);
  ok(capped.answer.answered === 0, "answer: stops at the daily limit");
}
{
  // Custom model actually reaches the API
  const m = memoryStore();
  m.posts.push({ id: "c1", community: "AskNaija", author: "Ada", authorId: "user-c1", title: "How do I renew my passport?", body: "", flair: "Ask", flairColor: null, votes: 1, comments: 0, createdAt: isoHoursAgo(2) });
  let model = "";
  const f = (async (_u: any, init: any) => { model = JSON.parse(init.body).model; return new Response(JSON.stringify({ content: [{ type: "text", text: "Use the official portal." }] })); }) as typeof fetch;
  await runBots({ store: m.store, now: () => NOW, uuid, fetch: f, anthropicKey: "k", answerModel: "claude-haiku-5-5" }, ["answer"]);
  ok(model === "claude-haiku-5-5", "answer: THREADIT_ANSWER_MODEL override is used");
}

// ── Preview backend: bot rules end to end ────────────────────────────────────
{
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
  const api = await import("../src/preview/api");
  const { supabase } = await import("../src/preview/supabase");
  const tok = async (email: string) => (await supabase.auth.signInWithPassword({ email, password: "longpass1" })).data.session!.access_token;
  await api.signUp("admin@x.ng", "longpass1", "SiteAdmin"); await api.signUp("u@x.ng", "longpass1", "Member");
  const A = await tok("admin@x.ng"), U = await tok("u@x.ng");
  let denied = false; try { await api.runBots(U); } catch { denied = true; }
  ok(denied, "preview: only admins can run bots");
  const rep = await api.runBots(A);
  ok(rep.gist.posted > 0 && rep.news.feeds.length === 0, "preview: discussion bot runs, news skipped");
  const feed = await api.getPosts(U);
  const botPost = feed.find(p => p.author === BOTS.gist.name)!;
  ok(!!botPost && botPost.isBot === true, "preview: bot posts come back marked isBot");
  await api.votePost(U, String(botPost.id), "up");
  ok((await api.getGold(U)).votes === 0, "preview: upvoting a bot post gives nobody gold");
  let noAward = false; try { await api.giveAward(U, String(botPost.id), "helpful"); } catch (e: any) { noAward = /Bot posts/.test(e.message); }
  ok(noAward, "preview: bot posts can't receive awards");
  const status = await api.getBotStatus(A);
  ok(status.history.length === 1 && status.canFetchNews === false, "preview: run history recorded");
  await api.setBotsPaused(A, true);
  const pr = await api.runBots(A);
  ok(pr.paused && pr.gist.posted === 0, "preview: pause works");
}

console.log(failures ? `\n${failures} failed` : "\nAll bot tests passed");
if (failures) process.exitCode = 1;
