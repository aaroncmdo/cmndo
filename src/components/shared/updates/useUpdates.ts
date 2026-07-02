'use client'

// #updates-rebuild Phase 3: Client-Hook fuer das neue Updates-Feld.
// Holt die DB-getriebene Action-Worklist (RPC, auth.uid()-scoped) + den Info-Log,
// haelt sie via Realtime (mitteilungen/tasks/nachrichten) + Window-Focus frisch
// (Action-Auto-Resolve sichtbar machen) und liefert die UI-fertigen Sektionen.

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUpdates } from '@/lib/updates/get-updates'
import { splitUpdates, routeForKontext } from '@/lib/updates/split'
import { markAllUpdatesSeen } from '@/lib/updates/actions'
import type { UpdateItem } from '@/lib/updates/types'

export function useUpdates() {
  const supabase = useMemo(() => createClient(), [])
  const channelId = useId()
  const [items, setItems] = useState<UpdateItem[]>([])
  const [rolle, setRolle] = useState('')
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const user = (await supabase.auth.getUser())?.data?.user
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('profiles')
      .select('rolle, updates_last_seen_at')
      .eq('id', user.id)
      .single()
    const rolle = (profile?.rolle as string) ?? ''
    setRolle(rolle)
    setLastSeen((profile?.updates_last_seen_at as string | null) ?? null)
    const result = await getUpdates(supabase, user.id, rolle)
    // Action-Items kriegen ihre Route rollen-bewusst aus dem Kontext.
    setItems(result.map(i =>
      i.routeUrl ? i : { ...i, routeUrl: routeForKontext(i.kontextTyp, i.kontextId, rolle) },
    ))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Realtime: Info via mitteilungen; Action-Auto-Resolve via tasks/nachrichten
  // (RLS-scoped -> nur Aenderungen, die der User ohnehin sieht).
  useEffect(() => {
    const channel = supabase
      .channel(`updates-realtime-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mitteilungen' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nachrichten' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, load, channelId])

  // Beim Zurueckkehren refetchen (z.B. nach Dok-Upload -> Action verschwindet).
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const markSeen = useCallback(async () => {
    const r = await markAllUpdatesSeen()
    if (r.ok) { setLastSeen(new Date().toISOString()); load() }
    return r
  }, [load])

  const split = useMemo(() => splitUpdates(items, lastSeen), [items, lastSeen])

  return { ...split, items, rolle, lastSeen, loading, reload: load, markSeen }
}
