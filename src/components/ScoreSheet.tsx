import { useRef, useState } from 'react'
import Sheet from './Sheet'
import { playerName, tournamentAction, TournamentError } from '../lib/tournament-api'
import type { TournamentData, TournamentMatch, TournamentRound } from '../lib/tournament-api'

export default function ScoreSheet({ shareId, token, data, round, match, close, saved }: {
  shareId: string; token?: string; data: TournamentData; round: TournamentRound; match: TournamentMatch; close: () => void; saved: () => void
}) {
  const [selected, setSelected] = useState<number | null>(match.result.status === 'scored' ? match.result.scoreA : null)
  const [version, setVersion] = useState(match.updatedAt)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [error, setError] = useState('')
  const newest = data.rounds.find(r => r.id === round.id)?.matches.find(m => m.id === match.id)
  const changed = newest && newest.updatedAt !== version
  const noLongerEditable = !token && (data.status === 'finished' || data.rounds.at(-1)?.id !== round.id)
  async function save() {
    if (selected === null || saving.current || changed || noLongerEditable) return
    saving.current = true; setBusy(true); setError('')
    try {
      await tournamentAction(shareId, token ? 'override_score' : 'submit_score', {
        ...(token ? { p_admin_token: token } : {}), p_match_id: match.id, p_score_a: selected, p_score_b: round.target - selected, p_expected_updated_at: version,
      })
      saved(); close()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Couldn’t save. Keep your selection and try again.')
      if (error instanceof TournamentError && error.code === '40001') saved()
    } finally { saving.current = false; setBusy(false) }
  }
  function review() {
    if (!newest) return
    setSelected(newest.result.status === 'scored' ? newest.result.scoreA : null)
    setVersion(newest.updatedAt); setError('')
  }
  return <Sheet title={`Court ${match.court} · round ${round.number}`} close={close} busy={busy}>
    <div className="sheet-content score-content">
      <div className="score-teams"><p>{match.teamA.map(id => playerName(round,id,data.players)).join(' + ')}</p><span>vs</span><p>{match.teamB.map(id => playerName(round,id,data.players)).join(' + ')}</p></div>
      <div className="score-preview"><div><span>Team A</span><strong>{selected ?? '–'}</strong></div><span>–</span><div><span>Team B</span><strong>{selected === null ? '–' : round.target - selected}</strong></div></div>
      {noLongerEditable && <p className="notice" role="alert">This round is now read-only. Ask the organiser to correct its score.</p>}
      {changed && <div className="notice" role="alert"><p>This score changed on another device. Review it before saving.</p><button className="button secondary" onClick={review}>Review latest score</button></div>}
      <p className="grid-label" id="score-grid-label">Choose Team A’s score · to {round.target} points</p>
      <div className="score-grid" role="group" aria-labelledby="score-grid-label">{Array.from({ length: round.target + 1 }, (_, n) => <button key={n} aria-label={`Team A ${n}`} aria-pressed={selected === n} className={selected === n ? 'selected' : ''} disabled={busy || Boolean(changed) || noLongerEditable} onClick={() => { setSelected(n); setError('') }}>{n}</button>)}</div>
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
    <div className="sheet-footer"><button className="button primary" onClick={save} disabled={selected === null || busy || Boolean(changed) || noLongerEditable}>{busy ? 'Saving…' : 'Save'}<span aria-hidden="true">✓</span></button></div>
  </Sheet>
}
