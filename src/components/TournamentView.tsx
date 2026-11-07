import { useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useLiveTournament } from '../hooks/use-live-tournament'
import { calculateLeaderboard, formatPoints } from '../lib/scoring'
import { generateRound } from '../lib/rotation'
import { playerName, tournamentAction } from '../lib/tournament-api'
import type { TournamentData, TournamentMatch, TournamentRound } from '../lib/tournament-api'
import { tournamentPath, validToken } from '../lib/tournament-storage'
import Sheet from './Sheet'
import ScoreSheet from './ScoreSheet'
import PlayersSheet from './PlayersSheet'

function Leaderboard({ data }: { data: TournamentData }) {
  const rows = calculateLeaderboard(data.players, data.rounds)
  return <section className="leaderboard-panel" aria-labelledby="standings-title"><h2 id="standings-title">{data.status === 'finished' ? 'Final standings' : 'Leaderboard'}</h2>
    <p className="field-help leaderboard-scope">All rounds, including sit-out points.</p>
    <div className="leaderboard-wrap"><table className="leaderboard"><caption className="sr-only">Individual standings, sorted by points, wins, points difference and name</caption>
      <thead><tr><th scope="col" aria-label="Rank">#</th><th scope="col">Player</th><th scope="col" aria-label="Points">Pts</th><th scope="col" aria-label="Played">Pld</th><th scope="col" aria-label="Wins">W</th><th scope="col" aria-label="Points difference">Diff</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.playerId} className={row.rank <= 3 ? `podium podium-${row.rank}` : ''}><td>{row.rank}</td><th scope="row">{row.name}</th><td className="points-number">{formatPoints(row.totalPoints)}</td><td>{row.gamesPlayed}</td><td>{row.wins}</td><td>{row.pointsDifference > 0 ? '+' : ''}{row.pointsDifference}</td></tr>)}</tbody>
    </table></div><p className="field-help standings-key">Pts points · Pld played · W wins<br />Diff points difference. Sit-outs earn half the round target.</p>
  </section>
}

export default function TournamentView() {
  const { shareId = '' } = useParams()
  const location = useLocation()
  const token = location.pathname.endsWith('/admin') && validToken(location.hash.slice(1)) ? location.hash.slice(1) : undefined
  const { data, error: loadError, live, refresh } = useLiveTournament(shareId)
  const [tab, setTab] = useState<'round' | 'leaderboard'>('round')
  const [browseFinished, setBrowseFinished] = useState(false)
  const [roundNumber, setRoundNumber] = useState<number | null>(null)
  const [score, setScore] = useState<{ round: TournamentRound; match: TournamentMatch } | null>(null)
  const [playersOpen, setPlayersOpen] = useState(false)
  const [confirm, setConfirm] = useState<'early' | 'end' | null>(null)
  const [busy, setBusy] = useState(false)
  const actionInFlight = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const menuRef = useRef<HTMLDetailsElement>(null)
  if (!data) return <main className="page narrow-page"><Link className="back-link" to="/">← Home</Link>{loadError ? <div className="notice" role="alert"><h1>Let’s check that link</h1><p>{loadError}</p><button className="button secondary" onClick={refresh}>Try again</button></div> : <p className="loading" role="status">Loading tournament…</p>}</main>
  const latest = data.rounds.at(-1)!
  const selected = data.rounds.find(round => round.number === roundNumber) ?? latest
  const isCurrent = selected.id === latest.id
  const finished = data.status === 'finished'
  const activeTab = finished && !browseFinished ? 'leaderboard' : tab
  const pending = latest.matches.filter(match => match.result.status === 'unscored')
  const scoresComplete = pending.length === 0
  const canScore = Boolean(token) || (isCurrent && !finished)
  const historyReadOnly = !token && (!isCurrent || finished)

  async function action(name: string, args: Record<string, unknown>, success: string): Promise<boolean> {
    if (actionInFlight.current) return false
    actionInFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await tournamentAction(shareId, name, { ...(token ? { p_admin_token: token } : {}), ...args })
      refresh(); setMessage(success); return true
    } catch (error) { setError(error instanceof Error ? error.message : 'Couldn’t save. Please try again.'); refresh(); return false }
    finally { actionInFlight.current = false; setBusy(false) }
  }
  async function advance(early = false) {
    if (!data) return
    try {
      const round = generateRound(data.players, data.rounds, data.courts, data.defaultTarget)
      if (await action('start_next_round', { p_target: data.defaultTarget, p_round: round, p_confirm_unscored: early }, `Round ${round.number} started.`)) {
        setRoundNumber(null); setTab('round'); setConfirm(null)
      }
    } catch { setError('The player list changed. Refresh the tournament before drawing the next round.'); refresh() }
  }
  async function end() {
    if (await action('end_tournament', {}, 'Tournament ended.')) { setConfirm(null); setTab('leaderboard'); setBrowseFinished(false) }
  }
  function selectTab(next: 'round' | 'leaderboard') { setTab(next); window.scrollTo({ top: 0, behavior: 'instant' }); if (finished) setBrowseFinished(true) }
  return <main className={`page narrow-page tournament-page ${token && !finished ? 'with-admin-bar' : ''}`}>
    <div className="tournament-heading"><div><h1>{data.name}</h1><p className="round-subtitle">{finished ? 'Finished · ' : ''}Round {selected.number} · to {selected.target} points</p></div>
      {token && <details ref={menuRef} className="tournament-menu"><summary aria-label="Tournament menu">···</summary><div><Link to={tournamentPath({ shareId, adminToken: token },true)}>Share links</Link></div></details>}
    </div>
    <div className="tournament-toolbar"><label className="round-picker">View round<select aria-label="View round" value={selected.number} onChange={event => { setRoundNumber(Number(event.target.value) === latest.number ? null : Number(event.target.value)); setTab('round'); if (finished) setBrowseFinished(true) }}>{[...data.rounds].reverse().map(round => <option value={round.number} key={round.id}>Round {round.number}{round.id === latest.id ? ' · latest' : ''}</option>)}</select></label>
      <button className="button secondary players-toggle" onClick={() => setPlayersOpen(true)}>Players</button></div>
    <div className="connection-line" role="status" aria-live="polite">{!live && <span>● Reconnecting…</span>}{live && <span className="live-label">● Live</span>}</div>
    {loadError && <div className="notice" role="alert"><p>Couldn’t refresh. Your last confirmed results are still shown.</p><button className="button secondary" onClick={refresh}>Try again</button></div>}
    {error && <p className="notice" role="alert">{error}</p>}{message && <p className="action-status" role="status">{message}</p>}
    <div role="tabpanel" id="tournament-panel" aria-labelledby={activeTab === 'round' ? 'round-tab' : 'leaderboard-tab'}>
      {activeTab === 'leaderboard' ? <Leaderboard data={data} /> : <>
        {historyReadOnly && <p className="history-note">{finished ? 'Tournament finished.' : 'Past round.'} Scores are read-only.</p>}
        <div className="draw-list">{selected.matches.map(match => {
          const result = match.result
          const hasScore = result.status !== 'unscored'
          const open = () => setScore({ round: selected, match })
          return <section className="court-draw live-court" key={match.id} aria-label={`Court ${match.court}`}>
            <h2>Court <strong>{match.court}</strong></h2><div className="teams"><p>{match.teamA.map(id => <span key={id}>{playerName(selected,id,data.players)}</span>)}</p><span className="versus">vs</span><p>{match.teamB.map(id => <span key={id}>{playerName(selected,id,data.players)}</span>)}</p></div>
            {hasScore ? <>{canScore ? <button className="court-score" onClick={open} aria-label={`Edit score for Court ${match.court}`}><span>{result.status === 'scored' ? result.scoreA : 0}</span><span aria-hidden="true">–</span><span>{result.status === 'scored' ? result.scoreB : 0}</span><span className="score-edit-label">Edit score</span></button> : <div className="court-score"><span>{result.status === 'scored' ? result.scoreA : 0}</span><span>–</span><span>{result.status === 'scored' ? result.scoreB : 0}</span></div>}
              <p className="score-audit">{result.status === 'forfeited' ? 'Unscored at early advance · counts as 0–0' : `Entered by ${match.enteredBy ?? 'player'} · ${new Date(match.updatedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`}</p></> : canScore ? <button className="button secondary enter-score" onClick={open}>Enter score</button> : <p className="score-audit">No score recorded.</p>}
          </section>
        })}</div>
        <section className="sit-outs"><h2>Sitting out</h2><p>{selected.sitOuts.length ? selected.sitOuts.map(id => playerName(selected,id,data.players)).join(', ') : 'Everyone is playing.'}</p>{selected.sitOuts.length > 0 && <p className="field-help">{formatPoints(selected.target / 2)} points each this round.</p>}</section>
        <p className="rotation-hint">Keep playing as long as you like. Around {Math.max(1,data.players.filter(p => p.active).length - 1)} rounds gives everyone a chance to partner each other.</p>
      </>}
    </div>
    <div className="tournament-dock"><div className="tournament-tabs" role="tablist" aria-label="Tournament view"><button role="tab" id="round-tab" aria-selected={activeTab === 'round'} aria-controls="tournament-panel" onClick={() => selectTab('round')}>Round</button><button role="tab" id="leaderboard-tab" aria-selected={activeTab === 'leaderboard'} aria-controls="tournament-panel" onClick={() => selectTab('leaderboard')}>Leaderboard</button></div>
      {token && !finished && <div className="admin-bar"><div className="next-target"><div className="target-control"><label htmlFor="next-target">Next round’s points</label><select id="next-target" value={data.defaultTarget} disabled={busy} onChange={event => { void action('set_round_target',{p_target:Number(event.target.value)},'Next round’s target updated.') }}>{[...new Set([16,21,24,32,data.defaultTarget])].sort((a,b)=>a-b).map(target => <option key={target} value={target}>{target}</option>)}</select></div><button className="button end-tournament" disabled={busy} onClick={() => { setError(''); setConfirm('end') }}>End tournament</button></div>
        <button className="button primary" disabled={!scoresComplete || busy || !live} onClick={() => advance()}>{busy ? 'Saving…' : `Start round ${latest.number + 1}`}<span aria-hidden="true">→</span></button>
        {!scoresComplete && <div className="early-start"><span>{pending.length} {pending.length === 1 ? 'score' : 'scores'} to come</span><button disabled={busy || !live} onClick={() => { setError(''); setConfirm('early') }}>Start early…</button></div>}
      </div>}
    </div>
    {score && <ScoreSheet key={score.match.id} shareId={shareId} token={token} data={data} round={score.round} match={score.match} close={() => setScore(null)} saved={refresh} />}
    {playersOpen && <PlayersSheet shareId={shareId} token={token} data={data} close={() => setPlayersOpen(false)} saved={refresh} />}
    {confirm && <Sheet title={confirm === 'early' ? `Start round ${latest.number + 1} early?` : 'End tournament?'} close={() => setConfirm(null)} busy={busy}><div className="sheet-content"><p>{confirm === 'early' ? `${pending.map(match => `Court ${match.court}`).join(', ')} ${pending.length === 1 ? 'has' : 'have'} no score. These matches will count as 0–0. You can correct them later.` : 'Everyone will see the final standings. You can still correct past scores using your admin link.'}</p>{error && <p className="notice" role="alert">{error}</p>}</div><div className="sheet-footer confirm-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>Keep playing</button><button className="button primary" disabled={busy} onClick={() => confirm === 'early' ? advance(true) : end()}>{busy ? 'Saving…' : confirm === 'early' ? `Start round ${latest.number + 1} with 0–0` : 'End tournament'}</button></div></Sheet>}
  </main>
}
