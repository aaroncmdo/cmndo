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
import { notifyWerkstattKundenreaktion } from '@/lib/werkstatt/notify-werkstatt-kundenreaktion'
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
          // Die unterschriebene Freigabe liegt hier bereits im Storage. Ohne diesen
          // Eintrag ist sie in keiner Akte auffindbar — das umschliessende try
          // faengt den Insert nicht.
          const { error: freigabeDokFehler } = await svc.from('fall_dokumente').insert({
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
          if (freigabeDokFehler) {
            console.error(`[genehmigeKvaPortal] Reparaturauftrag-Eintrag NICHT erstellt (Fall ${fallId}):`, freigabeDokFehler.message)
          }
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

// R1 (Repair-Audit): Kunde LEHNT den Werkstatt-KVA ab (mit Grund) statt sign-or-nothing.
// Setzt claims.kva_abgelehnt_am + kva_abgelehnt_grund + benachrichtigt die Werkstatt. Diese laedt
// dann einen revidierten KVA hoch, was kva_abgelehnt_am + reparatur_freigegeben_am wieder resettet
// (auftraege/actions.ts) — der Ablehn->Revidier-Loop schliesst sich. Un-stuckt den Kunden.
export async function lehneKvaAbPortal(
  claimId: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }
  const trimmed = (grund ?? '').trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // Ownership-Gate: Kunde-Session-SELECT ist RLS-gated auf die eigenen Claims (eine Row => Besitz).
  const { data: claim } = await supabase
    .from('claims')
    .select('id, kva_abgelehnt_am, reparatur_freigegeben_am, reparatur_werkstatt_id, werkstatt_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Kein Zugriff auf diesen Fall.' }
  const c = claim as {
    kva_abgelehnt_am: string | null
    reparatur_freigegeben_am: string | null
    reparatur_werkstatt_id: string | null
    werkstatt_id: string | null
  }

  // Bereits freigegeben => nicht mehr ablehnbar (der Loop ist durch).
  if (c.reparatur_freigegeben_am) return { ok: false, error: 'Der Reparaturauftrag ist bereits freigegeben.' }
  // Idempotent: schon abgelehnt => ok (kein Ueberschreiben des Zeitpunkts).
  if (c.kva_abgelehnt_am) return { ok: true }

  const svc = createServiceClient()
  const { error } = await svc
    .from('claims')
    .update({ kva_abgelehnt_am: new Date().toISOString(), kva_abgelehnt_grund: trimmed || null })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }

  // Werkstatt benachrichtigen (non-fatal — ein Notify-Fail darf die Ablehnung nicht kippen).
  const werkstattId = c.reparatur_werkstatt_id ?? c.werkstatt_id
  if (werkstattId) {
    try {
      await notifyWerkstattKundenreaktion({ werkstattId, ereignis: 'kva_abgelehnt', grund: trimmed || null, svc })
    } catch (e) {
      console.error('[lehneKvaAbPortal] Werkstatt-Notify (nicht kritisch):', e)
    }
  }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
