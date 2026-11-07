# Shipping acceptance — section 12

Production: https://padel-tourney-5q8r.vercel.app

This document distinguishes a failed or outstanding acceptance check from a known software defect. Final live measurements are recorded after the shipping deployment.

| Definition of done | Status | Evidence / limit |
| --- | --- | --- |
| A new user can create an 8-player, 2-court tournament and share it in under a minute | Pending final live run | Dedicated `e2e/ship.spec.ts` checks a fresh 390px mobile browser, eight players, two courts and a token-free player-share payload. Native sharing is shimmed; no message is sent. |
| Scores entered on one phone appear on another within about 2 seconds | Pending final live run | Two independent mobile browser contexts; acceptance test enforces a measured update below 2 seconds. These are emulated devices, not physical phones. |
| Rotations and sit-outs are fair per section 5, proven by passing tests | PASS | 26 tests pass, including the section 6 seeded rotation/sit-out/scoring cases, target changes, edits and roster changes. Pairing is the specified randomised heuristic, not a proof for every possible random seed. |
| Admin-only actions are rejected without a valid admin token, verified server-side | Pending final live run | SQL permission suite and anon-key API checks pass. Dedicated live acceptance test attempts all six admin RPCs with null and invalid tokens and requires 12 permission denials. |
| Fully usable one-handed on a phone in bright light | FAIL — physical acceptance unverified | 390px browser checks pass for layout, 48px controls, high-contrast colours, sheets, reduced-height editing and overflow. An agent cannot certify real one-handed sunlight use; a human phone check remains. |
| No console errors and no placeholder text | Pending final live run | Dedicated normal-flow check captures both browser consoles and runtime exceptions. Starter assets and obsolete handoff CSS are removed; source scan found no starter UI copy. Loading and error messages are intentional states. |

## Additional release checks

- Local: 26 unit tests, eight browser checks, ESLint and production build pass.
- Database: lint, rolled-back SQL security/lifecycle suite, and hosted API/Realtime/concurrency smoke checks pass.
- Sharing: original 1200×630 PNG, Open Graph and large-image card metadata are present in raw HTML for home and tournament URLs; SVG/PNG favicon and Apple touch icon are included. Actual WhatsApp/iMessage rendering and caches are not claimed verified.
- Secrets: tracked files and Git history checked for `.env` files; none found. No auth/Vercel local files are tracked. Credential-pattern scan is a review aid, not an absolute guarantee.
- AI export: one matching local session found and exported with redactions; no missing referenced source file. Internal instructions/reasoning and unrelated sessions are excluded. An active-session cutoff is documented in `ai/manifest.json`.
