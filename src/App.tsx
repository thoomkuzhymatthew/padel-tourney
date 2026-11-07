import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { defaultTournamentName, normalizeName, splitNames, validateNames } from './lib/create-form'
import { backendConfigured, createTournament, loadTournament } from './lib/tournament-api'
import type { TournamentSummary } from './lib/tournament-api'
import { readTournaments, saveTournament, tournamentPath, validToken } from './lib/tournament-storage'
import TournamentView from './components/TournamentView'
import './App.css'

function Brand() {
  return <Link className="brand" to="/" aria-label="Padel Genie home"><span className="brand-mark" aria-hidden="true">p<span>g</span></span>Padel Genie<span className="brand-product">Americano</span></Link>
}

function CourtIllustration() {
  return <svg className="court-illustration" viewBox="0 0 340 188" fill="none" aria-hidden="true">
    <rect x="21" y="17" width="298" height="152" rx="3" />
    <path d="M170 17v152M77 17v152M263 17v152M77 93h186" />
    <path className="court-net" d="M170 9v168" />
    <circle cx="112" cy="56" r="10" /><circle cx="232" cy="129" r="10" />
    <circle className="court-player" cx="112" cy="129" r="10" /><circle className="court-player" cx="232" cy="56" r="10" />
    <path className="court-rally" d="m122 124 89-60" />
  </svg>
}

function Home() {
  const { tournaments, available } = readTournaments()
  return <main className="page home-page">
    <section className="home-intro">
      <div className="hero-copy"><p className="intro-label">Good games. New partners.</p>
        <h1>Your court.<br />Your people.<br /><span>Let’s play.</span></h1>
        <p className="lead">Run your next Americano in a minute. Add your players. We’ll make the draw.</p>
        <Link className="button primary" to="/create">Create tournament <span aria-hidden="true">↗</span></Link>
        <p className="small-note">Free to play. No accounts needed.</p>
      </div>
      <div className="court-feature"><CourtIllustration /><p>Different partners.<br /><strong>Everyone in the game.</strong></p></div>
    </section>
    {tournaments.length > 0 && <section className="saved-section" aria-labelledby="saved-heading"><h2 id="saved-heading">Your tournaments</h2>
      <p className="section-note">Saved on this device.</p>
      <ul className="saved-list">{tournaments.map(t => <li key={t.shareId}><div><h3>{t.name}</h3><p>{new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p></div>
        <Link className="button secondary" to={tournamentPath(t, true)}>Resume <span aria-hidden="true">→</span></Link></li>)}</ul>
    </section>}
    {!available && <p className="notice">This browser can’t load saved tournaments. You can still play using a saved link.</p>}
  </main>
}

function Create() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [names, setNames] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [courts, setCourts] = useState(2)
  const [target, setTarget] = useState(24)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const draftRef = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const [defaultName] = useState(defaultTournamentName)
  const playerError = names.length >= 4 ? validateNames(names) : null
  const usedCourts = Math.min(courts, Math.floor(names.length / 4))

  function append(text: string) {
    const additions = splitNames(text)
    if (!additions.length) return
    if (names.length + additions.length > 40) { setError('Use up to 40 players in one tournament.'); return }
    if (additions.some(n => n.length > 60)) { setError('Keep player names to 60 characters or fewer.'); return }
    const existing = new Set(names.map(normalizeName))
    for (const addition of additions) {
      const normalized = normalizeName(addition)
      if (existing.has(normalized)) { setError(`“${addition}” is already in the list. Add an initial to tell players apart.`); return }
      existing.add(normalized)
    }
    setNames([...names, ...additions])
    setDraft('')
    setError('')
    draftRef.current?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    const finalNames = [...names, ...splitNames(draft)]
    const invalid = validateNames(finalNames)
    if (invalid) { setError(invalid); draftRef.current?.focus(); return }
    if (name.trim().length > 100) { setError('Keep the tournament name to 100 characters or fewer.'); return }
    setNames(finalNames)
    setDraft('')
    setError('')
    inFlight.current = true
    setBusy(true)
    try {
      const { tournament, summary } = await createTournament({ name: name.trim() || defaultName, names: finalNames, courts, target })
      saveTournament(tournament)
      navigate(tournamentPath(tournament, true), { replace: true, state: { summary } })
    } catch {
      setError('We couldn’t confirm your tournament was saved. Check your connection before trying again; it may already have been created.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return <main className="page narrow-page"><Link className="back-link" to="/">← Back</Link>
    <div className="page-heading"><p className="intro-label">Bring your people</p><h1>Create tournament</h1><p>Set it up here. Settle it on court.</p></div>
    <form onSubmit={submit} noValidate>
      <fieldset disabled={busy} className="form-fields">
        <div className="field"><label htmlFor="tournament-name">Tournament name <span>optional</span></label>
          <input id="tournament-name" value={name} onChange={e => setName(e.target.value)} placeholder={defaultName} maxLength={100} autoComplete="off" /></div>
        <section className="players-section" aria-labelledby="players-heading"><div className="section-title"><h2 id="players-heading">Players</h2><span className="count-badge" aria-label={`${names.length} players`}>{names.length}<span> / 40</span></span></div>
          <p className="field-help" id="names-help">Add at least 4. Press Enter for the next name, or paste a list.</p>
          <ol className="player-list">{names.map((playerName, i) => <li key={i}>
            <span className="player-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <input aria-label={`Player ${i + 1} name`} value={playerName} maxLength={60} autoComplete="off"
              aria-invalid={!playerName.trim() || names.some((n, j) => j !== i && normalizeName(n) === normalizeName(playerName))}
              onChange={e => { setNames(names.map((n, j) => j === i ? e.target.value : n)); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); draftRef.current?.focus() } }} />
            <button className="icon-button" type="button" aria-label={`Remove player ${i + 1}`} onClick={() => setNames(names.filter((_, j) => j !== i))}>×</button>
          </li>)}</ol>
          <div className="add-player"><input id="add-player" ref={draftRef} aria-label="Add a player" aria-describedby="names-help" value={draft} placeholder={names.length ? 'Next player’s name' : 'Player’s name'} autoComplete="off" maxLength={2500}
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); append(draft) } }}
            onPaste={e => { const text = e.clipboardData.getData('text'); if (/[\n,\r]/.test(text)) { e.preventDefault(); append(text) } }} />
            <button className="icon-button add-button" type="button" aria-label="Add player" onClick={() => append(draft)} disabled={!draft.trim() || names.length >= 40}>+</button></div>
          {playerError && <p className="field-error">{playerError}</p>}
        </section>
        <section className="courts-section" aria-labelledby="courts-heading"><div className="section-title"><h2 id="courts-heading">Courts</h2>
          <div className="stepper"><button type="button" className="icon-button" aria-label="Fewer courts" disabled={courts <= 1} onClick={() => setCourts(courts - 1)}>−</button><output aria-label="Court count">{courts}</output><button type="button" className="icon-button" aria-label="More courts" disabled={courts >= 10} onClick={() => setCourts(courts + 1)}>+</button></div></div>
          {names.length >= 4 && usedCourts < courts && <p className="field-help court-notice">{names.length} players will use {usedCourts} {usedCourts === 1 ? 'court' : 'courts'}. {names.length % 4 > 0 ? `${names.length - usedCourts * 4} will sit out each round.` : ''}</p>}
        </section>
        <fieldset className="points-section"><legend>Points per match</legend><div className="points-options">{[16, 21, 24, 32].map(points => <label className={target === points ? 'point-chip selected' : 'point-chip'} key={points}><input type="radio" name="points" value={points} checked={target === points} onChange={() => setTarget(points)} /><span>{points}</span></label>)}</div><p className="field-help">Both teams’ scores add up to this total.</p></fieldset>
      </fieldset>
      {!backendConfigured && <p className="notice" role="alert">Tournament setup is unavailable. Please try again later.</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="form-action"><button className="button primary" type="submit" disabled={busy || !backendConfigured}>{busy ? 'Creating tournament…' : 'Start'}<span aria-hidden="true">→</span></button></div>
    </form>
  </main>
}

function useTournament(initialSummary?: TournamentSummary) {
  const { shareId = '' } = useParams()
  const [state, setState] = useState<{ shareId: string; summary: TournamentSummary | null; error: string }>({ shareId, summary: initialSummary ?? null, error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    loadTournament(shareId).then(summary => {
      if (current) setState({ shareId, summary, error: '' })
    }).catch(error => {
      if (current) setState({ shareId, summary: initialSummary ?? null, error: error instanceof Error ? error.message : 'Couldn’t load this tournament. Please try again.' })
    })
    return () => { current = false }
  }, [shareId, attempt, initialSummary])
  const visible = state.shareId === shareId ? { summary: state.summary, error: state.error } : { summary: null, error: '' }
  return { shareId, ...visible, retry: () => { setState({ shareId, summary: null, error: '' }); setAttempt(n => n + 1) } }
}

function LoadState({ error, retry }: { error: string; retry: () => void }) {
  return <main className="page narrow-page"><Link className="back-link" to="/">← Home</Link>{error ? <div className="notice" role="alert"><h1>Let’s check that link</h1><p>{error}</p><button className="button secondary" onClick={retry}>Try again</button></div> : <p className="loading" role="status">Loading tournament…</p>}</main>
}

function ShareLink({ title, description, url, admin = false }: { title: string; description: string; url: string; admin?: boolean }) {
  const [message, setMessage] = useState('')
  const [reveal, setReveal] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Link copied'); setReveal(false) }
    catch { setReveal(true); setMessage('Select and copy the link below.') }
  }
  async function share() {
    if (!navigator.share) { await copy(); return }
    try { await navigator.share({ title: 'Padel Genie tournament', text: admin ? 'Keep this link to manage your tournament.' : 'Join our Americano.', url }); setMessage('Share sheet opened') }
    catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) await copy() }
  }
  return <section className={`share-section ${admin ? 'admin-share' : ''}`} aria-label={title}>
    <h2>{title}<span aria-hidden="true">{'↗'}</span></h2><p>{description}</p>
    <div className="share-actions"><button className="button secondary" onClick={copy}>Copy link</button><button className="button text-button" onClick={share}>Share <span aria-hidden="true">↗</span></button></div>
    <p className="copy-status" role="status">{message}</p>
    {reveal && <label className="manual-copy">{admin ? 'Admin link' : 'Player link'}<input readOnly value={url} onFocus={e => e.target.select()} autoFocus /></label>}
  </section>
}

function LinksScreen() {
  const location = useLocation()
  const { shareId, summary, error, retry } = useTournament(location.state?.summary)
  const token = location.hash.slice(1)
  const [saved, setSaved] = useState<boolean | null>(null)
  useEffect(() => {
    if (summary && validToken(token)) {
      const existing = readTournaments().tournaments.find(t => t.shareId === shareId)
      const didSave = saveTournament({ shareId, adminToken: token, name: summary.name, createdAt: existing?.createdAt ?? new Date().toISOString() })
      // The result reflects storage availability, not tournament data.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaved(didSave)
    }
  }, [shareId, summary, token])
  if (!summary && !validToken(token)) return <LoadState error={error} retry={retry} />
  const savedTournament = readTournaments().tournaments.find(t => t.shareId === shareId)
  const adminPath = validToken(token) ? tournamentPath({ shareId, adminToken: token }) : null
  return <main className="page narrow-page links-page"><p className="intro-label">You’re on court</p><h1>{summary?.name ?? savedTournament?.name ?? 'Your tournament'}</h1>
    <p className="lead">{summary ? summary.status === 'finished' ? 'Tournament finished.' : `Round ${summary.number} is ready.` : 'Keep these links handy.'}</p>
    {summary && <p className="tournament-meta">{summary.playerCount} players <span>·</span> {summary.matches.length} {summary.matches.length === 1 ? 'court' : 'courts'} <span>·</span> {summary.target} points</p>}
    {error && <div className="notice" role="alert"><p>We couldn’t refresh your tournament. You can still copy and save your links.</p><button className="button secondary" onClick={retry}>Try again</button></div>}
    <div className="links-list"><ShareLink title="Player link" description="Send this to everyone playing." url={`${window.location.origin}/t/${shareId}`} />
      {adminPath ? <ShareLink title="Admin link" description="This link controls the tournament. Send it to yourself now." url={`${window.location.origin}${adminPath}`} admin /> : <p className="notice">Your admin link is missing. Open the full link saved on your device, or ask the organiser to resend it.</p>}
    </div>
    {adminPath && <><p className={saved === false ? 'notice' : 'saved-note'}>{saved === false ? 'This browser couldn’t save your tournament. Copy the admin link before leaving this page.' : saved ? '✓ Saved on this device. Keep a copy of your admin link, too.' : 'Keep a copy of your admin link.'}</p>
      <Link className="button primary" to={adminPath}>Open tournament <span aria-hidden="true">→</span></Link></>}
    <Link className="back-link centered" to="/">Back to home</Link>
  </main>
}


function NotFound() {
  return <main className="page narrow-page"><h1>Out of bounds.</h1><p>This page doesn’t exist. Head home to create or resume a tournament.</p><Link className="button primary" to="/">Back to home</Link></main>
}

function RouteFocus() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    const main = document.querySelector<HTMLElement>('main')
    main?.setAttribute('tabindex', '-1')
    main?.focus({ preventScroll: true })
  }, [pathname])
  return null
}

function App() {
  return <BrowserRouter><RouteFocus /><header className="site-header"><div className="header-inner"><Brand /><span className="header-note">Made for the court.</span></div></header><Routes>
    <Route path="/" element={<Home />} /><Route path="/create" element={<Create />} />
    <Route path="/t/:shareId/links" element={<LinksScreen />} />
    <Route path="/t/:shareId/admin" element={<TournamentView />} /><Route path="/t/:shareId" element={<TournamentView />} />
    <Route path="*" element={<NotFound />} />
  </Routes><footer className="site-footer"><span>Padel Genie</span><span>A little less organising. A lot more padel.</span></footer></BrowserRouter>
}

export default App
