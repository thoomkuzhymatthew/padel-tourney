import type { Match, Player, Round, Team } from './types'
import { validateTarget } from './types'

export type Random = () => number
const key = (a: string, b: string) => JSON.stringify([a, b].sort())

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function generateRound(
  players: readonly Player[], history: readonly Round[], courts: number, target: number,
  { random = Math.random, candidates = 2000 }: { random?: Random; candidates?: number } = {},
): Round {
  validateTarget(target)
  if (!Number.isSafeInteger(courts) || courts < 1) throw new Error('Choose at least one court.')
  if (!Number.isSafeInteger(candidates) || candidates < 1) throw new Error('Search needs candidates.')
  if (new Set(players.map(p => p.id)).size !== players.length) throw new Error('Player IDs must be unique.')
  const sortedHistory = [...history].sort((a, b) => a.number - b.number)
  if (sortedHistory.some((round, i) => round.number !== i + 1)) throw new Error('History must contain each round once in sequence.')
  const number = sortedHistory.length + 1
  const eligible = players.filter(p => p.active && p.joinedRound <= number).map(p => p.id)
  if (eligible.length < 4) throw new Error('At least four active players are needed.')
  const usedCourts = Math.min(courts, Math.floor(eligible.length / 4))
  const sitCount = new Map<string, number>()
  const partners = new Map<string, number>()
  const opponents = new Map<string, number>()
  const increment = (map: Map<string, number>, a: string, b: string) => {
    const pair = key(a, b)
    map.set(pair, (map.get(pair) ?? 0) + 1)
  }
  for (const round of sortedHistory) {
    for (const id of round.sitOuts) sitCount.set(id, (sitCount.get(id) ?? 0) + 1)
    for (const { teamA, teamB } of round.matches) {
      increment(partners, ...teamA)
      increment(partners, ...teamB)
      for (const a of teamA) for (const b of teamB) increment(opponents, a, b)
    }
  }
  const lastSitOuts = new Set(sortedHistory.at(-1)?.sitOuts ?? [])
  // Shuffle first so stable sorting gives random tie breaks without a random comparator.
  const sitOuts = shuffle(eligible, random).sort((a, b) =>
    (sitCount.get(a) ?? 0) - (sitCount.get(b) ?? 0) ||
    Number(lastSitOuts.has(a)) - Number(lastSitOuts.has(b)),
  ).slice(0, eligible.length - usedCourts * 4)
  const sitting = new Set(sitOuts)
  const active = eligible.filter(id => !sitting.has(id))
  const cost = (teamA: Team, teamB: Team) => {
    let total = 10 * ((partners.get(key(...teamA)) ?? 0) ** 2 + (partners.get(key(...teamB)) ?? 0) ** 2)
    for (const a of teamA) for (const b of teamB) total += (opponents.get(key(a, b)) ?? 0) ** 2
    return total
  }
  let best: Match[] = []
  let bestCost = Infinity
  const attempts = history.length === 0 ? 1 : candidates
  for (let attempt = 0; attempt < attempts; attempt++) {
    const draw = shuffle(active, random)
    const matches: Match[] = []
    let total = 0
    for (let court = 0; court < usedCourts; court++) {
      const [a, b, c, d] = draw.slice(court * 4, court * 4 + 4)
      const options: [Team, Team][] = [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]]
      const ranked = shuffle(options, random).map(([teamA, teamB]) => ({ teamA, teamB, cost: cost(teamA, teamB) }))
        .sort((a, b) => a.cost - b.cost)
      const chosen = ranked[0]
      total += chosen.cost
      matches.push({ court: court + 1, teamA: chosen.teamA, teamB: chosen.teamB, result: { status: 'unscored' } })
    }
    if (total < bestCost || (total === bestCost && random() < 0.5)) {
      best = matches
      bestCost = total
    }
  }
  return { number, target, matches: best, sitOuts }
}
