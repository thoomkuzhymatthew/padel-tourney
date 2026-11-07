import { generateRound } from './rotation'
import { validShare, validToken } from './tournament-storage'
import type { SavedTournament } from './tournament-storage'
import type { Player } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
export const backendConfigured = Boolean(url && publicKey)

async function request(path: string, options: RequestInit = {}, shareId?: string) {
  if (!url || !publicKey) throw new Error('Tournament setup is unavailable. Please try again later.')
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: publicKey, ...(publicKey.startsWith('eyJ') ? { Authorization: `Bearer ${publicKey}` } : {}), 'Content-Type': 'application/json',
      ...(shareId ? { 'x-tournament-share-id': shareId } : {}), ...options.headers },
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error('We couldn’t save that. Check your connection and try again.')
  return response.json()
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
  const [tournaments, players, rounds] = await Promise.all([
    request('tournaments?select=name,status', {}, shareId), request('players?select=id,name,active', {}, shareId),
    request('rounds?select=id,number,target&order=number.desc&limit=1', {}, shareId),
  ])
  const tournament = tournaments[0]
  const round = rounds[0]
  if (!tournament || !round) throw new Error('Tournament not found. Ask the organiser to check the link.')
  const [matches, sitOuts] = await Promise.all([
    request(`matches?select=round_id,court,team_a,team_b&order=court&round_id=eq.${encodeURIComponent(round.id)}`, {}, shareId),
    request(`sit_outs?select=round_id,player_id&round_id=eq.${encodeURIComponent(round.id)}`, {}, shareId),
  ])
  const names = new Map<string, string>(players.map((p: { id: string; name: string }) => [p.id, p.name]))
  return { ...tournament, number: round.number, target: round.target,
    playerCount: players.filter((p: { active: boolean }) => p.active).length,
    matches: matches.filter((m: { round_id: string }) => m.round_id === round.id).map((m: { court: number; team_a: string[]; team_b: string[] }) =>
      ({ court: m.court, teamA: m.team_a.map(id => names.get(id) ?? 'Player'), teamB: m.team_b.map(id => names.get(id) ?? 'Player') })),
    sitOuts: sitOuts.filter((s: { round_id: string }) => s.round_id === round.id).map((s: { player_id: string }) => names.get(s.player_id) ?? 'Player'),
  }
}
