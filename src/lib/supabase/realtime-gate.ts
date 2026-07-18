import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { whenRealtimeAuthReady } from './client'

/**
 * Baut + subscribed einen Realtime-Channel erst, NACHDEM der Socket
 * authentifiziert ist (`whenRealtimeAuthReady`, s. client.ts) — vermeidet den
 * anon-Init-Race auf anon-gesperrten Tabellen (claims / gutachter_termine /
 * auftraege / flow_links, PII-Haertung). Ohne Gate joint der Channel synchron im
 * useEffect als `anon`, bevor das async `setAuth` greift → walrus wirft beim
 * ersten WAL-Poll `permission denied for table <t>`.
 *
 * `build` liefert den fertig verketteten Channel OHNE `.subscribe()` (das macht der
 * Helper). Rueckgabe = cleanup-Funktion fuer den useEffect-Return; sie ist
 * race-sicher: unmount VOR dem Gate-Resolve setzt `cancelled` → subscribe wird
 * uebersprungen, der Channel gar nicht erst erstellt.
 *
 * Anwendung:
 *   useEffect(() => {
 *     const supabase = createClient()
 *     return subscribeWhenAuthed(supabase, () =>
 *       supabase.channel(name).on('postgres_changes', {...}, cb),
 *     )
 *   }, [deps])
 */
export function subscribeWhenAuthed(
  supabase: SupabaseClient,
  build: () => RealtimeChannel,
): () => void {
  let cancelled = false
  let channel: RealtimeChannel | null = null

  void whenRealtimeAuthReady().then(() => {
    if (cancelled) return
    const ch = build()
    ch.subscribe()
    channel = ch
  })

  return () => {
    cancelled = true
    if (channel) void supabase.removeChannel(channel)
  }
}
