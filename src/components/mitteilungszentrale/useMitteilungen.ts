'use client'

// AAR-229 W3 / F-03: Hook für die Mitteilungszentrale.
// Initialer Fetch + Counts pro Kategorie + Realtime-Subscription.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Mitteilung, MitteilungKategorie } from '@/lib/mitteilungen/types'

type Counts = Record<MitteilungKategorie, number>

export function useMitteilungen() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Mitteilung[]>([])
  const [counts, setCounts] = useState<Counts>({ update: 0, task: 0, nachricht: 0, anruf: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const user = (await supabase.auth.getUser())?.data?.user
    if (!user) return

    const [{ data }, { data: countData }] = await Promise.all([
      supabase
        .from('mitteilungen')
        .select('*')
        .eq('empfaenger_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('mitteilungen')
        .select('kategorie')
        .eq('empfaenger_id', user.id)
        .eq('gelesen', false),
    ])

    setItems((data ?? []) as Mitteilung[])

    const c: Counts = { update: 0, task: 0, nachricht: 0, anruf: 0 }
    for (const row of countData ?? []) {
      const k = row.kategorie as MitteilungKategorie
      if (k in c) c[k]++
    }
    setCounts(c)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Realtime — auf INSERT + UPDATE Events für eigene mitteilungen.
  useEffect(() => {
    const channel = supabase
      .channel('mitteilungen-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mitteilungen' }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mitteilungen' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, load])

  const totalUnread = counts.update + counts.task + counts.nachricht + counts.anruf

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('mitteilungen').update({ gelesen: true, gelesen_am: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(m => m.id === id ? { ...m, gelesen: true } : m))
    load()
  }, [supabase, load])

  const markAllAsRead = useCallback(async () => {
    const ids = items.filter(m => !m.gelesen).map(m => m.id)
    if (!ids.length) return
    await supabase.from('mitteilungen').update({ gelesen: true, gelesen_am: new Date().toISOString() }).in('id', ids)
    setItems(prev => prev.map(m => ({ ...m, gelesen: true })))
    setCounts({ update: 0, task: 0, nachricht: 0, anruf: 0 })
  }, [supabase, items])

  return { items, counts, totalUnread, loading, markAsRead, markAllAsRead }
}
