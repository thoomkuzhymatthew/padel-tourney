# Padel Genie Americano

A mobile-first web app for running a padel Americano: add players and courts, generate fair rotations, and share tournament links. Designed at 390px for use beside a court, using Padel Genie’s court green, terracotta, cream, Inter and Bricolage Grotesque.

## Current functionality

- Create a tournament with 4–40 players, 1–10 courts, and 16/21/24/32 points per match.
- Enter names quickly with Enter, or paste a comma/newline-separated list. Edit or remove names before starting.
- Generate and persist the first round through the secured `create_tournament` RPC.
- Copy/share separate player and admin links, with native sharing and manual-copy fallbacks.
- Resume tournaments saved on this browser; refresh the links screen without losing access.
- One shared tournament layout: current and past rounds, a no-keyboard score sheet, individual standings and Realtime updates.
- Players can enter or correct current-round scores and browse past rounds read-only. Admins can edit any past result, advance early with a confirmed 0–0 forfeiture, change the next target, and end the tournament.
- Roster changes work during active rounds and apply to the next draw. New players show “Joins from round N”; current and historical draws retain their original names.
- An admin dock keeps next-round controls reachable; the end action lives in a menu. Final standings appear on both links when the tournament ends.
- An open score sheet detects remote edits; stale saves are rejected server-side. Disconnected sessions keep their confirmed results, show “Reconnecting…”, and refetch after the subscription rejoins.

## Run locally

Use Node 22+ and npm. Run `npm install`, then create an ignored `.env.local` in the repository root:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

`VITE_SUPABASE_ANON_KEY` is also supported for a legacy anon key. **Never use a service-role/secret key in any Vite variable.** Only the URL and public key belong in the frontend.

Run `npm run dev`. Vercel needs the same public environment variables when deployed. The app uses browser routing; `vercel.json` rewrites routes to `index.html`.

## Validation

- `npm test`: 22 seeded pure-logic tests for pairing, sit-outs, scoring, historical edits, target changes, roster changes and tie-breaks.
- `npm run lint` and `npm run build`: lint and production type/build checks.
- `npx playwright install chromium`, then `npm run test:e2e`: five browser checks at 390×844 and desktop, including actual Supabase creation, resume, double-submit protection, RPC failure, blocked storage, copy/share fallbacks, and a full two-session tournament lifecycle. These tests use the configured project and authenticated Supabase CLI to remove their synthetic fixtures; run them against a development project.
- Browser screenshots are generated under ignored `artifacts/`. Traces and automatic failure screenshots are disabled to avoid retaining private links.

The database has versioned migrations, RLS, RPCs, a local seed, and SQL/API security checks. See [supabase/README.md](supabase/README.md) for migration commands, authorization details and the client contract. Local Docker verification is separate from the hosted tests already run.

## Decisions and recovery

Pure TypeScript rotation/scoring functions live in `src/lib/`. The leaderboard is derived from round results and sit-out compensation. Server-side RPCs validate mutations, and public reads require a tournament-specific share header. Admin tokens are random bearer credentials, stored on the server only as hashes in an unexposed private schema.

The organiser’s browser intentionally retains the plaintext admin credential in localStorage for recovery. Admin URLs put it in the fragment, never a query string. Links are excluded from application logs and referrers. If storage fails, links remain available and the organiser is prompted to save the admin link. Creation is a single POST with no automatic retry; an interrupted response may have created a tournament, so the error explains that uncertainty.

The links screen can render from a successful creation response even if a follow-up read fails. “Open tournament” points directly to `/t/{shareId}/admin#{adminToken}`; the links screen has its own `/t/{shareId}/links#{adminToken}` route. Resume reopens the links screen.

See [ASSUMPTIONS.md](ASSUMPTIONS.md) and [DECISIONS.md](DECISIONS.md) for the implementation choices and [AGENTS.md](AGENTS.md) for the brief.

## Deliberate omissions and next steps

Accounts/logins add friction to a courtside tool. Mexicano is the natural next format after Americano. Timed games and sets use different scoring models. Voice input, payments, leagues, cross-tournament profiles/history and native apps are outside this trial’s scope. Email recovery is deferred; local recovery and copying the admin link cover this milestone.

Milestones 5 and 6 include interactive scoring, computed standings, live updates and organiser controls. Remaining work is the wider polish/real-phone review and final handover. Browser tests emulate independent mobile devices; physical phone testing still needs a human.

## Live deployment

The Padel Genie application uses the Vercel project `padel-tourney-5q8r`, at https://padel-tourney-5q8r.vercel.app. The repository is also connected to another Vercel project; do not change its aliases or configuration when deploying this app. The confirmed public Supabase configuration is set for production and preview on the Padel Genie project. Local Vercel metadata and downloaded environment files are ignored.

To run the same browser checks against the deployed app: `E2E_BASE_URL=https://padel-tourney-5q8r.vercel.app npm run test:e2e`. The two-session test covers next-draw roster edits, current and past score permissions, stale edits, target changes, compensation, live score propagation, reconnect recovery, early advancement, admin correction and final standings. Its synthetic tournament is removed afterward.
