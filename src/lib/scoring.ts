import type { Player, Result, Round } from './types'
import { validateTarget } from './types'

export interface Standing {
  rank: number
  playerId: string
  name: string
  totalPoints: number
  gamesPlayed: number
  wins: number
  pointsDifference: number
}

export function scoreMatch(target: number, scoreA: number): Result {
  validateTarget(target)
  if (!Number.isSafeInteger(scoreA) || scoreA < 0 || scoreA > target) {
    throw new Error('Choose a whole-number score between zero and the target.')
  }
  return { status: 'scored', scoreA, scoreB: target - scoreA }
}

export function formatPoints(points: number): string {
  return String(points)
}

export function calculateLeaderboard(players: readonly Player[], rounds: readonly Round[]): Standing[] {
  const rows = new Map<string, Standing>()
  for (const player of players) {
    if (rows.has(player.id)) throw new Error('Player IDs must be unique.')
    rows.set(player.id, {
      rank: 0, playerId: player.id, name: player.name, totalPoints: 0,
      gamesPlayed: 0, wins: 0, pointsDifference: 0,
    })
  }
  const joined = new Map(players.map(player => [player.id, player.joinedRound]))
  const seenRounds = new Set<number>()
  for (const round of rounds) {
    validateTarget(round.target)
    if (seenRounds.has(round.number)) throw new Error('Round numbers must be unique.')
    seenRounds.add(round.number)
    const participants = new Set<string>()
    const rowFor = (id: string) => {
      const row = rows.get(id)
      if (!row || joined.get(id)! > round.number) throw new Error('Invalid round participant.')
      if (participants.has(id)) throw new Error('A player cannot appear twice in a round.')
      participants.add(id)
      return row
    }
    for (const id of round.sitOuts) rowFor(id).totalPoints += round.target / 2
    for (const match of round.matches) {
      if (match.teamA.length !== 2 || match.teamB.length !== 2) throw new Error('Teams need two players.')
      const teamA = match.teamA.map(rowFor)
      const teamB = match.teamB.map(rowFor)
      if (match.result.status === 'unscored') continue
      let a = 0
      let b = 0
      if (match.result.status === 'scored') {
        const expected = scoreMatch(round.target, match.result.scoreA)
        if (expected.status !== 'scored' || expected.scoreB !== match.result.scoreB) {
          throw new Error('Scores must sum to the round target.')
        }
        a = match.result.scoreA
        b = match.result.scoreB
      }
      for (const [team, own, other] of [[teamA, a, b], [teamB, b, a]] as const) {
        for (const row of team) {
          row.totalPoints += own
          row.gamesPlayed++
          row.wins += Number(own > other)
          row.pointsDifference += own - other
        }
      }
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.totalPoints - a.totalPoints || b.wins - a.wins ||
      b.pointsDifference - a.pointsDifference || a.name.localeCompare(b.name, 'en') ||
      a.playerId.localeCompare(b.playerId, 'en'))
    .map((row, index) => ({ ...row, rank: index + 1 }))
}
