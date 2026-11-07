import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readTournaments, saveTournament, TOURNAMENTS_KEY } from './tournament-storage'
import type { SavedTournament } from './tournament-storage'

let values: Map<string,string>
beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key,value) },
  })
})
afterEach(() => vi.unstubAllGlobals())
const saved = (n: number): SavedTournament => ({
  shareId: n.toString(16).padStart(48,'0'), adminToken: n.toString(16).padStart(64,'0'), name: `Tournament ${n}`, createdAt: `2026-11-${String(n).padStart(2,'0')}T12:00:00Z`,
})
it('keeps only the newest five links when saving, without duplicating a resumed tournament', () => {
  for (let n=1;n<=7;n++) expect(saveTournament(saved(n))).toBe(true)
  expect(readTournaments().tournaments.map(t=>t.name)).toEqual([7,6,5,4,3].map(n=>`Tournament ${n}`))
  saveTournament({...saved(6),name:'Updated name'})
  expect(readTournaments().tournaments).toHaveLength(5)
  expect(readTournaments().tournaments[1]).toEqual({...saved(6),name:'Updated name'})
  expect(JSON.parse(values.get(TOURNAMENTS_KEY)!)).toHaveLength(5)
})
it('migrates a longer existing list and preserves the five newest admin credentials', () => {
  values.set(TOURNAMENTS_KEY,JSON.stringify([saved(2),saved(7),saved(1),saved(6),saved(5),saved(4),saved(3),saved(6)]))
  expect(readTournaments().tournaments).toEqual([7,6,5,4,3].map(saved))
  expect(JSON.parse(values.get(TOURNAMENTS_KEY)!)).toEqual([7,6,5,4,3].map(saved))
})
it('still shows five readable links if the browser refuses migration writes', () => {
  values.set(TOURNAMENTS_KEY,JSON.stringify(Array.from({length:7},(_,i)=>saved(i+1))))
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:()=>{throw new Error('Storage unavailable')}})
  const result=readTournaments()
  expect(result.available).toBe(true)
  expect(result.tournaments.map(t=>t.name)).toEqual([7,6,5,4,3].map(n=>`Tournament ${n}`))
  expect(saveTournament(saved(8))).toBe(false)
})
