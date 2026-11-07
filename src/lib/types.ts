export interface Player {
  id: string
  name: string
  active: boolean
  joinedRound: number
}

export type Team = readonly [string, string]
export type Result =
  | { status: 'unscored' }
  | { status: 'scored'; scoreA: number; scoreB: number }
  | { status: 'forfeited' }

export interface Match {
  court: number
  teamA: Team
  teamB: Team
  result: Result
}

export interface Round {
  number: number
  target: number
  matches: readonly Match[]
  sitOuts: readonly string[]
}

export function validateTarget(target: number): void {
  if (!Number.isSafeInteger(target) || target < 1) {
    throw new Error('Points target must be a positive integer.')
  }
}
