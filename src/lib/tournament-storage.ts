export interface SavedTournament {
  shareId: string
  adminToken: string
  name: string
  createdAt: string
}

export const MAX_SAVED_TOURNAMENTS = 5
export const TOURNAMENTS_KEY = 'padel-genie.tournaments.v1'
export const validShare = (value: string) => /^[0-9a-f]{48}$/.test(value)
export const validToken = (value: string) => /^[0-9a-f]{64}$/.test(value)

export function readTournaments(): { tournaments: SavedTournament[]; available: boolean } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(TOURNAMENTS_KEY) ?? '[]')
    if (!Array.isArray(raw)) return { tournaments: [], available: true }
    const tournaments = raw.filter((item): item is SavedTournament => item && typeof item === 'object' &&
      typeof item.shareId === 'string' && validShare(item.shareId) &&
      typeof item.adminToken === 'string' && validToken(item.adminToken) &&
      typeof item.name === 'string' && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)))
    const seen = new Set<string>()
    const recent = tournaments.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .filter(tournament => {
        if (seen.has(tournament.shareId)) return false
        seen.add(tournament.shareId)
        return true
      }).slice(0, MAX_SAVED_TOURNAMENTS)
    // Migrate older, longer lists. A failed cleanup must not hide readable links.
    if (raw.length > recent.length) {
      try { localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(recent)) } catch { /* Keep the readable five. */ }
    }
    return { tournaments: recent, available: true }
  } catch {
    return { tournaments: [], available: false }
  }
}

export function saveTournament(tournament: SavedTournament): boolean {
  try {
    const { tournaments } = readTournaments()
    localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify([tournament, ...tournaments.filter(t => t.shareId !== tournament.shareId)]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, MAX_SAVED_TOURNAMENTS)))
    return true
  } catch {
    return false
  }
}

export function tournamentPath(t: Pick<SavedTournament, 'shareId' | 'adminToken'>, links = false): string {
  return `/t/${t.shareId}/${links ? 'links' : 'admin'}#${t.adminToken}`
}
