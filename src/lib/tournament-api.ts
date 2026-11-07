import { generateRound } from './rotation'
import { validShare, validToken } from './tournament-storage'
import type { SavedTournament } from './tournament-storage'
import type { Player, Match, Round } from './types'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const supabasePublicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
export const backendConfigured = Boolean(supabaseUrl && supabasePublicKey)

async function request(path: string, options: RequestInit = {}, shareId?: string) {
  if (!supabaseUrl || !supabasePublicKey) throw new Error('Tournament setup is unavailable. Please try again later.')
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: supabasePublicKey, ...(supabasePublicKey.startsWith('eyJ') ? { Authorization: `Bearer ${supabasePublicKey}` } : {}), 'Content-Type': 'application/json',
      ...(shareId ? { 'x-tournament-share-id': shareId } : {}), ...options.headers },
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(25000),
  }).catch(() => { throw new Error('Couldn’t reach the tournament. Check your connection and try again.') })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null }
  catch { throw new Error('The connection returned an incomplete response. Please try again.') }
  if (!response.ok) {
    const code = data?.code ?? ''
    const messages: Record<string, string> = {
      '40001': 'This score changed on another device. Review the latest score before saving.',
      '42501': 'This action needs a valid admin link, or the match is no longer editable.',
      '23505': 'That name is already in use. Add an initial to tell players apart.',
    }
    throw new TournamentError(messages[code] ?? 'Couldn’t save that change. Refresh and try again.', code)
  }
  return data
}

export async function createTournament(input: { name: string; names: string[]; courts: number; target: number }): Promise<{ tournament: SavedTournament; summary: TournamentSummary }> {
  const players: Player[] = input.names.map(name => ({ id: crypto.randomUUID(), name: name.trim(), active: true, joinedRound: 1 }))
  const round = generateRound(players, [], input.courts, input.target)
  // A POST is sent once. Automatic retries could create a second tournament.
  const data: unknown = await request('rpc/create_tournament', {
    method: 'POST', body: JSON.stringify({ p_name: input.name, p_players: players.map(({ id, name }) => ({ id, name })),
      p_courts: input.courts, p_target: input.target, p_round: round }),
  })
  const result = Array.isArray(data) ? data[0] : null
  if (!result || !validShare(result.share_id) || !validToken(result.admin_token)) {
    throw new Error('The tournament response was incomplete. Keep this page open and check your connection.')
  }
  const names = new Map(players.map(player => [player.id, player.name]))
  return {
    tournament: { shareId: result.share_id, adminToken: result.admin_token, name: input.name, createdAt: new Date().toISOString() },
    summary: { name: input.name, status: 'active', number: 1, target: input.target, playerCount: players.length,
      matches: round.matches.map(match => ({ court: match.court, teamA: match.teamA.map(id => names.get(id)!), teamB: match.teamB.map(id => names.get(id)!) })),
      sitOuts: round.sitOuts.map(id => names.get(id)!),
    },
  }
}

export interface TournamentSummary {
  name: string
  status: 'active' | 'finished'
  number: number
  target: number
  playerCount: number
  matches: { court: number; teamA: string[]; teamB: string[] }[]
  sitOuts: string[]
}

export async function loadTournament(shareId: string): Promise<TournamentSummary> {
  if (!validShare(shareId)) throw new Error('This tournament link doesn’t look right. Ask the organiser for a new link.')
  const data = await getTournament(shareId)
  const round = data.rounds.at(-1)!
  return { name: data.name, status: data.status, number: round.number, target: round.target,
    playerCount: data.players.filter(p => p.active).length,
    matches: round.matches.map(match => ({ court: match.court,
      teamA: match.teamA.map(id => playerName(round,id,data.players)), teamB: match.teamB.map(id => playerName(round,id,data.players)) })),
    sitOuts: round.sitOuts.map(id => playerName(round,id,data.players)),
  }
}


export class TournamentError extends Error {
  code: string
  constructor(message: string, code: string) { super(message); this.code = code }
}
export interface TournamentPlayer extends Player { pendingName: string | null }
export interface TournamentMatch extends Match { id: string; enteredBy: 'admin' | 'player' | null; updatedAt: string }
export interface TournamentRound extends Round { id: string; status: string; names: Record<string, string>; matches: TournamentMatch[] }
export interface TournamentData {
  id: string; name: string; courts: number; defaultTarget: number; status: 'active' | 'finished'
  players: TournamentPlayer[]; rounds: TournamentRound[]
}
const snapshots = new Map<string, TournamentData>()
const reads = new Map<string, Promise<TournamentData>>()
export function cachedTournament(shareId: string): TournamentData | null { return snapshots.get(shareId) ?? null }
export function getTournament(shareId: string): Promise<TournamentData> {
  const pending = reads.get(shareId)
  if (pending) return pending
  const promise = readTournament(shareId).then(data => {
    // A tiny memory-only cache accelerates links → tournament navigation.
    if (snapshots.size >= 8 && !snapshots.has(shareId)) snapshots.delete(snapshots.keys().next().value!)
    snapshots.set(shareId, data)
    return data
  }).finally(() => reads.delete(shareId))
  reads.set(shareId, promise)
  return promise
}
async function readTournament(shareId: string): Promise<TournamentData> {
  if (!validShare(shareId)) throw new Error('This tournament link doesn’t look right. Ask the organiser for a new link.')
  const data = await request('rpc/get_tournament_snapshot', { method: 'POST', body: JSON.stringify({ p_share_id: shareId }) }, shareId)
  if (!data?.id || !Array.isArray(data.rounds) || !data.rounds.length) throw new Error('Tournament not found. Ask the organiser to check the link.')
  return data
}
export async function tournamentAction(shareId: string, action: string, args: Record<string, unknown>) {
  return request(`rpc/${action}`, { method: 'POST', body: JSON.stringify({ p_share_id: shareId, ...args }) }, shareId)
}
export function playerName(round: TournamentRound, playerId: string, players: TournamentPlayer[]): string {
  return round.names[playerId] ?? players.find(player => player.id === playerId)?.name ?? 'Player'
}
