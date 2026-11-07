"""Export this project's visible Codex history; never copy internal reasoning or credentials."""
from pathlib import Path
from datetime import datetime, timezone
import collections
import json
import re
import sqlite3

REPO = Path(__file__).resolve().parents[1]
CODEX = Path.home() / '.codex'
OUT = REPO / 'ai' / 'transcripts'
OUT.mkdir(parents=True, exist_ok=True)


def redact(value):
    # Exported messages/tool logs may contain bearer credentials or private URLs.
    value = re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]', value)
    value = re.sub(r'\b(?:sb_(?:secret|publishable)_|sk-(?:proj-)?)[A-Za-z0-9_-]{12,}', '[REDACTED_API_KEY]', value)
    value = re.sub(r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|vcp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})', '[REDACTED_ACCESS_TOKEN]', value)
    value = re.sub(r'(?i)\b[0-9a-f]{64}\b', '[REDACTED_TOKEN]', value)
    value = re.sub(r'(?i)(/t/[0-9a-f]{48}/(?:admin|links)#)[^\s\"<>]+', r'\1[REDACTED_TOKEN]', value)
    value = re.sub(r'data:image/[^;\s]+;base64,[A-Za-z0-9+/=]+', '[IMAGE_DATA_OMITTED]', value)
    return value


paths = set()
state = CODEX / 'state_5.sqlite'
if state.exists():
    con = sqlite3.connect(f'file:{state}?mode=ro', uri=True)
    for (path,) in con.execute("select rollout_path from threads where cwd like ? or git_origin_url like ?",
                              (str(REPO.parent) + '%', '%thoomkuzhymatthew/padel-tourney%')):
        paths.add(Path(path))
    con.close()
for path in (CODEX / 'sessions').rglob('*.jsonl'):
    try:
        with path.open() as source:
            meta = json.loads(next(source)).get('payload', {})
        if str(meta.get('cwd', '')).startswith(str(REPO.parent)):
            paths.add(path)
    except (ValueError, StopIteration, OSError):
        pass

manifest = {'exportedAt': datetime.now(timezone.utc).isoformat(), 'sources': [], 'missing': [],
            'policy': 'Visible user/assistant messages and tool calls/results only. Internal instructions, reasoning, encrypted payloads, context and auth files excluded. Credentials redacted. Active-session snapshot stops at the last complete record available at export.'}
for path in sorted(paths):
    if not path.exists():
        manifest['missing'].append(path.name)
        continue
    records = []
    counts = collections.Counter()
    last_timestamp = None
    for line in path.open():
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if record.get('type') != 'response_item':
            continue
        payload = record.get('payload', {})
        kind = payload.get('type')
        exported = {'timestamp': record.get('timestamp'), 'type': kind}
        if kind == 'message' and payload.get('role') in ('user', 'assistant'):
            # Codex stores visible assistant messages with commentary/final phases;
            # reasoning has its own response type, which is excluded below.
            if payload.get('role') == 'assistant' and payload.get('phase') not in (None, 'commentary', 'final_answer', 'final'):
                continue
            texts = [part.get('text', '') for part in payload.get('content', [])
                     if part.get('type') in ('input_text', 'output_text', 'text')]
            if not texts:
                continue
            exported.update(role=payload['role'], phase=payload.get('phase'), text=redact('\n'.join(texts)))
        elif kind in ('function_call', 'custom_tool_call'):
            exported.update(name=payload.get('name'), call_id=payload.get('call_id'),
                            arguments=redact(str(payload.get('arguments', payload.get('input', '')))))
        elif kind in ('function_call_output', 'custom_tool_call_output'):
            exported.update(call_id=payload.get('call_id'), output=redact(str(payload.get('output', ''))))
        else:
            continue
        records.append(exported)
        counts[kind] += 1
        last_timestamp = record.get('timestamp')
    target = OUT / path.name.replace('rollout-', 'session-')
    target.write_text(''.join(json.dumps(record, ensure_ascii=False) + '\n' for record in records))
    manifest['sources'].append({'sourceFilename': path.name, 'export': str(target.relative_to(REPO)),
                                'recordCounts': dict(counts), 'cutoff': last_timestamp})
(REPO / 'ai' / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(REPO / 'ai' / 'AGENTS.md').write_text((REPO / 'AGENTS.md').read_text())
print(json.dumps({'sessionsExported': len(manifest['sources']), 'missingSources': manifest['missing'],
                  'records': sum(sum(s['recordCounts'].values()) for s in manifest['sources'])}))
