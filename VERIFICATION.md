# Milestones 5 and 6 verification — 7 November 2026

Application: https://padel-tourney-5q8r.vercel.app

Tested application commit: `3297e1a` (with database migration `20261107160000_live_tournament_and_roster.sql`). Vercel production deployment: `dpl_TR33ysdDFkK5ReRSUS1336p4Jmnc`.

## Results

- 22 Vitest pure-logic tests passed.
- Five Playwright browser checks passed locally and the same five passed against the public Vercel URL.
- Build and ESLint passed; Supabase database lint reports no schema errors.
- The rolled-back SQL security/lifecycle suite passed after migration, including RLS and private-secret access, snapshot isolation, stale-score rejection, queued roster changes, and historical name preservation.
- Hosted anon-key API, Realtime delivery and concurrent next-round advancement smoke tests passed.
- Synthetic browser/API fixtures were removed; no admin links or credentials are included in this report.

## Two independent mobile browser sessions

The lifecycle test used isolated browser contexts with separate storage, each at 390×844 with mobile/touch emulation. One context opened the admin link and the other opened the player link. On the live site, score propagation was observed within 513 ms including the score-sheet interaction, as one measured sample rather than a latency guarantee.

The test exercised:

1. Creation of a nine-player, two-court tournament and shared-link access.
2. Addition, removal and renaming while the current round was still unscored, including a rename from the player link. The current draw retained its names and players; the next draw applied changes and the late joiner was labelled “Joins from round 2”.
3. Player score entry, server-set attribution and live updates in the admin session.
4. A score sheet left open while another session edited that match; Save was disabled until the latest score was reviewed. SQL tests separately proved that a stale expected timestamp is rejected server-side.
5. Completion-gated advancement and changing the next target from 24 to 21.
6. Read-only historical browsing on the player link, historical admin corrections, and live leaderboard updates including half-point compensation and removed players’ results.
7. An offline/online transition, the Reconnecting indicator, a score entered while the other session was disconnected, and correct results after rejoining.
8. Confirmed early advancement, a 0–0 forfeiture of the pending court, and a later admin correction.
9. Ending the tournament through the menu, final standings on both links, and removal of player editing controls.

## Limits

These were browser-emulated devices, not two physical phones. A real-phone sunlight, keyboard and native-share review remains for milestone 7/final handover. Native sharing is implemented; automated coverage verifies copy and fallback paths rather than a physical operating-system share sheet. No physical-device test is claimed.

The production configuration uses the confirmed Supabase URL and public publishable key. Backend admin tokens remain hashed in the private schema, while the organiser’s browser retains the bearer credential as specified for recovery. The repository is also attached to a separate Vercel project; verification here concerns only the Padel Genie app named above.

## Section 8 polish — 7 November 2026

Before changes, the principal snapshot query averaged 2.13ms over 325 calls (maximum 16.13ms). Two read-only HTTPS samples took 312ms and 128ms; the sampled live home and round screens became ready in 740ms and 483ms respectively. These are limited measurements from this machine, not a reproduction of the user's phone/network delay.

The links screen now uses one snapshot RPC rather than five table reads. In-flight requests are deduplicated, navigation can reuse a public in-memory snapshot, and explicit refreshes retain the existing Realtime socket. Initial JavaScript fell from about 110KB gzip to 89KB gzip, with tournament-only code in a separate approximately 23KB gzip chunk. Fonts are served locally as two variable WOFF2 assets with font-display: swap; the Google Fonts stylesheet is removed.

End tournament is visible in the admin dock and still requires confirmation. Duplicate checks now give immediate, input-adjacent guidance for case/whitespace variants and pending names, highlight duplicate rows, and disable submission for known conflicts. The database guard covers creation, additions and pending renames without rewriting historical names.

The 390px review covers home, create, links, current and past rounds, leaderboard, Players, score entry, early-start and end confirmations, final standings, and failure/empty states. Important status text is at least 14px; controls retain 48px minimum targets. The brand colours retain measured contrast against cream of 17.06:1 for ink, 11.25:1 for green, and 4.84:1 for terracotta. The review also checks long names, malformed gateway responses, reduced-height viewports for keyboard space, safe dock padding, and overflow. Actual sunlight and physical virtual-keyboard testing still require a phone.


Polish release `a7a1408` was verified on production deployment `dpl_2jBgmQP3sD5KDaZor6RL8BBEqeFQ`. All six browser checks passed locally and on the public Vercel URL, including socket reuse during saves, duplicate controls, reduced-height roster editing, malformed-response recovery and zero external Google Fonts requests. The live two-session score update sample took 654ms including sheet interaction. All 23 unit tests, build, ESLint, database lint and SQL security checks passed. Test tournaments were cleaned up. The physical-phone/sunlight limit above still applies.
