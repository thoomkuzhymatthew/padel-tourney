import { describe, expect, it } from 'vitest'
import { generateRound } from './rotation'
import { calculateLeaderboard, formatPoints, scoreMatch } from './scoring'
import type { Player, Round } from './types'

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
const roster = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({
  id: String(i), name: `Player ${i}`, active: true, joinedRound: 1,
}))
const pairKey = (ids: readonly string[]) => [...ids].sort().join(',')
function partnerCounts(rounds: Round[]) {
  const counts = new Map<string, number>()
  for (const r of rounds) for (const m of r.matches) for (const team of [m.teamA, m.teamB]) {
    const k = pairKey(team)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}
function play(n: number, count: number, seed: number) {
  const rounds: Round[] = []
  const random = seeded(seed)
  for (let i = 0; i < count; i++) rounds.push(generateRound(roster(n), rounds, 2, 24, { random }))
  return rounds
}

const round: Round = {
  number: 1, target: 24, sitOuts: ['4'], matches: [{
    court: 1, teamA: ['0', '1'], teamB: ['2', '3'], result: scoreMatch(24, 15),
  }],
}

describe('rotation', () => {
  it('covers all partners for eight players over seven rounds across seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rounds = play(8, 7, seed)
      expect([...partnerCounts(rounds).values()], `seed ${seed}`).toEqual(Array(28).fill(1))
    }
  })
  it('minimises repeats for twelve players across seeds', () => {
    for (let seed = 1; seed <= 6; seed++) {
      // Twelve players on three courts; all players can partner each other in 11 rounds.
      const rounds: Round[] = []
      const random = seeded(seed)
      for (let i = 0; i < 11; i++) rounds.push(generateRound(roster(12), rounds, 3, 24, { random }))
      const counts = [...partnerCounts(rounds).values()]
      expect(Math.max(...counts)).toBeLessThanOrEqual(2)
      expect(counts.filter(n => n > 1).length).toBeLessThanOrEqual(8)
    }
  })
  for (const n of [5, 6, 7, 9, 10, 11]) {
    it(`balances sit-outs at every prefix with ${n} players`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const totals = Array(n).fill(0) as number[]
        let previous: string[] = []
        for (const r of play(n, n * 2, seed)) {
          const sitting = r.sitOuts.length
          // A repeat is avoidable only if enough players of minimum count didn't sit last round.
          const ordered = Array.from({ length: n }, (_, i) => String(i)).sort((a, b) =>
            totals[+a] - totals[+b] || Number(previous.includes(a)) - Number(previous.includes(b)))
          const unavoidable = ordered.slice(0, sitting).filter(id => previous.includes(id)).length
          expect(r.sitOuts.filter(id => previous.includes(id))).toHaveLength(unavoidable)
          for (const id of r.sitOuts) totals[+id]++
          expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1)
          previous = [...r.sitOuts]
          const ids = [...r.sitOuts, ...r.matches.flatMap(m => [...m.teamA, ...m.teamB])]
          expect(new Set(ids).size).toBe(n)
          expect(ids).toHaveLength(n)
        }
      }
    })
  }
  it('uses one court for six players despite two requested', () => {
    const r = generateRound(roster(6), [], 2, 24)
    expect(r.matches).toHaveLength(1)
    expect(r.sitOuts).toHaveLength(2)
  })
  it('preserves history and reproduces seeded draws', () => {
    const history = [round]
    const before = JSON.stringify(history)
    const a = generateRound(roster(5), history, 2, 21, { random: seeded(17) })
    expect(a).toEqual(generateRound(roster(5), history, 2, 21, { random: seeded(17) }))
    expect(JSON.stringify(history)).toBe(before)
    expect(a.number).toBe(2)
    expect(a.target).toBe(21)
  })
  it('supports forty players without omitting or duplicating participants', () => {
    const r = generateRound(roster(40), [], 10, 24)
    const next = generateRound(roster(40), [r], 10, 24, { random: seeded(1) })
    expect(next.matches).toHaveLength(10)
    expect(new Set(next.matches.flatMap(m => [...m.teamA, ...m.teamB])).size).toBe(40)
  })
  it('rejects invalid inputs and duplicate history', () => {
    expect(() => generateRound(roster(3), [], 2, 24)).toThrow()
    expect(() => generateRound(roster(4), [], 0, 24)).toThrow()
    expect(() => generateRound(roster(4), [], 2, 0)).toThrow()
    expect(() => generateRound(roster(5), [round, round], 2, 24)).toThrow()
    expect(() => generateRound(roster(5), [], 2, 24, { candidates: 0 })).toThrow()
  })
})

describe('scoring', () => {
  it('complements every allowed score at each preset target', () => {
    for (const target of [16, 21, 24, 32]) for (let a = 0; a <= target; a++) {
      expect(scoreMatch(target, a)).toEqual({ status: 'scored', scoreA: a, scoreB: target - a })
    }
    for (const a of [-1, 25, 0.5, NaN, Infinity]) expect(() => scoreMatch(24, a)).toThrow()
  })
  it('awards team points individually and compensation without a game or win', () => {
    const rows = calculateLeaderboard(roster(5), [round])
    expect(rows.find(r => r.playerId === '0')).toMatchObject({ totalPoints: 15, wins: 1, gamesPlayed: 1, pointsDifference: 6 })
    expect(rows.find(r => r.playerId === '4')).toMatchObject({ totalPoints: 12, wins: 0, gamesPlayed: 0, pointsDifference: 0 })
    expect(rows.reduce((sum, r) => sum + r.totalPoints, 0)).toBe(60)
  })
  it('uses each round target after changes, including half points', () => {
    const second: Round = { ...round, number: 2, target: 21, matches: round.matches.map(m => ({ ...m, result: scoreMatch(21, 10) })) }
    expect(calculateLeaderboard(roster(5), [round, second]).find(r => r.playerId === '4')?.totalPoints).toBe(22.5)
    expect(formatPoints(12)).toBe('12')
    expect(formatPoints(10.5)).toBe('10.5')
  })
  it('recomputes standings after editing a past score', () => {
    const edited = { ...round, matches: round.matches.map(m => ({ ...m, result: scoreMatch(24, 3) })) }
    expect(calculateLeaderboard(roster(5), [edited])[0].playerId).toBe('2')
    expect(calculateLeaderboard(roster(5), [edited]).find(r => r.playerId === '0')?.totalPoints).toBe(3)
    expect(round.matches[0].result).toEqual(scoreMatch(24, 15))
  })
  it('handles draws, pending scores and explicit forfeitures', () => {
    for (const result of [scoreMatch(24, 12), { status: 'unscored' }, { status: 'forfeited' }] as const) {
      const rows = calculateLeaderboard(roster(5), [{ ...round, matches: round.matches.map(m => ({ ...m, result })) }])
      expect(rows.every(r => r.wins === 0)).toBe(true)
      expect(rows.find(r => r.playerId === '0')?.gamesPlayed).toBe(result.status === 'unscored' ? 0 : 1)
    }
  })
  it('sorts by points, wins, points difference, then name', () => {
    const players = roster(4).map((p, i) => ({ ...p, name: ['Zoe', 'Amy', 'Ben', 'Cal'][i] }))
    const r1: Round = { ...round, sitOuts: [], matches: [{ ...round.matches[0], result: scoreMatch(24, 12) }] }
    expect(calculateLeaderboard(players, [r1]).map(r => r.name)).toEqual(['Amy', 'Ben', 'Cal', 'Zoe'])
    const r2: Round = { number: 2, target: 24, sitOuts: [], matches: [{ court: 1, teamA: ['0', '2'], teamB: ['1', '3'], result: scoreMatch(24, 24) }] }
    expect(calculateLeaderboard(players, [r1, r2]).map(r => r.playerId)).toEqual(['2', '0', '1', '3'])
  })
  it('uses wins before name when points tie', () => {
    const players = roster(8).map(p => ({ ...p, name: p.id === '0' ? 'Zoe' : 'Amy' + p.id }))
    const results: Round[] = [
      { number: 1, target: 24, sitOuts: [], matches: [{ court: 1, teamA: ['0', '2'], teamB: ['3', '4'], result: scoreMatch(24, 24) }] },
      { number: 2, target: 24, sitOuts: [], matches: [{ court: 1, teamA: ['1', '5'], teamB: ['6', '7'], result: scoreMatch(24, 12) }] },
      { number: 3, target: 24, sitOuts: [], matches: [{ court: 1, teamA: ['1', '5'], teamB: ['6', '7'], result: scoreMatch(24, 12) }] },
    ]
    const rows = calculateLeaderboard(players, results)
    const winner = rows.find(r => r.playerId === '0')!
    const drawer = rows.find(r => r.playerId === '1')!
    expect(winner.totalPoints).toBe(drawer.totalPoints)
    expect(winner.wins).toBeGreaterThan(drawer.wins)
    expect(winner.rank).toBeLessThan(drawer.rank)
  })
  it('uses points difference before name when points and wins tie', () => {
    const players = roster(8).map(p => ({ ...p, name: p.id === '0' ? 'Zoe' : 'Amy' + p.id }))
    const results: Round[] = [
      { number: 1, target: 24, sitOuts: [], matches: [{ court: 1, teamA: ['0', '2'], teamB: ['3', '4'], result: scoreMatch(24, 24) }] },
      { number: 2, target: 32, sitOuts: [], matches: [{ court: 1, teamA: ['1', '5'], teamB: ['6', '7'], result: scoreMatch(32, 24) }] },
    ]
    const rows = calculateLeaderboard(players, results)
    const first = rows.find(r => r.playerId === '0')!
    const second = rows.find(r => r.playerId === '1')!
    expect(first.totalPoints).toBe(second.totalPoints)
    expect(first.wins).toBe(second.wins)
    expect(first.pointsDifference).toBeGreaterThan(second.pointsDifference)
    expect(first.rank).toBeLessThan(second.rank)
  })
  it('rejects malformed scores and duplicate participants', () => {
    const bad = { ...round, matches: round.matches.map(m => ({ ...m, result: { status: 'scored' as const, scoreA: 15, scoreB: 8 } })) }
    expect(() => calculateLeaderboard(roster(5), [bad])).toThrow()
    expect(() => calculateLeaderboard(roster(5), [{ ...round, sitOuts: ['0'] }])).toThrow()
  })
  it('includes late joiners only in future rounds and preserves removed results', () => {
    const players = roster(5)
    players[0] = { ...players[0], active: false }
    players.push({ id: '5', name: 'Late player', active: true, joinedRound: 2 })
    expect(calculateLeaderboard(players, [round]).find(r => r.playerId === '5')?.totalPoints).toBe(0)
    const second = generateRound(players, [round], 2, 24, { random: seeded(5) })
    expect([...second.sitOuts, ...second.matches.flatMap(m => [...m.teamA, ...m.teamB])]).not.toContain('0')
    expect([...second.sitOuts, ...second.matches.flatMap(m => [...m.teamA, ...m.teamB])]).toContain('5')
    expect(calculateLeaderboard(players, [round, second]).find(r => r.playerId === '0')?.totalPoints).toBe(15)
    players[5] = { ...players[5], joinedRound: 3 }
    expect(generateRound(players, [round], 2, 24).matches.flatMap(m => [...m.teamA, ...m.teamB])).not.toContain('5')
  })
})
