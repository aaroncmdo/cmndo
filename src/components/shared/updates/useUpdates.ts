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
  const [actionsSeen, setActionsSeen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const user = (await supabase.auth.getUser())?.data?.user
    if (!user) { setLoading(false); return }
    const { data: profileRaw } = await supabase
      .from('profiles')
      .select('rolle, updates_last_seen_at, actions_last_seen_at')
      .eq('id', user.id)
      .single()
    // A2: actions_last_seen_at frisch via Migration 20260713234336; database.types.ts hinkt
    // hinterher (Regen = Follow-up) -> Cast-Bridge fuer die gelesenen Profil-Felder.
    const profile = profileRaw as unknown as {
      rolle: string | null
      updates_last_seen_at: string | null
      actions_last_seen_at: string | null
    } | null
    const rolle = profile?.rolle ?? ''
    setRolle(rolle)
    setLastSeen(profile?.updates_last_seen_at ?? null)
    setActionsSeen(profile?.actions_last_seen_at ?? null)
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
    if (r.ok) {
      // A2: beide Cursor lokal vorschieben -> rote Zahl faellt sofort, gesehene Actions grau.
      const now = new Date().toISOString()
      setLastSeen(now)
      setActionsSeen(now)
      load()
    }
    return r
  }, [load])

  const split = useMemo(() => splitUpdates(items, lastSeen, actionsSeen), [items, lastSeen, actionsSeen])

  return { ...split, items, rolle, lastSeen, loading, reload: load, markSeen }
}
