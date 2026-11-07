# Decisions

- Keep rotation and scoring independent of React and Supabase so the same logic can be tested and reused.
- Inject randomness into rotation; seeded tests can reproduce failures while production uses Math.random.
- Store score state explicitly (unscored, scored, forfeited) to distinguish a pending match from an early-advance 0–0 exception.
- Derive standings from round snapshots and results, preserving removed players and each round’s own compensation target.
- Brand tokens were verified from Padel Genie’s live CSS on 7 November 2026 and recorded in AGENTS.md §8.1.
- Put tournament_secrets in an unexposed private schema, revoke all client privileges, and store SHA-256 digests of cryptographically random 256-bit tokens; no read/recovery RPC exists.
- Enforce public read scope using x-tournament-share-id in RLS; share-link capabilities intentionally permit the player actions described in the brief.
- Lock the tournament row for every mutation, then validate state and membership atomically to prevent concurrent advancement and roster races.
- Keep stored round targets immutable; set_round_target updates the next-round default so historical scores and compensation cannot drift.
- Broadcast empty change notifications on unguessable tournament topics and refetch through RLS; do not publish raw rows or secrets through Postgres Changes.
- Validate client-generated round snapshots server-side for exact roster coverage, courts, teams, sequencing and unscored state; keep fairness search in pure TypeScript.
- Use a compact, phone-first create form with Enter/paste name entry, 48px controls, and a sticky Start action; no UI kit.
- Give the links screen its own route, retaining the fragment-only admin token; Open tournament points to the specified admin route.
- Use a small typed fetch adapter for the creation RPC and share-scoped reads, avoiding an SDK dependency before Realtime is needed.
- Retain the confirmed creation summary in browser navigation state so link recovery does not depend on a second successful network request.
- Disable repeated submissions and never automatically retry creation; explain uncertain outcomes without clearing the form.
- Keep browser-test screenshots and reports ignored and disable traces because private admin links may otherwise be retained in artifacts.
- The milestone 4 handoff shows the stored round draw on both public and admin routes, keeping shared links usable before interactive tournament controls are added.
