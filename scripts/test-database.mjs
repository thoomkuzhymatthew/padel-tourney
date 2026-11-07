import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// --rehearse creates the schema and runs checks in one rolled-back transaction.
// Without it, checks run against the already-migrated database and still roll back.
const rehearse = process.argv.includes('--rehearse')
const remote = process.argv.includes('--remote')
const seed = process.argv.includes('--with-seed') ? readFileSync('supabase/seed.sql', 'utf8') : ''
const migrationArg = process.argv.find(arg => arg.startsWith('--migration='))?.split('=')[1]
const migrations = migrationArg ? readFileSync(join('supabase/migrations', migrationArg), 'utf8') : rehearse ? readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(join('supabase/migrations', f), 'utf8')).join('\n') : ''
const temp = mkdtempSync(join(tmpdir(), 'padel-db-test-'))
try {
  const file = join(temp, 'checks.sql')
  writeFileSync(file, `begin;\n${migrations}\n${seed}\n${readFileSync('supabase/tests/security.sql', 'utf8')}\nrollback;\n`)
  const args = ['--yes', 'supabase', 'db', 'query', ...(remote ? ['--remote'] : []), '--yes', '--file', file]
  const result = spawnSync('npx', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  // Queries never select plaintext credentials; suppress echoed SQL on failure.
  if (result.status !== 0) {
    process.stderr.write((result.stderr + result.stdout).replace(/\b[0-9a-f]{64}\b/gi, '[redacted credential]'))
    process.exitCode = result.status ?? 1
  } else {
    process.stdout.write(result.stdout)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}
