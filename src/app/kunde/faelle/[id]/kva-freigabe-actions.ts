'use server'

// KVA-Loop (Kunde-Seite) — Kunde gibt den Werkstatt-Kostenvoranschlag frei.
// Setzt claims.reparatur_freigegeben_am + reparatur_freigegeben_von (analog zur
// Staff-Action reparaturFreigeben in src/app/faelle/[id]/_actions/reparatur-freigabe.ts,
// aber mit KUNDEN-Ownership statt requireStaff()).
//
// Auth/Ownership-Modell (wie schlageReparaturTerminVorPortal):
//   1. Kunde-Session (createClient) + getUser() — nicht angemeldet => Fehler.
//   2. Claim per Kunde-Session lesen: die claims-SELECT-RLS
//      (geschaedigter_user_id = auth.uid() ODER is_claim_user_party(id)) laesst
//      NUR eigene Claims durch => eine non-null Row IST der Ownership-Beweis.
//   3. UPDATE via Service-Client (kein Kunde-RLS-UPDATE auf claims vorhanden).

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function genehmigeKvaPortal(
  claimId: string,
  // AV6: der Kunde gibt den Reparaturauftrag per Unterschrift frei (Reparaturauftrag, KEINE
  // Sicherungsabtretung). Die Signatur (PNG data URI) wird als fall_dokumente-Beleg abgelegt.
  // Optional — die alte Klick-Freigabe bleibt kompatibel (Beleg entfaellt dann).
  signatureDataUrl?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // Ownership-Gate: Kunde-Session-SELECT ist RLS-gated auf die eigenen Claims.
  // Eine gelesene Row => Kunde besitzt den Claim. reparatur_freigegeben_am wird
  // fuer Idempotenz mitgelesen.
  const { data: claim } = await supabase
    .from('claims')
    .select('id, reparatur_freigegeben_am')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Kein Zugriff auf diesen Fall.' }

  // Bereits freigegeben => idempotent ok (kein erneutes UPDATE, kein Ueberschreiben
  // des urspruenglichen Freigabe-Zeitpunkts).
  if ((claim as { reparatur_freigegeben_am: string | null }).reparatur_freigegeben_am) {
    return { ok: true }
  }

  // UPDATE via Service-Client (kein Kunde-RLS-UPDATE auf claims). Ownership ist
  // oben verifiziert; die .eq('id', claimId) haelt das UPDATE auf genau den Claim.
  const svc = createServiceClient()

  // AV6: Reparaturauftrag-Unterschrift als fall_dokumente-Beleg ablegen (non-fatal) — vor der
  // Freigabe, damit der Beleg existiert wenn reparatur_freigegeben_am gesetzt wird.
  if (signatureDataUrl && signatureDataUrl.startsWith('data:image/')) {
    try {
      const semi = signatureDataUrl.indexOf(';')
      const comma = signatureDataUrl.indexOf(',')
      const mediaType = semi > 5 ? signatureDataUrl.slice(5, semi) : 'image/png'
      const b64 = comma >= 0 ? signatureDataUrl.slice(comma + 1) : ''
      if (b64) {
        const bytes = Buffer.from(b64, 'base64')
        const ext = mediaType === 'image/png' ? 'png' : mediaType.split('/')[1] ?? 'bin'
        const path = `claims/${claimId}/reparaturauftrag_freigabe_${Date.now()}.${ext}`
        const { error: upErr } = await svc.storage
          .from('fall-dokumente')
          .upload(path, bytes, { contentType: mediaType, upsert: false })
        if (!upErr) {
          const { data: bridge } = await svc
            .from('faelle_claim_bridge')
            .select('fall_id')
            .eq('claim_id', claimId)
            .maybeSingle()
          const fallId = (bridge as { fall_id: string } | null)?.fall_id ?? claimId
          await svc.from('fall_dokumente').insert({
            fall_id: fallId,
            claim_id: claimId,
            dokument_typ: 'reparaturauftrag',
            storage_path: path,
            original_filename: `Reparaturauftrag-Freigabe.${ext}`,
            mime_type: mediaType,
            groesse_bytes: bytes.byteLength,
            kategorie: 'unterschrift',
            quelle: 'kunde',
            hochgeladen_von_user_id: user.id,
            uploaded_by_kunde: true,
            sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
          } as never)
        }
      }
    } catch (e) {
      console.error('[genehmigeKvaPortal] Reparaturauftrag-Signatur (nicht kritisch):', e)
    }
  }

  const { error } = await svc
    .from('claims')
    .update({
      reparatur_freigegeben_am: new Date().toISOString(),
      reparatur_freigegeben_von: user.id,
    })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
