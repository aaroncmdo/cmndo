'use server'

// WS4 (Reduced-Repair) — Kunde laedt einen eigenen Kostenvoranschlag im Claim hoch.
// EIN KVA-Dokument, zwei Upload-Quellen: Werkstatt (via KvaErstellenModal /
// erstelleKvaFuerAuftrag) und Kunde (hier). Beide landen als fall_dokumente-Row
// (dokument_typ='kostenvoranschlag', sichtbar_fuer inkl. 'kunde') am selben Claim.
//
// Ownership: assertKundeOwnsClaim (claim_parties.user_id ODER claims.geschaedigter_user_id
// ODER Lead-Email) beweist, dass der eingeloggte Kunde diesen Claim besitzt — liefert
// zugleich die fall_id (fall_dokumente.fall_id ist NOT NULL). Der Write laeuft danach
// ueber den Admin-Client (Service-Role), aber NUR nach bestandener Ownership-Pruefung,
// scoped auf die verifizierte fall_id/claim_id. Spiegelt uploadPflichtdokumentKunde.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertKundeOwnsClaim } from '@/lib/claims/kunde-ownership'
import { revalidatePath } from 'next/cache'

export async function uploadKvaKunde(
  claimId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) return { ok: false, error: 'Kein Claim.' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'Keine Datei.' }

  // Ownership-Gate (Service-Role fuer den Cross-Table-Check) + fall_id.
  const admin = createAdminClient()
  const ownership = await assertKundeOwnsClaim(admin, user.id, user.email ?? null, claimId)
  if (!ownership.ok) return { ok: false, error: 'Nicht autorisiert.' }
  if (!ownership.fallId) return { ok: false, error: 'Kein Fall zum Claim gefunden.' }

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `claims/${claimId}/kostenvoranschlag_${Date.now()}.${ext}`
  const { error: uploadErr } = await admin.storage.from('fall-dokumente').upload(path, file)
  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { error: docErr } = await admin.from('fall_dokumente').insert({
    fall_id: ownership.fallId,
    claim_id: claimId,
    dokument_typ: 'kostenvoranschlag',
    storage_path: path,
    original_filename: file.name,
    mime_type: file.type || null,
    groesse_bytes: file.size,
    kategorie: 'kostenvoranschlag',
    quelle: 'kunde',
    hochgeladen_von_user_id: user.id,
    uploaded_by_kunde: true,
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  } as never)
  if (docErr) return { ok: false, error: docErr.message }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
