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
// CMM-63 SP-C: Ownership zentral über claim_parties (SSoT) statt inline faelle.kunde_id.
import { assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'

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

  // Ownership-Check (CMM-63 SP-C: zentraler Helper, claim_parties-SSoT)
  const admin = createAdminClient()
  const ownership = await assertKundeOwnsFall(admin, user.id, user.email ?? null, params.fallId)
  if (!ownership.ok) {
    return { ok: false, error: 'Kein Zugriff' }
  }

  // CMM-44 SP-D PR2b: besichtigungsort write → aktueller Termin (start_zeit DESC).
  // Fallback auf faelle wenn kein Termin existiert (besichtigungsort ist claim-level —
  // darf nie verloren gehen). CMM-63 TODO: Fallback-faelle-Write (§G.D Hard-Breaker)
  // braucht Termin-Platzhalter bevor faelle dropt — eigener PR.
  let writeOk = false
  const claimId = ownership.claimId
  if (claimId) {
    const { data: t } = await admin
      .from('gutachter_termine')
      .select('id')
      .eq('claim_id', claimId)
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (t?.id) {
      const { error } = await admin
        .from('gutachter_termine')
        .update({
          besichtigungsort_adresse: params.adresse,
          besichtigungsort_lat: params.lat,
          besichtigungsort_lng: params.lng,
        })
        .eq('id', t.id)
      if (error) return { ok: false, error: error.message }
      writeOk = true
    }
  }
  if (!writeOk) {
    // Fallback: kein Termin vorhanden — schreibe auf faelle (keine Datenverlust-Situation)
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
  }

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
