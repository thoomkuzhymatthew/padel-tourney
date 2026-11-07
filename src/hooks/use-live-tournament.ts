import { useCallback, useEffect, useState } from 'react'
import { RealtimeClient } from '@supabase/realtime-js'
import { getTournament, supabasePublicKey, supabaseUrl } from '../lib/tournament-api'
import type { TournamentData } from '../lib/tournament-api'

export function useLiveTournament(shareId: string) {
  const [state, setState] = useState<{ shareId: string; data: TournamentData | null; error: string }>({ shareId, data: null, error: '' })
  const [live, setLive] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(n => n + 1), [])
  useEffect(() => {
    let active = true
    let fetching = false
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function refresh() {
      if (fetching) { dirty = true; return }
      fetching = true
      do {
        dirty = false
        try {
          const data = await getTournament(shareId)
          if (active) setState({ shareId, data, error: '' })
        } catch (error) {
          if (active) setState(previous => ({ shareId, data: previous.shareId === shareId ? previous.data : null,
            error: error instanceof Error ? error.message : 'Couldn’t refresh. Please try again.' }))
        }
      } while (dirty && active)
      fetching = false
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void refresh() }, 70) }
    const offline = () => { setLive(false); client?.disconnect() }
    const online = () => setAttempt(n => n + 1)
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    const client = supabaseUrl && supabasePublicKey ? new RealtimeClient(`${supabaseUrl}/realtime/v1`, {
      params: { apikey: supabasePublicKey }, heartbeatIntervalMs: 10000,
    }) : null
    client?.channel(`tournament:${shareId}`, { config: { private: false } })
      .on('broadcast', { event: 'changed' }, schedule)
      .subscribe(status => {
        if (!active) return
        setLive(status === 'SUBSCRIBED' && navigator.onLine)
        if (status === 'SUBSCRIBED') void refresh()
      })
    void refresh()
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visible)
    // Refresh visible data periodically if a notification is lost; WebSocket
    // reconnects remain the primary live transport.
    const recovery = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void refresh() }, 15000)
    return () => {
      active = false; clearTimeout(timer); clearInterval(recovery)
      window.removeEventListener('offline', offline); window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visible)
      void client?.removeAllChannels(); client?.disconnect()
    }
  }, [shareId, attempt])
  return { data: state.shareId === shareId ? state.data : null, error: state.shareId === shareId ? state.error : '', live, refresh: retry }
}
