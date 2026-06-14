'use server'

// AAR-956: SV verknüpft sein Google-Business-Profil (via Places-Autocomplete im
// Onboarding-Logo-Schritt UND im Profil) → setzt `profiles.google_place_id` +
// holt die Reviews sofort in `google_bewertungen_cache` → Sterne erscheinen im
// Gutachter-Finder ohne auf den nächtlichen Cron zu warten.
//
// Sicherheit: Auth via getUser(), Update STRIKT auf die eigene profiles-Zeile
// (admin-Client mit .eq('id', user.id) — kein Cross-User-Update).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUndCacheGoogleBewertung } from '@/lib/google-bewertungen/fetch-und-cache'
import { revalidatePath } from 'next/cache'

export async function verknuepfeGoogleBusiness(
  placeId: string | null,
): Promise<
  | { ok: true; durchschnitt: number | null; anzahl: number | null }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const cleanId = (placeId ?? '').trim() || null

  const admin = createAdminClient()
  const { error: profErr } = await admin
    .from('profiles')
    .update({ google_place_id: cleanId })
    .eq('id', user.id)
  if (profErr) return { ok: false, error: `Speichern fehlgeschlagen: ${profErr.message}` }

  revalidatePath('/gutachter/profil')

  // Entkoppelt: place_id ist gespeichert. Reviews-Fetch ist non-fatal — schlägt
  // er fehl (kein Key / Places-API down), zieht der nächtliche Cron nach.
  if (!cleanId) return { ok: true, durchschnitt: null, anzahl: null }

  const bew = await fetchUndCacheGoogleBewertung(user.id, cleanId)
  if (!bew.ok) return { ok: true, durchschnitt: null, anzahl: null }
  return { ok: true, durchschnitt: bew.durchschnitt, anzahl: bew.anzahl }
}
