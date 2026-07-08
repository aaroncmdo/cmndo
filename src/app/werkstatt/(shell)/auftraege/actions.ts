'use server'

// SP2 Task 5 — Werkstatt-Reparaturtermin-Aktionen.
// Drei Status-Uebergaenge fuer die Werkstatt-Session: bestaetigen / Rueckruf erbitten /
// ablehnen. Alle nutzen den auth-aware createClient() — RLS-Gate (is_werkstatt_for_claim)
// auf reparatur_termine.UPDATE schlaegt automatisch an. Kein Admin-Client fuer den
// Status-Wechsel noetig.
//
// Kunde-Benachrichtigung (Email, non-fatal) liest claim_id via service-role-Client —
// der auth-aware Client kann claims ohne werkstatt-RLS-Policy nicht lesen.
//
// SP3 Task 2 — oeffneGutachtenPdf: signed URL fuer das Gutachten-PDF.
// Access-Gate: v_werkstatt_auftrag (RLS: is_werkstatt_for_claim). Danach
// Service-Client-Read des bericht_pdf_url + signed-URL-Generierung via Storage-Helper.

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getWerkstattAuftrag } from '@/lib/werkstatt/queries'
import { extrahiereKvaAusBase64 } from '@/lib/ai/kostenvoranschlag-ocr'
import { notifyKundeReparaturtermin } from '@/lib/werkstatt/notify-kunde-reparaturtermin'
import { getStorageUrl, STORAGE_TTL } from '@/lib/storage/url'

// ─────────────────────────────────────────────────────────────────────────────
// bestaetigeReparaturtermin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Werkstatt bestaetigt den Reparaturtermin und setzt (optional) einen festen
 * Terminzeitpunkt. RLS-Gate laeuft auf der auth-aware Session.
 *
 * @param terminId   UUID der reparatur_termine-Row.
 * @param bestaetigterTermin  ISO-String fuer den bestaetigen Termin (optional;
 *                            wenn leer → bestaetigter_termin bleibt null).
 */
export async function bestaetigeReparaturtermin(
  terminId: string,
  bestaetigterTermin?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])

  const supabase = await createClient()

  const update: Record<string, unknown> = {
    status: 'bestaetigt',
    updated_at: new Date().toISOString(),
  }
  if (bestaetigterTermin?.trim()) {
    update.bestaetigter_termin = bestaetigterTermin.trim()
  }

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update(update as never)
    .eq('id', terminId)
    .select('claim_id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  revalidatePath('/werkstatt/auftraege')

  // Kunden-Benachrichtigung (non-fatal)
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({
      claimId: (data as unknown as { claim_id: string }).claim_id,
      ereignis: 'bestaetigt',
      bestaetigterTermin: bestaetigterTermin ?? null,
      svc,
    })
  } catch (err) {
    console.warn('[SP2 T5] Kunden-Notify bestaetigt fehlgeschlagen (non-fatal):', err)
  }

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// erbitteRueckruf
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Werkstatt signalisiert, dass sie den Kunden anrufen wird — Status → anruf_erbeten.
 */
export async function erbitteRueckruf(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update({ status: 'anruf_erbeten', updated_at: new Date().toISOString() } as never)
    .eq('id', terminId)
    .select('claim_id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  revalidatePath('/werkstatt/auftraege')

  // Kunden-Benachrichtigung (non-fatal)
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({
      claimId: (data as unknown as { claim_id: string }).claim_id,
      ereignis: 'anruf_erbeten',
      bestaetigterTermin: null,
      svc,
    })
  } catch (err) {
    console.warn('[SP2 T5] Kunden-Notify anruf_erbeten fehlgeschlagen (non-fatal):', err)
  }

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// lehneReparaturterminAb
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Werkstatt lehnt den Wunschtermin ab (optionaler Absagegrund).
 */
export async function lehneReparaturterminAb(
  terminId: string,
  absageGrund?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])

  const supabase = await createClient()

  const update: Record<string, unknown> = {
    status: 'abgelehnt',
    updated_at: new Date().toISOString(),
  }
  if (absageGrund?.trim()) {
    update.absage_grund = absageGrund.trim()
  }

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update(update as never)
    .eq('id', terminId)
    .select('claim_id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  revalidatePath('/werkstatt/auftraege')

  // Kunden-Benachrichtigung (non-fatal)
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({
      claimId: (data as unknown as { claim_id: string }).claim_id,
      ereignis: 'abgelehnt',
      bestaetigterTermin: null,
      svc,
    })
  } catch (err) {
    console.warn('[SP2 T5] Kunden-Notify abgelehnt fehlgeschlagen (non-fatal):', err)
  }

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// oeffneGutachtenPdf
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SP3 Task 2 — Liefert eine signed URL fuer das Gutachten-PDF.
 *
 * Ablauf:
 * 1. Access-Gate: v_werkstatt_auftrag lesen (RLS-Gate is_werkstatt_for_claim).
 *    Keine Zeile → kein Zugriff.
 * 2. gutachten.bericht_pdf_url via Service-Client lesen (gutachten hat keine
 *    Werkstatt-RLS; Access ist ueber Schritt 1 verifiziert).
 * 3. Ist bericht_pdf_url bereits eine volle URL: direkt zurueckgeben.
 *    Sonst: signed URL via getStorageUrl (Bucket 'gutachten', TTL download 5min).
 *
 * @param claimId  UUID des Claims (= primary key in v_werkstatt_auftrag).
 */
export async function oeffneGutachtenPdf(
  claimId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!claimId) return { ok: false, error: 'Kein Auftrag.' }

  const supabase = await createClient()

  // Schritt 1: Access-Gate (RLS: is_werkstatt_for_claim)
  const { data: auftrag } = await supabase
    .from('v_werkstatt_auftrag')
    .select('claim_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Kein Zugriff auf diesen Auftrag.' }

  // Schritt 2: bericht_pdf_url via Service-Client (gutachten hat keine Werkstatt-RLS)
  const svc = createServiceClient()
  const { data: g } = await svc
    .from('gutachten')
    .select('bericht_pdf_url')
    .eq('claim_id', claimId)
    .not('bericht_pdf_url', 'is', null)
    .order('fertiggestellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  const pfad = (g as { bericht_pdf_url: string | null } | null)?.bericht_pdf_url ?? null
  if (!pfad) return { ok: false, error: 'Kein Gutachten verfügbar.' }

  // Schritt 3: Signed URL — volle URL direkt zurueckgeben, Pfad via Storage-Helper
  if (pfad.startsWith('http://') || pfad.startsWith('https://')) {
    return { ok: true, url: pfad }
  }

  const url = await getStorageUrl(svc, 'gutachten', pfad, {
    ttl: STORAGE_TTL.download,
    download: true,
  })
  if (!url) return { ok: false, error: 'Signed-URL konnte nicht erstellt werden.' }

  return { ok: true, url }
}

// ─────────────────────────────────────────────────────────────────────────────
// KVA aus dem Auftrag erstellen (Inkrement 2 — WRITE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OCR-Prefill fuer den Auftrags-KVA-Dialog: liest netto/brutto aus dem
 * hochgeladenen KVA-Dokument. Reuse des KVA-OCR-Cores (extrahiereKvaAusBase64) —
 * Fahrzeug-/Halterdaten liegen bereits am Claim, hier interessieren nur die Betraege.
 */
export async function extrahiereKvaFuerAuftragOcr(
  input: { base64: string; mediaType: string },
): Promise<{ ok: true; netto: number | null; brutto: number | null } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!input?.base64) return { ok: false, error: 'Kein Dokument' }
  const res = await extrahiereKvaAusBase64(input)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, netto: res.data.kostenvoranschlag_netto, brutto: res.data.kostenvoranschlag_brutto }
}

/**
 * Werkstatt stellt den Kostenvoranschlag direkt aus dem Auftrag aus: schreibt
 * claims.kostenvoranschlag_netto/brutto auf den BESTEHENDEN Claim (+ optional das
 * KVA-PDF in den Storage). Flippt den Auftrag benoetigt -> erstellt.
 *
 * Ownership-Gate (Pflicht): getWerkstattAuftrag liest ueber die RLS-gegatete
 * v_werkstatt_auftrag-View — kein Treffer => diese Werkstatt gehoert nicht zu dem
 * Claim => Abbruch. Der eigentliche Write laeuft danach ueber den Admin-Client
 * (claims hat keine Werkstatt-RLS-Policy fuer UPDATE), aber NUR nach bestandener
 * Ownership-Pruefung.
 */
export async function erstelleKvaFuerAuftrag(
  claimId: string,
  input: { netto: number | null; brutto: number | null; pdfBase64?: string | null; pdfMediaType?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!claimId) return { ok: false, error: 'Kein Auftrag.' }
  if (input.netto == null && input.brutto == null) {
    return { ok: false, error: 'Bitte mindestens einen Betrag (netto oder brutto) angeben.' }
  }

  // Ownership: RLS-gegatete View — Werkstatt sieht nur ihre eigenen Claims.
  const auftrag = await getWerkstattAuftrag(claimId)
  if (!auftrag) return { ok: false, error: 'Kein Zugriff auf diesen Auftrag' }

  // Write via Admin-Client (claims hat keine Werkstatt-UPDATE-RLS-Policy).
  const admin = createAdminClient()
  const { error } = await admin
    .from('claims')
    .update({
      kostenvoranschlag_netto: input.netto,
      kostenvoranschlag_brutto: input.brutto,
    } as never)
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }

  // KVA-PDF an den Claim haengen (non-critical) + fall_dokumente-Row (WS4b:
  // EIN KVA-Dokument, zwei Upload-Quellen — Werkstatt via Modal, Kunde via Claim).
  // Der Kunde sieht das Dokument in seiner Fallakte (sichtbar_fuer inkl. 'kunde').
  try {
    if (input.pdfBase64 && input.pdfMediaType) {
      const ext = input.pdfMediaType === 'application/pdf' ? 'pdf' : (input.pdfMediaType.split('/')[1] ?? 'bin')
      const bytes = Buffer.from(input.pdfBase64, 'base64')
      const path = `faelle/${claimId}/kostenvoranschlag_${Date.now()}.${ext}`
      const { error: uploadErr } = await admin.storage
        .from('fall-dokumente')
        .upload(path, bytes, {
          contentType: input.pdfMediaType,
          upsert: false,
        })
      if (uploadErr) {
        console.error('[werkstatt-auftrag-kva] KVA-Storage-Upload fehlgeschlagen (nicht kritisch):', uploadErr.message)
      } else {
        // fall_id via Bridge — fall_dokumente.fall_id ist NOT NULL, claim_id wird
        // per Trigger aus fall_id abgeleitet (setzen wir zusaetzlich explizit).
        const { data: bridge } = await admin
          .from('faelle_claim_bridge')
          .select('fall_id')
          .eq('claim_id', claimId)
          .maybeSingle()
        const fallId = (bridge as { fall_id: string } | null)?.fall_id ?? null
        if (fallId) {
          const { error: docErr } = await admin.from('fall_dokumente').insert({
            fall_id: fallId,
            claim_id: claimId,
            dokument_typ: 'kostenvoranschlag',
            storage_path: path,
            original_filename: `Kostenvoranschlag.${ext}`,
            mime_type: input.pdfMediaType,
            groesse_bytes: bytes.byteLength,
            kategorie: 'kostenvoranschlag',
            quelle: 'werkstatt',
            sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
          } as never)
          if (docErr) {
            console.error('[werkstatt-auftrag-kva] fall_dokumente-Insert fehlgeschlagen (nicht kritisch):', docErr.message)
          }
        } else {
          console.error('[werkstatt-auftrag-kva] Keine fall_id fuer claim', claimId, '— fall_dokumente-Row uebersprungen.')
        }
      }
    }
  } catch (e) {
    console.error('[werkstatt-auftrag-kva] KVA-Doc-Upload fehlgeschlagen (nicht kritisch):', e)
  }

  revalidatePath(`/werkstatt/auftraege/${claimId}`)
  revalidatePath('/werkstatt/auftraege')
  return { ok: true }
}
