# AI working files

- `AGENTS.md`: copy of the project brief and working rules at shipping time; the root file is the maintained version.
- `transcripts/*.jsonl`: exported visible conversation and tool history from the matching local Codex rollout.
- `manifest.json`: source filenames, record counts, export time, cutoff and any missing source files.

One project session was found in the local Codex session store. It contains the available conversation across the milestones; no other matching project session was found and none was fabricated. This is a snapshot of an active session, so messages written after its cutoff (including the final shipping reply) are not included.

Exports preserve user/assistant text and tool calls/results, with credentials and private admin tokens redacted. Internal system/developer instructions, private reasoning/encrypted payloads, auth files and unrelated projects are excluded. Raw local session files remain untouched. The redacted export is intentionally not a byte-for-byte copy.

To refresh from the same machine after the conversation finishes: `python3 scripts/export-ai-transcripts.py`. Review the diff and scan for secrets before committing a refreshed export.
