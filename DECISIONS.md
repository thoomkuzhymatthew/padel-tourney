# Decisions

- Keep rotation and scoring independent of React and Supabase so the same logic can be tested and reused.
- Inject randomness into rotation; seeded tests can reproduce failures while production uses Math.random.
- Store score state explicitly (unscored, scored, forfeited) to distinguish a pending match from an early-advance 0–0 exception.
- Derive standings from round snapshots and results, preserving removed players and each round’s own compensation target.
- Brand tokens were verified from Padel Genie’s live CSS on 7 November 2026 and recorded in AGENTS.md §8.1.
