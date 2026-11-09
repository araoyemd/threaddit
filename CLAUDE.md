# Threadit — notes for Claude

Threadit is a live community forum for Nigeria (English and Pidgin). The owner
asks Claude to make changes and run the bots; Claude maintains this repo.
README.md has the full feature list and setup.

## Layout

- `src/app/` — the React app (all screens). Shared by the public site and the preview.
- `src/preview/` — browser-only stand-in backend for the hosted preview. It mirrors
  the server's rules; **when you change a rule in the server, change it here too**
  (the tests run against this stand-in).
- `supabase/functions/server/index.tsx` — the backend (Hono on Supabase Edge
  Functions, Deno). Deployed as the function `make-server-8937b06c`; keep that name
  and the `/make-server-8937b06c` route prefix, or every client URL breaks.
- `supabase/functions/server/bots.ts` — all bots (NaijaNewsBot, GistStarterBot,
  WelcomeBot, AnswerBot). Plain TypeScript, no Deno/browser APIs, so the tests,
  the server and the preview all use it. Limits are in `LIMITS`.
- `supabase/functions/server/kv_store.tsx` — storage helper. All data is JSON in
  one table, `kv_store_8937b06c`, under key prefixes (`post:`, `comment:<postId>:`,
  `profile:`, `gold:`, `notifs:`, bot flags, etc.).
- `web/` — Next.js public site (server-rendered pages, SEO, share images). Imports `../src`.
- `tests/` — `npm test` runs site rules, bots and account suites (esbuild + node).

## Before every push

```bash
npm test                     # all suites must pass
npm run build                # the app
(cd web && npx next build)   # the public site (also type-checks src/)
(cd supabase/functions/server && deno check index.tsx)   # the backend
```

CI runs the same on every push. Add or update tests for any rule you change.

## Deploying

- Push to `main` → Vercel deploys `web/`; the **Deploy backend** workflow deploys
  the function if `supabase/functions/**` changed (it runs the tests first).
- For risky changes, push a branch first: Vercel gives it a preview URL. Tell the
  owner the link and merge after they approve.
- Never edit in Figma Make; never commit secrets. The anon key in
  `utils/supabase/info.tsx` is public by design; the service-role key, bot secret
  and Anthropic key live only in Supabase function secrets / GitHub secrets.

## Running the bots

- Scheduled hourly by `.github/workflows/bots.yml`. To run now:
  `gh workflow run bots.yml -R araoyemd/threaddit` (optionally `-f jobs=news,answer`),
  then `gh run list -R araoyemd/threaddit -w bots.yml` and `gh run view <id> --log`.
- Jobs: `news`, `gist`, `welcome`, `answer`, `helper`. Admins can also Run/Pause from
  the Site bots panel in their profile.
- Bots must always be labelled bots (`isBot: true`, `authorId` starting `bot:`),
  never pose as people, earn gold, vote or receive awards. News posts link to the
  source and never copy article text; AnswerBot must not invent current facts
  (prices, dates, numbers) and declines with SKIP when unsure.

## Style

- User-facing text: plain, friendly, short sentences; Nigerian context. Every new
  interface string goes in `src/app/i18n.ts` with a Pidgin version.
- Keep the app light on data (many users are on mobile data): lazy-load heavy parts.
