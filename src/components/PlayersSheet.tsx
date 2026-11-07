import { useState } from 'react'
import Sheet from './Sheet'
import { cleanName, normalizeName } from '../lib/create-form'
import { tournamentAction } from '../lib/tournament-api'
import type { TournamentData, TournamentPlayer } from '../lib/tournament-api'

export default function PlayersSheet({ shareId, token, data, close, saved }: { shareId: string; token?: string; data: TournamentData; close: () => void; saved: () => void }) {
  const [name, setName] = useState('')
  const [edit, setEdit] = useState<TournamentPlayer | null>(null)
  const [remove, setRemove] = useState<TournamentPlayer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const duplicate = name.trim() && data.players.some(player => player.id !== edit?.id &&
    [player.name, player.pendingName].some(existing => existing && normalizeName(existing) === normalizeName(name)))
  const next = data.rounds.at(-1)!.number + 1
  const activeCount = data.players.filter(p => p.active).length
  async function run(action: 'add_player' | 'remove_player' | 'rename_player') {
    if (busy) return
    if (action !== 'remove_player' && (!name.trim() || name.trim().length > 60)) { setError('Use a name between 1 and 60 characters.'); return }
    if (action !== 'remove_player' && duplicate) { setError('That name is already in use. Add a surname or initial.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await tournamentAction(shareId, action, {
        ...(action !== 'rename_player' ? { p_admin_token: token } : {}),
        ...(action === 'remove_player' ? { p_player_id: remove!.id } : { p_name: cleanName(name), ...(edit ? { p_player_id: edit.id } : {}) }),
      })
      setMessage(action === 'add_player' ? `Joins from round ${next}.` : action === 'remove_player' ? `Removed from the next draw, round ${next}.` : `Name changes from round ${next}.`)
      setName(''); setEdit(null); setRemove(null); saved()
    } catch (error) { setError(error instanceof Error ? error.message : 'Couldn’t update players. Please try again.') }
    finally { setBusy(false) }
  }
  const finished = data.status === 'finished'
  return <Sheet title="Players" close={close} busy={busy}><div className="sheet-content players-content">
    <p className="field-help">Changes apply to the next draw. Existing rounds stay as drawn.</p>
    <ul className="roster-list">{data.players.map(player => <li key={player.id}><div><strong>{player.pendingName ?? player.name}</strong>
      <p>{!player.active ? `Not in the next draw` : player.joinedRound > data.rounds.at(-1)!.number ? `Joins from round ${player.joinedRound}` : player.pendingName ? `Name changes from round ${next}` : 'Playing'}</p></div>
      <div className="roster-actions"><button className="small-button" disabled={busy || finished} onClick={() => { setEdit(player); setRemove(null); setName(player.pendingName ?? player.name); setError(''); setMessage('') }} aria-label={`Rename ${player.pendingName ?? player.name}`}>Rename</button>
        {token && player.active && <button className="small-button" disabled={busy || finished || activeCount <= 4} onClick={() => { setRemove(player); setEdit(null); setError('') }} aria-label={`Remove ${player.pendingName ?? player.name}`}>Remove</button>}</div></li>)}</ul>
    {remove && <div className="notice"><p>Remove {remove.pendingName ?? remove.name} from round {next} onward? Their current match and past points stay.</p><div className="inline-actions"><button className="button secondary" disabled={busy} onClick={() => setRemove(null)}>Keep player</button><button className="button secondary" disabled={busy} onClick={() => run('remove_player')}>Confirm removal</button></div></div>}
    {!finished && (token || edit) && !remove && <form className="roster-form" onSubmit={event => { event.preventDefault(); void run(edit ? 'rename_player' : 'add_player') }}>
      <label htmlFor="roster-name">{edit ? `Rename ${edit.name}` : 'New player’s name'}</label><input id="roster-name" value={name} aria-invalid={Boolean(duplicate)} aria-describedby={duplicate ? "roster-name-error" : undefined} maxLength={60} onChange={event => setName(event.target.value)} disabled={busy} autoComplete="off" />
      <p className="field-help">{edit ? `Name changes from round ${next}.` : `Joins from round ${next}, starting on 0 points.`}</p>
      {duplicate && <p className="field-error" id="roster-name-error" role="status">That name is already in use. Add a surname or initial.</p>}
      <div className="inline-actions"><button className="button primary" disabled={busy || Boolean(duplicate) || !name.trim() || (!edit && activeCount >= 40)}>{busy ? 'Saving…' : edit ? 'Save name' : 'Add player'}</button>{edit && <button type="button" className="button secondary" disabled={busy} onClick={() => { setEdit(null); setName('') }}>Cancel</button>}</div>
    </form>}
    {error && <p className="notice" role="alert">{error}</p>}<p role="status" className="field-help roster-message">{message}</p>
  </div></Sheet>
}
