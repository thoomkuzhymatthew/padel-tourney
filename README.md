# Padel Genie Americano

A free, phone-first app for running a padel Americano: fair partner rotations, courtside scoring and live individual standings.
Create a tournament, share one link, and spend more time playing.

**Live:** https://padel-tourney-5q8r.vercel.app

## How to play

1. **Create:** paste 4–40 player names, choose courts and points, then Start. Round 1 is drawn immediately.
2. **Share:** send the player link to everyone. Keep the separate admin link—it controls the tournament. The five most recent tournaments are saved on this browser.
3. **Score:** tap Enter score, choose Team A’s points, then Save. Team B’s points fill automatically; everyone’s standings update live. Sit-outs receive half that round’s target.
4. **Next round:** the organiser chooses the next target and starts the next draw. Early starts require confirmation and give unscored courts 0–0 until corrected. Roster changes apply to the next draw; past rounds stay intact.
5. **Finish:** End tournament shows final standings. The admin can still correct past scores. Players can browse past rounds read-only.

## Why it works this way

- **No accounts:** share links remove courtside friction. The admin credential stays in the URL fragment and is stored server-side only as a hash; RLS and validated RPCs enforce permissions.
- **Fair, revisable results:** tested pure TypeScript handles rotations and standings. Round snapshots preserve the draw; editing a result recalculates points rather than changing a stored leaderboard.
- **One-thumb use:** large score buttons, 48px targets and high-contrast Padel Genie colours. From 900px, courts and the live leaderboard appear side by side; phones keep the compact toggle.
- **Recoverable and responsive:** browser resume plus a prompt to save the admin link; visible reconnect status and stale-score protection. Shared snapshot reads, lazy loading and local fonts keep requests light.

More detail: [DECISIONS.md](DECISIONS.md), [ASSUMPTIONS.md](ASSUMPTIONS.md), [shipping checks](SHIP_CHECKLIST.md).

## Deliberately left out

Accounts, profiles and cross-tournament history would add setup and data-retention work. Payments and leagues expand the product beyond a free tournament tool. Timed games, sets and Mexicano need different rules; voice scoring needs separate usability work. The responsive web app covers the trial without native apps. Email recovery is deferred in favour of saved/admin links.

## What I’d build next

**Mexicano:** use standings to form balanced matches. **Clubhouse big-screen mode:** extend the current wide layout into a distance-readable, auto-rotating display. **A Padel Genie connection:** offer opt-in organiser emails for recovery and relevant follow-up; aggregated, consented event/court demand data could help identify where, when and how often people play. That needs a clear privacy proposition, not silent tracking. These are proposals, not shipped features.

## How I worked with AI

Codex worked through plan-first milestones guided by [AGENTS.md](AGENTS.md), with approval before milestone implementation. Core logic and tests came before the UI; product assumptions and design decisions were logged as the brief evolved. Database permission checks and independent mobile browser sessions tested the full flow locally and on production. [ai/](ai/) contains the brief and a redacted export of the locally available Codex session.

## Run locally

Use Node 22+ and npm:

```sh
npm install
# Create an ignored .env.local with:
# VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
# VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
npm run dev
```

Only a Supabase publishable/anon key belongs in frontend variables. Never use a service-role key. See [database setup](supabase/README.md) for migrations and local seed data.

Run `npm test`, `npm run lint` and `npm run build`. For browser checks: `npx playwright install chromium`, then `npm run test:e2e`. Those checks create synthetic tournaments and require authenticated Supabase CLI access for cleanup; use a development project. Set `E2E_BASE_URL` to test a deployed app.

Physical-phone sunlight and native-share testing still need human confirmation; see the shipping checklist for exact pass/fail evidence.
