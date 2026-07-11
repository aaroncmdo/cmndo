'use server'

// Slice 1b — SV laedt seine Honorar-/Gutachten-Rechnung als fall_dokumente-Zeile
// mit dokument_typ='rechnung_gutachten' und sichtbar_fuer inkl. 'kunde' hoch.
// Muster: src/app/werkstatt/(shell)/auftraege/reparatur-abschluss-actions.ts
// (Storage-Upload + fall_dokumente-Insert via Admin-Client + faelle_claim_bridge).
// Auth: requirePortalAccess(['sachverstaendiger']) + sv_id-Ownership-Gate.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { getGutachterForUser } from '@/lib/gutachter'

export async function uploadSvRechnung(
  fallId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['sachverstaendiger'])

  const file = formData.get('rechnung')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Bitte die Rechnung (PDF oder Bild) hochladen.' }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: 'Datei zu groß (max. 10 MB).' }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // sv_id-Ownership-Gate: Fall muss diesem SV zugewiesen sein.
  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein Sachverständigen-Profil gefunden' }

  const claimId = await resolveClaimId(supabase, fallId)
  const { data: ownClaim } = claimId
    ? await supabase
        .from('claims')
        .select('id')
        .eq('id', claimId)
        .eq('sv_id', (sv as { id: string }).id)
        .maybeSingle()
    : { data: null }
  if (!ownClaim || !claimId) {
    return { ok: false, error: 'Fall nicht gefunden oder kein Zugriff.' }
  }

  const admin = createAdminClient()

  // fall_id aus faelle_claim_bridge (wie Werkstatt-Schlussrechnung-Muster).
  const { data: bridge } = await admin
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const resolvedFallId = (bridge as { fall_id: string } | null)?.fall_id ?? fallId

  // Storage-Upload: claims/{claimId}/sv-rechnung/{timestamp}.{ext}
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const storagePath = `claims/${claimId}/sv-rechnung/rechnung_${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(storagePath, bytes, { contentType: file.type || 'application/pdf', upsert: true })
  if (upErr) return { ok: false, error: `Upload fehlgeschlagen: ${upErr.message}` }

  // fall_dokumente-Insert mit sichtbar_fuer inkl. 'kunde'.
  const { error: docErr } = await admin.from('fall_dokumente').insert({
    fall_id: resolvedFallId,
    claim_id: claimId,
    dokument_typ: 'rechnung_gutachten',
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type || 'application/pdf',
    groesse_bytes: bytes.byteLength,
    kategorie: 'rechnung_gutachten',
    quelle: 'gutachter',
    hochgeladen_von_user_id: user.id,
    uploaded_by_sv: true,
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  } as never)
  if (docErr) return { ok: false, error: `Dokument-Speicherung fehlgeschlagen: ${docErr.message}` }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath(`/kunde/faelle/${claimId}`)

  return { ok: true }
}
