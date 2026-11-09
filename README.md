# Threadit

A community forum for Nigeria: every state and the FCT, major campuses and
popular topics, in English and Pidgin.

This GitHub repository is the source of truth. Changes are made here (by you or
by Claude), tested automatically, and deployed from here. **Don't edit the code
in Figma Make any more**: a redeploy from Make would overwrite what's live.

| Folder | What it is | Where it runs | Deploys when |
| --- | --- | --- | --- |
| `src/` | The React app (all screens and features) | The Next.js site and the hosted preview | with `web/` |
| `supabase/functions/server/` | The backend (posts, comments, votes, gold, moderation, notifications, bots) | Supabase Edge Functions | GitHub Action `Deploy backend`, on every push to `main` that touches it |
| `web/` | The public website with search-friendly pages | Vercel | Vercel, on every push to `main` (previews for other branches) |
| `.github/workflows/` | Tests on every push, backend deploys, the hourly bot run | GitHub Actions | — |

---

## What's included

1. **A page for every post and community.** `/c/lagos` and `/c/lagos/<id>/<title-slug>`, rendered on the server so Google can read them. Wrong or missing slugs redirect to the right address, and old `?post=` links from the Make app redirect too.
2. **WhatsApp and social link previews.** Each post gets its own title, description and a generated 1200×630 share image.
3. **Search engine extras.** `DiscussionForumPosting` and breadcrumb structured data, `sitemap.xml` (every community and post, with Pidgin alternates), `robots.txt`, canonical URLs, and `hreflang` for English (`en-NG`) and Pidgin (`pcm`, via `?lang=pcm`). Sample and hidden posts are marked `noindex`.
4. **Real comments.** Threaded replies (5 levels), comment voting, and reporting.
5. **Lighter on data.** A Data saver switch, turned on automatically when the phone asks to save data or the connection is 2G. It hides images until tapped and collapses reels and the activity map. Images load lazily, and the chart library loads only when needed.
6. **Moderation.** Report reasons (scam, hate or ethnic attacks, false information, spam, harassment). Content reported by 3 different people is hidden until a moderator approves or removes it. Community founders moderate their communities; admins moderate everything. New accounts (under 24 hours) can make 3 posts and 20 comments a day. There's a Scam Alert flair and filter, and posting rules on every page.
7. **Local identity.** All 36 states plus the FCT, 9 universities and 10 topic communities. A weekly fuel price check-in and a monthly NYSC questions thread are created and pinned automatically. Pidgin covers the whole interface.
8. **Gold you can spend.** Earn: +10 per post, +1 per upvote from someone else (once per person), +50 for founding a community, plus half of any award you receive. Spend: Helpful (20) and Gold (100) awards, and profile flair (150). Tiers are based on gold earned, so spending never lowers your tier.
9. **Notifications.** Comments on your posts, replies to your comments, upvote milestones (10, 50, 100, 500, 1,000), awards, and new posts in communities you joined (at most one per community every 6 hours). The site can be installed on a phone's home screen.
10. **Original audio only.** Reels no longer reference commercial songs, and the upload area states the original-audio rule.

The member counts and the state activity map now come from real data. The
previous invented numbers ("1.2M members", "4,821 online") are gone.

---

## Going live (one-time setup)

**1. Backend deploys from GitHub**

1. In Supabase, open your account menu → **Access Tokens** → generate a token.
2. In this repo on GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   `SUPABASE_ACCESS_TOKEN` = that token.
3. Open the **Actions** tab → **Deploy backend** → **Run workflow** once. After
   that it runs by itself whenever the backend changes.

The function keeps Make's name (`make-server-8937b06c`) so every existing URL
keeps working. All data stays in the same `kv_store_8937b06c` table.

**2. Function settings** (Supabase → Edge Functions → Secrets)

| Variable | Required | Purpose |
| --- | --- | --- |
| `THREADIT_ADMINS` | Yes | Your email or username (comma-separate several). Gives moderator rights everywhere and the bot panel. |
| `THREADIT_BOT_SECRET` | Yes | A long random string. The hourly bot run sends it. |
| `THREADIT_SITE_URL` | Yes | Your domain, e.g. `https://threadit.ng`. Used in emails. |
| `ANTHROPIC_API_KEY` | For AnswerBot | Turns on AnswerBot and news summaries. From console.anthropic.com; billed per use, separately from a Claude plan. |
| `THREADIT_ANSWER_MODEL` | No | Model AnswerBot uses (default `claude-sonnet-5-5`; `claude-haiku-5-5` is cheaper). |
| `THREADIT_NEWS_FEEDS` | No | Replace the default feed list: `Outlet\|https://feed-url,Outlet\|https://feed-url\|DefaultCommunity` |
| `THREADIT_BOTS_ENABLED` | No | `false` turns every bot off. |
| `TURNSTILE_SECRET_KEY` | No | See Cloudflare Turnstile below. |

**3. Hourly bots**

Add a second GitHub repository secret, `THREADIT_BOT_SECRET`, with the same
value as above. The **Run bots** workflow then runs at 17 minutes past every
hour, and you can run it by hand from the Actions tab (optionally just some
jobs). If you used the older pg_cron schedule, remove it so the bots don't run
twice: `select cron.unschedule('threadit-bots');` in the SQL editor.

**4. The public site on Vercel**

1. In Vercel, **Add New → Project** → import this repository.
2. Set **Root Directory** to `web` (leave "Include files outside the root directory" on; the site imports `../src`).
3. Add environment variable `THREADIT_SITE_URL` = your domain.
4. Deploy, then add your domain under **Settings → Domains** and point its DNS at Vercel.

The site reads the Supabase backend using the public settings in `utils/supabase/info.tsx`.

Local testing without network access:

```bash
cd web
npm install
THREADIT_DEMO=1 npm run build && THREADIT_DEMO=1 npm start
```

### After launch

- Add the domain in **Google Search Console** and submit `https://<your-domain>/sitemap.xml`.
- Check a post with Google's **Rich Results Test** (it should find "Discussion forum posting").
- Paste a post link into WhatsApp to confirm the preview card.

---

## Accounts, profiles and safety

- **Edit and delete.** Use the ⋯ menu on your own posts and comments. Text and flair can be edited any time; titles only in the first 15 minutes. Edited content shows "edited". A deleted comment that has replies leaves a "[deleted]" placeholder so the thread still reads properly.
- **Email confirmation and password reset.** Sign-up sends Supabase's confirmation email, and "Forgot password?" sends a reset link that opens a "choose a new password" screen.
- **Your data.** Profile → Your account has **Download my data** (a JSON file) and **Delete account**. Deleting can keep your posts up as "[deleted]" or remove them too.
- **Profiles.** Every name links to `/u/username`, which shows that person's posts and comments. Names display without a prefix (older accounts saved with "u/" are cleaned up automatically).
- **Threads are pages.** Opening a post replaces the feed with the full thread (with its own address on the public site); Back returns you to where you were in the feed.
- **Blocking.** From the ⋯ menu or a profile. Blocked people's posts leave your feed and search, their comments are collapsed, and they can't notify you. They aren't told. Manage the list under Your account.
- **Sign-up protection.** A hidden form field and a minimum fill time stop simple scripts, each network can make 5 sign-ups an hour, passwords need 8+ characters, and bot and system names are reserved. Cloudflare Turnstile can be switched on (below).
- **Search** covers every post on the server, not just the ones loaded. All words must match, and title matches rank first. The public site has a `/search` page (not indexed) and tells Google about it so a search box can appear under your result.

### Supabase Auth settings (one-time)

In the Supabase dashboard, under **Authentication**:

1. **Sign In / Providers → Email:** turn on **Confirm email**.
2. **URL Configuration:** set **Site URL** to your domain (e.g. `https://threadit.ng`) and add it (plus your Make preview URL) to **Redirect URLs**. Confirmation and reset links only go to addresses on this list.
3. **SMTP Settings:** add your own email provider (for example Resend, Postmark or Amazon SES). Supabase's built-in sender is limited to a few emails an hour and is meant only for testing.
4. Optional: in **Emails**, edit the confirmation and reset templates to match Threadit.

Accounts created before this update were confirmed automatically and keep working.

### Optional: Cloudflare Turnstile

Create a free Turnstile widget at Cloudflare, then put the **site key** in
`TURNSTILE_SITE_KEY` in `src/app/data.ts` and the **secret key** in the Supabase
function's `TURNSTILE_SECRET_KEY` setting. Sign-up then shows a quick check.
Leave both empty to keep it off.

---

## Tests

`npm test` (in the top folder) runs all three suites against the preview backend,
which applies the same rules as the server:

- `npm run test:site`: gold, rate limits, reports and moderation, notifications, weekly threads (23 checks)
- `npm run test:bots`: news parsing and routing, limits, dedupe, stepping back, welcomes, AnswerBot, answer nudges, pause (69 checks, using made-up feed data and a fake Claude)
- `npm run test:account`: sign-up checks, editing and deleting, blocking, search, profiles, data export, account deletion, password reset (48 checks)

---

## Bots

Four labeled bot accounts keep the site lively until real members take over.
Every bot post and comment shows a **Bot** badge, and bots never earn gold,
vote, or receive awards.

| Bot | What it does | Limits |
| --- | --- | --- |
| **NaijaNewsBot** | Posts headlines from Nigerian outlets' public RSS feeds into the right state or topic community, with the outlet, time and a link to the full story | 5 per run, 24 a day, 3 per community a day, max 2 per outlet per run, stories under 36 hours old, never the same story twice |
| **GistStarterBot** | Starts discussion questions in quiet communities; nudges "Ask" posts with no answers after 6 hours | 3 discussions per run, once a week per community; each question nudged once |
| **WelcomeBot** | Welcomes people on their first post, 5 minutes after they post | Once per person |
| **AnswerBot** | Answers "Ask" posts nobody has answered after 45 minutes, using Claude. Gives general, Nigeria-specific guidance, says what to double-check, and signs off as a bot. Declines (and leaves for people) anything needing live news or prices, about private individuals, unsafe, or unclear | 4 per run, 40 a day, questions under 48 hours old, each question once. Needs `ANTHROPIC_API_KEY` |

**Stepping back:** once a community has 15 real posts in the last 7 days, the
news and discussion bots stop posting there. The run history in the admin panel
lists which communities they've stepped back from.

**Controls:** admins see a **Site bots** panel in their profile with Run now,
Pause/Resume and the last three runs (including which news feeds failed).

### Setup

See **Going live** above: the bot settings, the `THREADIT_BOT_SECRET` secret and
the hourly GitHub schedule. Bot code is in `supabase/functions/server/bots.ts`;
limits are in `LIMITS` at the top of that file.

The default feeds are Premium Times, Punch, TheCable, Channels TV, Vanguard and
TechCabal. Check the first run's history in the bot panel: any feed marked as
failed has moved or blocks automated readers, and can be replaced with
`THREADIT_NEWS_FEEDS`.

Run the bot tests with `npm run test:bots` (69 checks, using made-up feed data and a fake Claude).

---

## The hosted preview

`npm run build:preview` (in the top folder) makes one self-contained page
(`dist-preview/threadit.html`) that runs without Supabase. It swaps in a
stand-in backend (`src/preview/`) that applies the same rules but saves in the
viewer's browser, and replaces photos with placeholders. In the preview, the
first account created in a browser is the admin, so you can try the mod queue and
the bot panel. The preview can't reach news sites or Claude, so only the
discussion, welcome and answer-nudge bots run there.

---

## Still to do before a big launch

- **Pidgin review**: have native speakers check `src/app/i18n.ts`. Yoruba, Hausa and Igbo can be added there as new dictionaries.
- **Uploads**: photo and video upload needs Supabase Storage plus image compression.
- **Paid gold top-ups**: needs a Paystack or Flutterwave account, secret keys and a payment webhook.
- **Push notifications**: in-app notifications work now; phone push needs VAPID keys and a service worker on the public site.
- **Scale**: the backend stores data in one key-value table and reads every post to build the feed. Past a few thousand posts, move posts, comments and votes into Postgres tables with indexes.
