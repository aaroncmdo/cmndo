'use server'

// WS3 (Reduced-Repair) — Kunde laedt Schadenfotos im Claim hoch.
// Im reduzierten Flow (kein SV, der Fotos macht) muss der Kunde selbst liefern.
// Die Fotos landen als fall_dokumente-Rows (dokument_typ='schadensfoto',
// sichtbar_fuer inkl. 'kunde' + 'sachverstaendiger' -> Werkstatt sieht sie ueber
// ihre Auftrags-Sicht) UND als URLs im jsonb-Array leads.schadensfoto_urls (der
// etablierten Foto-Quelle; via claims.lead_id gefunden).
//
// Ownership: assertKundeOwnsClaim beweist den Claim-Besitz + liefert fall_id
// (fall_dokumente.fall_id ist NOT NULL) und lead_id. Writes danach ueber den
// Admin-Client (Service-Role), scoped auf die verifizierten IDs — spiegelt
// uploadKvaKunde / uploadPflichtdokumentKunde.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertKundeOwnsClaim } from '@/lib/claims/kunde-ownership'
import { getStorageUrl } from '@/lib/storage/url'
import { revalidatePath } from 'next/cache'

export async function uploadSchadensfotoKunde(
  claimId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) return { ok: false, error: 'Kein Claim.' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // 1..n Dateien aus dem FormData (Feld 'files').
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { ok: false, error: 'Keine Fotos.' }

  const admin = createAdminClient()
  const ownership = await assertKundeOwnsClaim(admin, user.id, user.email ?? null, claimId)
  if (!ownership.ok) return { ok: false, error: 'Nicht autorisiert.' }
  if (!ownership.fallId) return { ok: false, error: 'Kein Fall zum Claim gefunden.' }

  const neueUrls: string[] = []
  // Per-Foto non-fatal: ein einzelner fehlgeschlagener Upload bricht die anderen nicht.
  for (const file of files) {
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `claims/${claimId}/schadensfoto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: uploadErr } = await admin.storage.from('fall-dokumente').upload(path, file)
      if (uploadErr) {
        console.error('[uploadSchadensfotoKunde] Storage-Upload fehlgeschlagen (non-fatal):', uploadErr.message)
        continue
      }
      const { error: docErr } = await admin.from('fall_dokumente').insert({
        fall_id: ownership.fallId,
        claim_id: claimId,
        dokument_typ: 'schadensfoto',
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type || null,
        groesse_bytes: file.size,
        kategorie: 'schadensfoto',
        quelle: 'kunde',
        hochgeladen_von_user_id: user.id,
        uploaded_by_kunde: true,
        sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
      } as never)
      if (docErr) {
        console.error('[uploadSchadensfotoKunde] fall_dokumente-Insert fehlgeschlagen (non-fatal):', docErr.message)
        continue
      }
      const url = await getStorageUrl(admin, 'fall-dokumente', path)
      if (url) neueUrls.push(url)
    } catch (err) {
      console.error('[uploadSchadensfotoKunde] Foto-Upload fehlgeschlagen (non-fatal):', err)
    }
  }

  if (neueUrls.length === 0) return { ok: false, error: 'Kein Foto konnte hochgeladen werden.' }

  // URLs ans leads.schadensfoto_urls-Array anhaengen (string[]-Shape, dedupe).
  // Non-fatal: die fall_dokumente-Rows sind bereits die kanonische Sichtbarkeit.
  if (ownership.leadId) {
    try {
      const { data: lead } = await admin
        .from('leads')
        .select('schadensfoto_urls')
        .eq('id', ownership.leadId)
        .maybeSingle()
      const existing = Array.isArray((lead as { schadensfoto_urls: unknown } | null)?.schadensfoto_urls)
        ? ((lead as { schadensfoto_urls: string[] }).schadensfoto_urls)
        : []
      const merged = [...existing]
      for (const u of neueUrls) if (!merged.includes(u)) merged.push(u)
      // Das umschliessende try faengt diesen Write nicht. Bleibt er aus, liegen die
      // vom Kunden hochgeladenen Fotos im Storage, tauchen aber nirgends auf.
      const { error: fotoFehler } = await admin
        .from('leads')
        .update({ schadensfoto_urls: merged, updated_at: new Date().toISOString() } as never)
        .eq('id', ownership.leadId)
      if (fotoFehler) {
        console.error(`[uploadSchadensfotoKunde] Foto-URLs nicht gespeichert (Lead ${ownership.leadId}, ${neueUrls.length} neu):`, fotoFehler.message)
      }
    } catch (err) {
      console.error('[uploadSchadensfotoKunde] leads.schadensfoto_urls-Update fehlgeschlagen (non-fatal):', err)
    }
  }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
