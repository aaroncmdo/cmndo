'use server'

import { createClient } from '@/lib/supabase/server'

// #updates-rebuild Phase 2 + A2: "Alles gesehen" setzt BEIDE Read-Marker:
// - Info-Feed: profiles.updates_last_seen_at (blauer Punkt).
// - Action-Items: profiles.actions_last_seen_at (A2 Zwei-Stufen — die rote Zahl zaehlt nur
//   UNGESEHENE Action-Items; nach "gesehen" werden sie grau). Strukturell verschwinden
//   Action-Items weiter erst ueber ihren DB-State (erledigt) — das laeuft ueber get-updates.
// Result-Object statt throw (AAR-800).
export async function markAllUpdatesSeen(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('profiles')
    // actions_last_seen_at ist frisch via Migration 20260713234336 ergaenzt; database.types.ts
    // hinkt noch hinterher (Regen = Follow-up) -> Cast-Bridge fuer den zusaetzlichen Cursor.
    .update({ updates_last_seen_at: now, actions_last_seen_at: now } as never)
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
