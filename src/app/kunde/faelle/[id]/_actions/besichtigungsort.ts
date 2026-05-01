'use server'

// Kunden-Action: Besichtigungsort eines Falls aktualisieren.
// Ueberschreibt faelle.besichtigungsort_adresse + _lat + _lng.
// Wird von der Termin-Verschieben-Modal aufgerufen wenn der Kunde den
// Ort des Verlegungstermins anpasst — die Routenberechnung der
// Vorschlaege-Loader (lib/termine/verlegung-vorschlaege.ts) verwendet
// diese Koordinaten als Ziel der naechsten SV-Tagesroute.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateBesichtigungsortVomKunden(params: {
  fallId: string
  adresse: string
  lat: number | null
  lng: number | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  if (!params.adresse.trim()) return { ok: false, error: 'Adresse fehlt' }
  if (params.lat === null || params.lng === null) {
    return { ok: false, error: 'Koordinaten fehlen — bitte Vorschlag aus Dropdown waehlen.' }
  }

  // Ownership-Check
  const admin = createAdminClient()
  const { data: fall } = await admin
    .from('faelle')
    .select('id, kunde_id')
    .eq('id', params.fallId)
    .maybeSingle()
  if (!fall || fall.kunde_id !== user.id) {
    return { ok: false, error: 'Kein Zugriff' }
  }

  const { error } = await admin
    .from('faelle')
    .update({
      besichtigungsort_adresse: params.adresse,
      besichtigungsort_lat: params.lat,
      besichtigungsort_lng: params.lng,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.fallId)
  if (error) return { ok: false, error: error.message }

  // Timeline-Eintrag fuer Audit
  await admin.from('timeline').insert({
    fall_id: params.fallId,
    typ: 'system',
    titel: 'Besichtigungsort aktualisiert (Kunde)',
    beschreibung: params.adresse,
  })

  revalidatePath(`/kunde/faelle/${params.fallId}`)
  return { ok: true }
}
