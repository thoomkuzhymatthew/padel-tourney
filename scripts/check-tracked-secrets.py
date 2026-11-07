"""Check tracked text files without printing matching credential values."""
from pathlib import Path
import re
import subprocess
import sys

files = list(filter(None, subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')))
forbidden = [p for p in files if Path(p).name.startswith('.env') or p.startswith('.vercel/') or Path(p).name == 'auth.json']
patterns = [
    r'\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}', r'\bsb_secret_[A-Za-z0-9_-]{12,}',
    r'\bgh[pousr]_[A-Za-z0-9]{20,}', r'\bgithub_pat_[A-Za-z0-9_]{20,}',
    r'\bvcp_[A-Za-z0-9_]{20,}', r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
    r'(?i)(?:postgres|postgresql)://[^\s:/]+:[^\s@]{8,}@',
]
findings = []
for filename in files:
    try:
        text = Path(filename).read_text()
    except (OSError, UnicodeError):
        continue
    if any(re.search(pattern, text) for pattern in patterns):
        findings.append(filename)
if forbidden or findings:
    print('FAIL: forbidden tracked files:', forbidden)
    print('FAIL: credential-pattern files (values suppressed):', findings)
    sys.exit(1)
print(f'PASS: {len(files)} tracked files checked; no environment/auth files or credential-pattern matches.')
print('Pattern scan is a review aid, not a guarantee that every possible secret format is detectable.')
