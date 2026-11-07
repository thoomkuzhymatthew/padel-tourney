# Tournament database

The linked hosted project is `tourney` (`qfoqchqjqcctobilyyvm`). CLI machine-local linkage and all environment files are ignored. Never expose a database password, access token, service-role key, or admin token in source control.

## Migrations and verification

- `npx supabase start`: start the local Docker stack.
- `npx supabase db reset`: apply local migrations and the local-only demo seed.
- `node scripts/test-database.mjs`: run security/lifecycle checks locally inside a rolled-back transaction.
- `node scripts/test-database.mjs --remote`: run the same rolled-back checks on the linked project.
- On an empty target only, add `--rehearse` to create and test the entire schema within that same rolled-back transaction.
- `npx supabase db push --remote --dry-run`: review pending hosted migrations.
- `npx supabase db push --remote --yes`: apply migrations. Never add `--include-seed` for hosted deployment.
- `node scripts/smoke-database.mjs`: exercise the hosted Data API and WebSocket using the anon key, including concurrent advancement; temporary tournaments are deleted afterward using authenticated CLI access.

The scripts use the authenticated CLI for privileged inspection and cleanup, never the frontend. CLI credentials must be configured separately from the public application key. The seed discards the one-time admin credential and does not print it; create a fresh tournament to exercise admin controls.

## Client contract

All database writes use RPCs. Pass player UUIDs and names as `p_players: [{id, name}, ...]` to `create_tournament`, together with `p_round` from `generateRound`. The create result contains `share_id` and the **one-time** plaintext `admin_token`; persist the token only in the organiser’s browser per AGENTS.md. The database stores only a 32-byte SHA-256 digest of a random 256-bit token, in `private.tournament_secrets`. There is no token recovery/read RPC.

Reads of every public application table require the HTTP header `x-tournament-share-id: <share_id>`. Without the correct share capability, RLS returns no tournament rows. Use a client scoped to each tournament; a frontend `.eq()` filter alone is not authorization. The share link permits viewing, player renaming, and current-round scoring, as specified in the brief.

`start_next_round` accepts a complete generated snapshot with the next number and target. The server validates that every eligible player appears exactly once and that the court count is correct. It does not trust supplied scores. All mutations lock the tournament row, preventing roster changes or two advancements racing through state checks. The database does not reproduce the randomised fairness search; that remains in the tested pure generator.

`set_round_target` changes the default target for the next round. `start_next_round` stores that new round’s immutable target. Old scores and sit-out compensation remain attached to their original targets. `p_confirm_unscored: true` explicitly forfeits pending matches as 0–0; normal scores must sum to the round target. Admin overrides can replace forfeitures and correct results after ending; player writes stop when finished.

Names are trimmed, 1–60 characters for players, 1–100 for tournament names; player names are unique ignoring case/outer whitespace, including removed players. There are 4–40 active players and 1–10 courts. Roster changes can happen during any active round. Late joiners begin the next draw; removals exclude players from future draws while preserving existing matches. Renames are queued in pending_name and applied on advancement; rounds store player_names snapshots so historical names remain as drawn.

## Security and Realtime

- All six tables have RLS. Application roles have SELECT only on the five public tables and no direct writes.
- The private schema, secrets table, and internal functions have no public/anon/authenticated access. The private schema is not exposed by the Data API.
- Mutation functions use `SECURITY DEFINER SET search_path = ''`, qualified object references, explicit EXECUTE grants, and server-side authorization/validation. An admin RPC being callable by `anon` does not grant admin rights: the tournament-specific token is still required.
- Never put the admin token in query strings, telemetry, application logs, or Realtime. Send it only in HTTPS RPC bodies. Browser recovery intentionally retains the bearer credential; server storage retains its hash only.
- Subscribe to public Broadcast topic `tournament:<share_id>`, event `changed`. Broadcasts contain only an invalidation (Supabase may attach a message UUID), never tournament rows or credentials. Refetch with the scoped REST header and debounce bursts. Clients must not trust broadcast payloads as data or authorization. Someone who knows the share capability can cause extra refetches, but cannot bypass database checks.
- Raw Postgres Changes publication is intentionally not enabled: custom REST headers are not a reliable authorization context for that transport. Secrets are never published.
- A fresh hosted project initializes Realtime message partitions on its first Realtime connection. Verify actual WebSocket delivery before relying on database broadcasts.

References: https://supabase.com/docs/guides/database/functions and https://supabase.com/docs/guides/realtime/broadcast

## Verification on 7 November 2026

The migrations were first rehearsed inside a rolled-back transaction, then applied through the authenticated CLI. Post-deployment SQL security/lifecycle tests passed, including the local seed executed inside a rolled-back transaction. Actual anon-key REST and WebSocket checks passed: scoped reads, hidden secrets, rejected direct writes and invalid tokens, rejected cross-tournament scoring, admin overrides, live invalidation delivery, and two simultaneous next-round requests producing exactly one new round. Fixtures were removed afterward. Database lint reports no schema issues. The local Docker stack was not run on this machine.

Supabase security advisors report the expected `anon_security_definer_function_executable` and `authenticated_security_definer_function_executable` warnings for the nine public RPCs. This exposure is deliberate for the brief’s no-account model and explicitly granted in the migration. Admin functions require a valid tournament-specific token; player functions require the share capability and enforce membership/current-round rules. Internal helpers remain inaccessible. Do not blindly revoke these API grants to silence the warnings; retain and rerun the permission tests when changing them.


## Milestones 5 and 6

Migration `20261107160000_live_tournament_and_roster.sql` implements the approved next-draw roster changes, round name snapshots, the share-scoped `get_tournament_snapshot` read RPC, and optimistic score concurrency. The read RPC is `SECURITY INVOKER` and requires the share header as well as its matching share argument; it never reads private tables. Score RPCs now accept optional `p_expected_updated_at`, which the UI always supplies. A stale value raises SQLSTATE `40001` rather than overwriting a more recent score.

For a rehearsal of just a new migration against an already-migrated target, use `node scripts/test-database.mjs --remote --migration=<filename.sql>`; changes and test fixtures roll back together. Full `--rehearse` is reserved for empty targets. The updated SQL suite verifies next-round additions and removals, pending renames, stable historical names, snapshot scope, and stale score rejection in addition to the existing permissions and lifecycle checks.
