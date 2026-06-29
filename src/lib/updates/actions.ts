'use server'

import { createClient } from '@/lib/supabase/server'

// #updates-rebuild Phase 2: "Alles gesehen" — setzt den Read-Marker des Info-Feeds
// (profiles.updates_last_seen_at). Action-Items bleiben UNBERUEHRT: die loesen sich
// strukturell nur ueber ihren DB-State auf (Dok hochladen, Task erledigen, ...),
// nicht durch "gesehen". Result-Object statt throw (AAR-800).
export async function markAllUpdatesSeen(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('profiles')
    .update({ updates_last_seen_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
