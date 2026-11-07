import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
assert(/^[a-z]{20}$/.test(ref), 'Expected a linked Supabase project')
function cli(args) {
  const result = spawnSync('npx', ['--yes', 'supabase', ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  assert.equal(result.status, 0, 'Authenticated CLI command failed (output suppressed to protect credentials)')
  return JSON.parse(result.stdout)
}
const keys = cli(['projects', 'api-keys']).keys
const anonKey = keys.find(k => k.name === 'anon')?.api_key
assert(anonKey, 'An anon key is required for the hosted API tests')
const base = `https://${ref}.supabase.co`
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' }
const shares = []
let socket
async function api(path, method = 'GET', body, share, extraHeaders = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method, headers: { ...headers, ...(share ? { 'x-tournament-share-id': share } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, ok: response.ok, data: text ? JSON.parse(text) : null }
}
const rpc = (name, body) => api(`rpc/${name}`, 'POST', body)
const snapshot = (players, number, target) => ({
  number, target, sitOuts: [], matches: [{ court: 1,
    teamA: players.slice(0,2).map(p => p.id), teamB: players.slice(2).map(p => p.id), result: { status: 'unscored' },
  }],
})
async function createFixture(label) {
  const players = ['Alex', 'Blair', 'Casey', 'Devon'].map(name => ({ id: crypto.randomUUID(), name }))
  const response = await rpc('create_tournament', {
    p_name: label, p_players: players, p_courts: 2, p_target: 24, p_round: snapshot(players, 1, 24),
  })
  assert(response.ok, 'Anonymous tournament creation failed')
  const credentials = response.data[0]
  shares.push(credentials.share_id)
  return { ...credentials, players }
}
function channel(share) {
  socket = new WebSocket(`wss://${ref}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=1.0.0`)
  let resolveNotice
  let rejectNotice
  const changed = new Promise((resolve, reject) => { resolveNotice = resolve; rejectNotice = reject })
  changed.catch(() => {})
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime join timed out')), 15000)
    socket.onopen = () => socket.send(JSON.stringify({ topic: `realtime:tournament:${share}`, event: 'phx_join', ref: '1',
      payload: { config: { broadcast: { self: true }, presence: { enabled: false }, postgres_changes: [], private: false } },
    }))
    socket.onerror = () => { clearTimeout(timeout); reject(new Error('Realtime connection failed')) }
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.event === 'phx_reply' && message.ref === '1') {
        clearTimeout(timeout)
        if (message.payload.status === 'ok') resolve()
        else reject(new Error('Realtime join rejected'))
      }
      if (message.event === 'broadcast' && message.payload.event === 'changed') resolveNotice(message.payload.payload)
    }
  })
  return { ready, changed, rejectNotice }
}
try {
  const a = await createFixture('Automated database smoke test')
  const b = await createFixture('Automated isolation smoke test')
  for (const table of ['tournaments','players','rounds','matches','sit_outs']) {
    const response = await api(`${table}?select=*`)
    assert(response.ok && response.data.length === 0, 'Unscoped reads must reveal no rows')
  }
  const isolated = await api('tournaments?select=*', 'GET', undefined, a.share_id)
  assert(isolated.ok && isolated.data.length === 1 && isolated.data[0].share_id === a.share_id, 'Tournament isolation failed')
  const secretRead = await api('tournament_secrets?select=*')
  assert(!secretRead.ok, 'Secrets must not be exposed in the public schema')
  const privateRead = await api('tournament_secrets?select=*','GET',undefined,undefined,{ 'Accept-Profile': 'private' })
  assert(!privateRead.ok, 'Private schema must not be exposed')
  const directWrite = await api('tournaments', 'PATCH', { status: 'finished' }, a.share_id)
  assert(!directWrite.ok, 'Direct table updates must fail')
  const invalidAdmin = await rpc('end_tournament', { p_share_id: a.share_id, p_admin_token: 'wrong' })
  assert([401,403].includes(invalidAdmin.status) && invalidAdmin.data.code === '42501', 'Invalid admin token must be rejected')
  const matches = await api('matches?select=*','GET',undefined,a.share_id)
  assert.equal(matches.data.length, 1, 'Four players must use only one court')
  const match = matches.data[0]
  const crossWrite = await rpc('submit_score', { p_share_id: b.share_id, p_match_id: match.id, p_score_a: 12, p_score_b: 12 })
  assert(!crossWrite.ok, 'Cross-tournament scoring must fail')
  const subscription = channel(a.share_id)
  await subscription.ready
  const timer = setTimeout(() => subscription.rejectNotice(new Error('Realtime change notification timed out')), 10000)
  try {
    const score = await rpc('submit_score', { p_share_id: a.share_id, p_match_id: match.id, p_score_a: 15, p_score_b: 9 })
    assert(score.ok, 'Player score save failed')
    const payload = await subscription.changed
    assert(Object.keys(payload).every(k => k === 'id'), 'Realtime must carry only an invalidation, not tournament data')
  } finally { clearTimeout(timer) }
  const next = { p_share_id: a.share_id, p_admin_token: a.admin_token, p_target: 21, p_round: snapshot(a.players, 2, 21) }
  const raced = await Promise.all([rpc('start_next_round', next), rpc('start_next_round', next)])
  assert.equal(raced.filter(r => r.ok).length, 1, 'Exactly one concurrent advance must succeed')
  const rounds = await api('rounds?select=number,target&order=number','GET',undefined,a.share_id)
  assert.deepEqual(rounds.data, [{ number: 1, target: 24 }, { number: 2, target: 21 }], 'Concurrent advancement must not duplicate or skip rounds')
  const oldScore = await rpc('submit_score', { p_share_id: a.share_id, p_match_id: match.id, p_score_a: 12, p_score_b: 12 })
  assert([401,403].includes(oldScore.status) && oldScore.data.code === '42501', 'Player past-round scoring must fail')
  const correction = await rpc('override_score', { p_share_id: a.share_id, p_admin_token: a.admin_token, p_match_id: match.id, p_score_a: 20, p_score_b: 4 })
  assert(correction.ok, 'Valid admin override failed')
  console.log('Hosted anon-key API, isolation, Realtime delivery, and concurrent advancement checks passed.')
} finally {
  socket?.close()
  if (shares.length) {
    assert(shares.every(s => /^[0-9a-f]{48}$/.test(s)), 'Unexpected fixture share ID')
    const temp = mkdtempSync(join(tmpdir(), 'padel-cleanup-'))
    try {
      const file = join(temp, 'cleanup.sql')
      writeFileSync(file, `delete from public.tournaments where share_id in (${shares.map(s => `'${s}'`).join(',')});`, { mode: 0o600 })
      cli(['db', 'query', '--remote', '--yes', '--file', file])
      console.log('Temporary hosted fixtures removed.')
    } finally { rmSync(temp, { recursive: true, force: true }) }
  }
}
