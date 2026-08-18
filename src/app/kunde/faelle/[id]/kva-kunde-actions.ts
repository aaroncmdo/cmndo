'use server'

// Spec E 1b (Kunde-Seite): der Kunde bringt SELBST den Preis-Anker ein ODER beauftragt direkt.
// Drei Wege, das Reparatur-Termin-Gate zu oeffnen (src/lib/werkstatt/auftrag-gate.ts):
//   A1) KVA hochladen (eigener Werkstatt-Voranschlag)          -> kva_quelle='kunde'
//   A2) Gutachten hochladen (Preis-Anker, v.a. Haftpflicht-fiktiv, Aaron 17.07.)
//                                                              -> kva_quelle='kunde', art='gutachten'
//   B)  ohne Preisdokument direkt beauftragen                  -> reparatur_auftrag_modus='direkt'
//
// Auth/Ownership (wie genehmigeKvaPortal): Kunde-Session-SELECT auf claims ist RLS-gated auf die
// eigenen Claims -> eine non-null Row IST der Ownership-Beweis. UPDATE via Service-Client (kein
// Kunde-RLS-UPDATE auf claims). KEINE Nicht-Async-Exports (AAR-664 / check:use-server-exports).

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * A: Der Kunde laedt seinen eigenen Preis-Anker hoch — KVA ODER Gutachten. Setzt
 * kva_quelle='kunde' + die Betraege auf claims.kostenvoranschlag_* -> das Termin-Gate
 * oeffnet (Preis kunde-seitig eingebracht, keine Werkstatt-KVA-Freigabe noetig). Ein
 * frueherer Freigabe-/Ablehnungs-Zustand wird genullt (frischer Kunden-Anker; eine spaetere
 * Werkstatt-Gegen-KVA kippt kva_quelle wieder auf 'werkstatt' -> Gate zu bis Freigabe).
 * PDF als fall_dokumente-Beleg (quelle='kunde', non-fatal).
 */
export async function ladeKundePreisdokument(
  claimId: string,
  input: {
    art: 'kva' | 'gutachten'
    pdfBase64: string
    pdfMediaType: string
    netto: number | null
    brutto: number | null
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }
  if (!input.pdfBase64 || !input.pdfMediaType) {
    return {
      ok: false,
      error: input.art === 'gutachten'
        ? 'Bitte laden Sie das Gutachten als PDF hoch.'
        : 'Bitte laden Sie den Kostenvoranschlag als PDF hoch.',
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // Ownership-Gate: Kunde-Session-SELECT ist RLS-gated auf die eigenen Claims.
  const { data: claim } = await supabase.from('claims').select('id').eq('id', claimId).maybeSingle()
  if (!claim) return { ok: false, error: 'Kein Zugriff auf diesen Fall.' }

  const svc = createServiceClient()

  // Betraege + Quelle -> Gate offen (kva_quelle='kunde'). Frischer Anker: Freigabe/Ablehnung nullen.
  const { error: updErr } = await svc
    .from('claims')
    .update({
      kostenvoranschlag_netto: input.netto,
      kostenvoranschlag_brutto: input.brutto,
      kva_quelle: 'kunde',
      reparatur_freigegeben_am: null,
      kva_abgelehnt_am: null,
    } as never)
    .eq('id', claimId)
  if (updErr) return { ok: false, error: updErr.message }

  // PDF-Beleg (non-fatal) — quelle='kunde', Dateiname nach art. Muster wie erstelleKvaFuerAuftrag.
  try {
    const ext = input.pdfMediaType === 'application/pdf' ? 'pdf' : (input.pdfMediaType.split('/')[1] ?? 'bin')
    const bytes = Buffer.from(input.pdfBase64, 'base64')
    const dateiName = `${input.art === 'gutachten' ? 'gutachten' : 'kostenvoranschlag'}_kunde_${Date.now()}.${ext}`
    const storagePath = `faelle/${claimId}/${dateiName}`
    const { error: upErr } = await svc.storage
      .from('fall-dokumente')
      .upload(storagePath, bytes, { contentType: input.pdfMediaType, upsert: false })
    if (!upErr) {
      const { data: bridge } = await svc
        .from('faelle_claim_bridge')
        .select('fall_id')
        .eq('claim_id', claimId)
        .maybeSingle()
      const fallId = (bridge as { fall_id: string } | null)?.fall_id ?? claimId
      // Das PDF liegt bereits im Storage; ohne diesen Eintrag taucht es in keiner
      // Akte auf. Das umschliessende try faengt den Insert nicht.
      const { error: kvaDokFehler } = await svc.from('fall_dokumente').insert({
        fall_id: fallId,
        claim_id: claimId,
        dokument_typ: 'kostenvoranschlag',
        storage_path: storagePath,
        original_filename: dateiName,
        mime_type: input.pdfMediaType,
        groesse_bytes: bytes.byteLength,
        kategorie: 'kostenvoranschlag',
        quelle: 'kunde',
        sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde', 'werkstatt'],
      } as never)
      if (kvaDokFehler) {
        console.error(`[ladeKundePreisdokument] KVA-Beleg NICHT erstellt (Fall ${fallId}):`, kvaDokFehler.message)
      }
    }
  } catch (err) {
    console.error('[ladeKundePreisdokument] PDF-Beleg (non-fatal):', (err as Error).message)
  }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}

/**
 * B: Der Kunde beauftragt die Reparatur OHNE Preisdokument direkt (Bagatell/Express/bewusste
 * Zustimmung ohne Voranschlag). Setzt reparatur_auftrag_modus='direkt' + Beleg (gesetzt_von/_am
 * fuer den Streitfall). Gate oeffnet sofort. Die UI zeigt vorher den Kosten-Hinweis.
 */
export async function beauftrageOhneKva(
  claimId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const { data: claim } = await supabase.from('claims').select('id').eq('id', claimId).maybeSingle()
  if (!claim) return { ok: false, error: 'Kein Zugriff auf diesen Fall.' }

  const svc = createServiceClient()
  const { error: updErr } = await svc
    .from('claims')
    .update({
      reparatur_auftrag_modus: 'direkt',
      reparatur_auftrag_modus_gesetzt_von: user.id,
      reparatur_auftrag_modus_gesetzt_am: new Date().toISOString(),
    } as never)
    .eq('id', claimId)
  if (updErr) return { ok: false, error: updErr.message }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}

/**
 * Der Kunde LEHNT den Werkstatt-Kostenvoranschlag ab (setzt kva_abgelehnt_am + Grund) → das
 * Termin-Gate bleibt/wird zu (grund='abgelehnt'), die Werkstatt muss einen neuen KVA einreichen
 * (erstelleKvaFuerAuftrag kippt kva_quelle→'werkstatt' + nullt abgelehnt/freigegeben). Eine evtl.
 * frühere Freigabe wird zurückgenommen (Ablehnung gewinnt). Komplettiert die Gate-State-Machine —
 * ohne diese Action ist der 'abgelehnt'-Zustand unerreichbar.
 */
export async function lehneKvaAb(
  claimId: string,
  grund?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const { data: claim } = await supabase.from('claims').select('id').eq('id', claimId).maybeSingle()
  if (!claim) return { ok: false, error: 'Kein Zugriff auf diesen Fall.' }

  const svc = createServiceClient()
  const { error: updErr } = await svc
    .from('claims')
    .update({
      kva_abgelehnt_am: new Date().toISOString(),
      kva_abgelehnt_grund: grund?.trim() || null,
      reparatur_freigegeben_am: null,
    } as never)
    .eq('id', claimId)
  if (updErr) return { ok: false, error: updErr.message }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
