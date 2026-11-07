# AGENTS.md — Padel Americano Tournament App (Solved trial, Part 1)

Read this whole file before writing any code. It is the source of truth for this project.

---

## 1. Context

This is a paid trial project for **Solved** (solved.studio), a London product studio that builds and launches products fast. Solved runs **Padel Genie** (padelgenie.io), a UK padel market-intelligence platform.

The brief: build a **free web app that lets padel players run a tournament** (an Americano). Players and courts go in, fair rotations come out, scores are entered as games finish, and there is a live leaderboard and a shareable link. It must work **on a phone, standing at the side of a court**.

Solved has no plans to launch this. They are judging how a small product goes from idea to something live that real people could use. Evaluation criteria:

- **Shipping:** live, usable, finished.
- **Resourcefulness:** what was included or left out, and why.
- **AI fluency:** how the tools are driven.
- **Product and commercial sense.**
- **Taste:** deliberate product, design and content decisions.

**Time budget: about 4 hours total.** Prefer a small, finished, polished product over a large, half-working one. Do not add features outside this file without asking.

---

## 2. How to work with me

- **Plan before building.** For each milestone, write a short plan (5–10 lines) and wait for my approval before writing code.
- **Report back briefly.** End every task with at most 4 lines: what changed, anything needing my decision, and risks or loose ends. No code dumps or long explanations unless I ask.
- **Log assumptions.** Whenever you make a judgement call the spec doesn't cover, add a one-line entry to `ASSUMPTIONS.md` and keep going.
- **Log decisions.** Add notable product or design decisions, with a one-line reason, to `DECISIONS.md`.
- **Small commits** with clear messages, one per meaningful step.
- **Test the core logic** (Section 6) before building UI on top of it.
- Never commit secrets. Only the Supabase anon/publishable key may appear in front-end code.

---

## 3. Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS. Single-page app with client-side routing.
- **Backend:** Supabase (Postgres, Row Level Security, RPC functions, Realtime).
- **Hosting:** Vercel, deployed from the GitHub repo.
- **Tests:** Vitest for pure logic. Optional Playwright smoke test at a 390×844 mobile viewport.
- Keep dependencies minimal. No UI kit unless it clearly saves time.

Keep the rotation and scoring logic as **pure TypeScript functions** in `src/lib/` (no database or React imports), so they can be unit-tested.

---

## 4. Product spec

### 4.1 Roles and links (no accounts, no logins)

Creating a tournament produces two links:

| Link | Who | Can do |
|---|---|---|
| **Admin link** | Organiser (and anyone they trust) | Everything: edit players, enter or override any score, change the points target, start the next round, end the tournament |
| **Player link** | Everyone else | View rounds and leaderboard; enter scores for current-round matches; edit player names |

- URL shape: player view at `/t/{shareId}`, admin view at `/t/{shareId}/admin#{adminToken}`. The admin token goes in the URL **fragment** so it isn't sent in requests, logs or referrers.
- `shareId` and `adminToken` are long random, unguessable strings.
- **Only the admin can advance rounds.** That keeps control of the pace with one person.

### 4.2 Admin link recovery

Losing the admin link would break the tournament, so:

1. On creation, save `{shareId, adminToken, name, createdAt}` in `localStorage`. The home page shows "Your tournaments" with a **Resume** button for each.
2. After creation, show a clear screen with both links, a **Copy** button for each, and a **Share** button using the Web Share API (falls back to copy). Prompt the organiser to send the admin link to themselves.
3. **Stretch (P2):** optional email field to email the admin link to the organiser. Skip if short on time and note it as a next step.

### 4.3 Create flow (target: under 60 seconds)

The home page has one primary action: **Create tournament**.

Form fields, all with sensible defaults:

- **Tournament name** (optional; default like "Saturday Americano").
- **Players:** a fast name entry list. Pressing enter adds the next name, and pasting a list of names (one per line or comma-separated) splits them automatically. Minimum 4 players. Prevent empty and duplicate names.
- **Courts:** stepper, default 2.
- **Points per match:** preset chips **16 / 21 / 24 / 32**, default **24**.

Pressing **Start** creates the tournament, generates round 1, and shows the links screen, then the admin view.

If players are fewer than `courts × 4`, use only `floor(players / 4)` courts and tell the admin.

### 4.4 Running the tournament

**Current round view** (the main screen on both links):

- One card per court: **Court N**, the two pairs (Team A vs Team B), and the score or an **Enter score** button.
- A clear list of who is **sitting out** this round.
- Round number and the round's points target are always visible.

**Score entry (no keyboard):**

- Tapping **Enter score** opens a sheet with a grid of large buttons from **0 to the round's target** for Team A's score.
- One tap selects Team A's score; Team B's score fills in automatically as `target − scoreA`.
- Then a single **Save** button. Draws (e.g. 12–12 at 24) are allowed.
- Record who entered it (`admin` or `player`) and when. Show a subtle marker so mistakes are easy to spot.

**Advancing rounds:**

- When every match in the current round has a score, the admin sees a prominent **Start round N+1** button.
- The admin can also start the next round early (with a confirm) if a court is running late; unscored matches then need confirmation and count as 0–0 unless scored later by the admin.
- Before starting the next round, the admin can **change the points target** for that round (common when court time runs out).
- Rounds are open-ended. Show a gentle hint of the round count where everyone has partnered everyone once (`players − 1` for full coverage), but don't enforce it.

**Editing:**

- **Admin** can tap any past match and edit its score; the leaderboard recalculates automatically.
- **Players** can enter or change scores only for matches in the current round.
- Admin can add or remove players **between rounds**. A late joiner starts on 0 points; record this in `ASSUMPTIONS.md`. A removed player keeps their past results but is excluded from future rounds.
- Player names can be edited from either link; the admin can always correct them.

**Ending:**

- Admin taps **End tournament** (with confirm). Show final standings with the top three highlighted. The player link shows the same final view.

### 4.5 Leaderboard

- Always visible from a tab or toggle on both links, updating live.
- Columns: rank, name, **total points**, games played, wins, points difference (points for minus against).
- Sort by total points, then wins, then points difference, then name.
- The leaderboard is **always computed from match results plus sit-out compensation**, never stored separately, so any edit recalculates everything.

### 4.6 Live updates

- All devices viewing a tournament update in real time when scores, rounds or players change (Supabase Realtime, filtered by tournament).
- If the connection drops, show a small "Reconnecting…" indicator and refetch on reconnect.

---

## 5. Americano rules (implement exactly)

### 5.1 Scoring

- Each match is played to a fixed **total** of points equal to the round's target (e.g. 24). Scores always sum to the target: 15–9, 12–12, 24–0.
- Each player receives **their team's score** as individual points. A 15–9 match gives both Team A players 15 and both Team B players 9.
- Partners change every round, so players are ranked **individually** by total points.

### 5.2 Sit-outs

Each round, the number of active players is `min(courts, floor(players / 4)) × 4`. The rest sit out.

Choose who sits out:

1. Players with the **fewest sit-outs so far** sit out first.
2. Avoid anyone who **sat out last round**, unless impossible.
3. Break remaining ties randomly.

### 5.3 Sit-out compensation

- Each player sitting out a round receives **half that round's target** (12 at 24, 8 at 16, 10.5 at 21).
- Compensation uses the target **of the round they sat out**, so it adjusts automatically when the admin changes the target mid-tournament.
- Sit-outs do **not** count as games played, wins or points difference.
- Display decimals only when needed (e.g. 10.5).

### 5.4 Pairing (fair rotation)

Goal: everyone partners as many different people as possible, and opponents are spread out.

Algorithm (randomised search, fast enough for up to ~40 players):

1. Track `partnerCount[a][b]` and `opponentCount[a][b]` from all previous rounds.
2. Generate many candidate rounds (e.g. 2,000): shuffle the active players, split into courts of 4, and within each court try the 3 possible pairings.
3. Score each candidate with cost = `Σ partnerCount² × 10 + Σ opponentCount² × 1` over the pairings it would create.
4. Keep the lowest-cost candidate; break ties randomly.
5. **Generate each round once and store it.** Never regenerate a round that already exists.

Round 1 is a random draw.

---

## 6. Required tests (Vitest, pure functions)

Write these before the UI:

- **Pairing:** with 8 players over 7 rounds, no partner pair repeats if avoidable. With 12 players, partner repeats are minimal.
- **Sit-outs:** with 5, 6, 7, 9, 10 and 11 players on 2 courts, sit-outs differ by at most 1 between players after N rounds, and no one sits out twice in a row when avoidable.
- **Scoring:** Team B's score always equals `target − scoreA`. Leaderboard totals equal match points plus compensation.
- **Target changes:** change the target mid-tournament with players sitting out; compensation uses each round's own target.
- **Edits:** editing a past score recalculates the leaderboard correctly.
- **Late joiner and removal:** adding a player between rounds works; a removed player keeps past points and never appears in future rounds.
- **Courts vs players:** with 6 players and 2 courts, only 1 court is used.

---

## 7. Data model (Supabase)

Suggested tables. Use UUID primary keys.

- **tournaments:** `id`, `share_id` (unique), `name`, `courts`, `default_target`, `status` (`active` | `finished`), `created_at`.
- **tournament_secrets:** `tournament_id`, `admin_token_hash`. **No public read access, ever.**
- **players:** `id`, `tournament_id`, `name`, `active` (bool), `joined_round`, `created_at`.
- **rounds:** `id`, `tournament_id`, `number`, `target`, `status` (`in_progress` | `complete`), `created_at`.
- **matches:** `id`, `round_id`, `court`, `team_a` (array of 2 player ids), `team_b` (array of 2), `score_a`, `score_b`, `entered_by` (`admin` | `player`), `updated_at`.
- **sit_outs:** `round_id`, `player_id`.

### Security rules

- RLS on every table. Public **SELECT** only on tournaments, players, rounds, matches and sit_outs, scoped by tournament. Never expose `tournament_secrets`.
- **All writes go through Postgres RPC functions** (`security definer`), never direct table writes from the client:
  - `create_tournament(...)` returns `share_id` and the plain `admin_token` (shown once, stored hashed).
  - Admin-only functions take the admin token and verify it against the hash: `start_next_round`, `set_round_target`, `override_score`, `add_player`, `remove_player`, `end_tournament`.
  - Player functions take the `share_id`: `submit_score` (current-round matches only, validates `score_a + score_b = target`), `rename_player`.
- Validate everything server-side: score ranges, the sum rule, round status, and name length.
- Round generation can run client-side using the tested pure function, but `start_next_round` must verify the admin token and that the round number is next in sequence, so it can't be created twice.

---

## 8. Design

### 8.1 Brand

Match **Padel Genie's** visual identity so it feels like a Solved product. Their brand uses court green, terracotta and cream.

**Brand tokens:** pull exact colours and fonts from padelgenie.io's live CSS and record them here, for example:

```
--pg-green:      #0d3d2c;
--pg-terracotta: #a9542f;
--pg-cream:      #f5f6f3;
--pg-ink:        #0a160f;
font-family: 'Inter', system-ui, sans-serif;
/* Headings: */
font-family: 'Bricolage Grotesque', 'Inter', sans-serif;
```

Verified from https://padelgenie.io/ live inline CSS on 7 November 2026: green maps to `--forest`, terracotta to `--coral`, cream to `--cream`, and ink to `--ink`. Fonts come from the body and heading rules.

Use their tokens only. **Do not copy their code or assets.** Build all components from scratch. Use their colours mostly as accents and on primary buttons.

### 8.2 Courtside usability (non-negotiable)

- **Mobile-first.** Design at 390px wide, then let it scale gracefully to desktop. One responsive codebase; no device detection.
- **Readable in bright sunlight:** very high contrast (dark text on a light background), no pale greys for important information, bold weights for scores.
- **Big tap targets:** at least 48×48px, comfortable for one sweaty thumb.
- Scores and court numbers are the largest elements on screen.
- Minimal text. Plain, active-voice labels: "Create tournament", "Enter score", "Start round 3", "Copy link".
- Clear empty and error states that say what to do next.
- Respect `prefers-reduced-motion`. Only use motion that confirms an action, like a score saving or a new round appearing.
- Avoid generic SaaS styling: no identical cards with soft grey shadows everywhere, no gradient decoration, no all-caps eyebrow labels.

---

## 9. Out of scope (deliberate omissions)

Do not build these. List them in the README as considered and left out, with reasons:

- Accounts and logins
- Mexicano format (leaderboard-based pairings): the natural next feature
- Timed games or traditional sets scoring
- Voice score entry
- Payments, leagues, player profiles and history across tournaments
- Native apps (the web app covers it)

---

## 10. Milestones

1. **Setup (done by me):** repo, Supabase project, Vercel deploy of a blank page, environment variables.
2. **Core logic and tests:** `src/lib/rotation.ts`, `src/lib/scoring.ts`, all Section 6 tests passing.
3. **Database:** schema, RLS policies, RPC functions, seed script for local testing.
4. **Create flow:** home page, create form, links screen, localStorage resume.
5. **Tournament view:** current round, score entry sheet, sit-outs, leaderboard, realtime.
6. **Admin controls:** next round, target change, score override, add/remove players, end tournament.
7. **Polish:** brand styling, sunlight contrast check, empty and error states, mobile testing on a real phone.
8. **Ship:** deploy, smoke test the live URL on two phones at once, finish the README.

---

## 11. Deliverables

- **Live URL** on Vercel.
- **GitHub repo** with:
  - `README.md`: what it is, how to use it, key decisions, deliberate omissions, what I'd build next, and how to run it locally.
  - `ASSUMPTIONS.md` and `DECISIONS.md`.
  - `AGENTS.md` (this file) and the agent session transcripts.

## 12. Definition of done

- A new user can create an 8-player, 2-court tournament and share it in under a minute.
- Scores entered on one phone appear on another within about 2 seconds.
- Rotations and sit-outs are fair per Section 5, proven by passing tests.
- Admin-only actions are rejected without a valid admin token, verified server-side.
- Fully usable one-handed on a phone in bright light.
- No console errors and no placeholder text.
