export const normalizeName = (name: string) => name.trim().toLocaleLowerCase('en')
export const splitNames = (text: string) => text.split(/[\n,\r]+/).map(s => s.trim()).filter(Boolean)

export function validateNames(names: readonly string[]): string | null {
  if (names.length < 4) return 'Add at least 4 players to start.'
  if (names.length > 40) return 'Use up to 40 players in one tournament.'
  if (names.some(name => !name.trim())) return 'Give every player a name, or remove the empty row.'
  if (names.some(name => name.trim().length > 60)) return 'Keep player names to 60 characters or fewer.'
  if (new Set(names.map(normalizeName)).size !== names.length) return 'Two players have the same name. Add an initial to tell them apart.'
  return null
}

export function defaultTournamentName(date = new Date()): string {
  return `${date.toLocaleDateString('en-GB', { weekday: 'long' })} Americano`
}
