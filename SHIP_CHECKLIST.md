# Shipping acceptance — section 12

Production: https://padel-tourney-5q8r.vercel.app

This document distinguishes a failed or outstanding acceptance check from a known software defect. Live measurements below were captured on shipping deployment `dpl_GgtEnQsV5uLTwNa4hcea8zR9AeXt`, application commit `96c641c`, on 7 November 2026.

| Definition of done | Status | Evidence / limit |
| --- | --- | --- |
| A new user can create an 8-player, 2-court tournament and share it in under a minute | PASS — automated | Fresh 390px browser created eight players on two courts and formed the player-share payload in **579ms**. Native sharing was shimmed; no message was sent. This is an automation measurement, not a timed human typing test. |
| Scores entered on one phone appear on another within about 2 seconds | PASS — browser-emulated devices | **381ms** from Save to the other session displaying the score; test enforces below 2 seconds. Separate storage and WebSocket sessions; no physical-phone claim. |
| Rotations and sit-outs are fair per section 5, proven by passing tests | PASS | 26 tests pass, including the section 6 seeded rotation/sit-out/scoring cases, target changes, edits and roster changes. Pairing is the specified randomised heuristic, not a proof for every possible random seed. |
| Admin-only actions are rejected without a valid admin token, verified server-side | PASS | All six admin RPCs were attempted with both null and invalid tokens: **12 HTTP 401/403 denials**, SQLSTATE 42501. SQL and anon-key security checks also pass; private token hashes remain unreadable. |
| Fully usable one-handed on a phone in bright light | FAIL — physical acceptance unverified | 390px browser checks pass for layout, 48px controls, high-contrast colours, sheets, reduced-height editing and overflow. An agent cannot certify real one-handed sunlight use; a human phone check remains. |
| No console errors and no placeholder text | PASS | Both live browser sessions recorded **zero console errors and zero runtime exceptions** in the normal acceptance flow. Starter assets and obsolete handoff code/CSS are removed; no starter UI copy found. Intentional loading/error states and input hints remain. |

## Additional release checks

- Local: 26 unit tests, eight browser checks, ESLint and production build pass. All eight browser checks also pass on the public production URL.
- Database: lint, rolled-back SQL security/lifecycle suite, and hosted API/Realtime/concurrency smoke checks pass.
- Sharing: original 1200×630 PNG, Open Graph and large-image card metadata are present in raw HTML for home and tournament URLs; SVG/PNG favicon and Apple touch icon are included. Actual WhatsApp/iMessage rendering and caches are not claimed verified.
- Secrets: tracked files and Git history checked for `.env` files; none found. No auth/Vercel local files are tracked. Credential-pattern scan is a review aid, not an absolute guarantee.
- AI export: one matching local session found and exported with redactions; no missing referenced source file. Internal instructions/reasoning and unrelated sessions are excluded. An active-session cutoff is documented in `ai/manifest.json`.


## Release outcome

Five definition-of-done checks pass within the stated automated scope. Physical one-handed/bright-light acceptance remains unverified and therefore is **not marked passed**. Native WhatsApp/iMessage cache behaviour and operating-system share sheets also need a human device check. No claim is made that browser emulation substitutes for those observations.

Production was **Ready**, with the original social preview and icons accessible without authentication. The README is approximately 600 words. One matching Codex rollout was found, exported and redacted; there were no missing referenced source files. No environment/auth files or secret-pattern matches were found in the tracked-file review. Test fixture cleanup targets only the generated share IDs.
