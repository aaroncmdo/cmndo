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
//
// SP Task 7 — schlageWerkstattTerminVor: Werkstatt schlaegt (entkoppelt vom KVA-Upload)
// einen Reparaturtermin vor (status='werkstatt_vorschlag'). Gemeinsamer modul-lokaler
// Helper upsertWerkstattVorschlag wird von schlageWerkstattTerminVor UND erstelleKvaFuerAuftrag
// genutzt — keine Duplizierung der Write-Logik.

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getWerkstattAuftrag } from '@/lib/werkstatt/queries'
import { reparaturGate, gateGrundLabel } from '@/lib/werkstatt/auftrag-gate'
import { extrahiereKvaAusBase64 } from '@/lib/ai/kostenvoranschlag-ocr'
import { notifyKundeReparaturtermin } from '@/lib/werkstatt/notify-kunde-reparaturtermin'
import { getStorageUrl, STORAGE_TTL } from '@/lib/storage/url'
import { resolveWunschterminIso } from '@/app/flow/[token]/wunschtermin'
import { advanceReparaturCursorTo, fallIdForClaim } from '@/lib/faelle/reparatur-cursor'

// ─────────────────────────────────────────────────────────────────────────────
// upsertWerkstattVorschlag (modul-lokal, NICHT exportiert)
// ─────────────────────────────────────────────────────────────────────────────

// Legt einen Werkstatt-Terminvorschlag an oder hebt einen bestehenden aktiven Termin
// darauf. status='werkstatt_vorschlag' -> der Kunde muss bestaetigen (bzw. reagiert).
// Admin-Client, weil die Werkstatt in reparatur_termine nur UPDATE (RLS) darf, aber ggf.
// INSERT noetig ist (kein aktiver Termin). Ownership ist VOR dem Aufruf via
// getWerkstattAuftrag geprueft.
async function upsertWerkstattVorschlag(
  admin: ReturnType<typeof createAdminClient>,
  claimId: string,
  werkstattId: string,
  terminUtc: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: aktiv } = await admin
    .from('reparatur_termine')
    .select('id')
    .eq('claim_id', claimId)
    .in('status', ['angefragt', 'werkstatt_vorschlag', 'anruf_erbeten'])
    .order('created_at', { ascending: false })
    .limit(1)
  const bestehend = (aktiv as { id: string }[] | null)?.[0]?.id ?? null

  if (bestehend) {
    const { error } = await admin
      .from('reparatur_termine')
      .update({ status: 'werkstatt_vorschlag', bestaetigter_termin: terminUtc, updated_at: new Date().toISOString() } as never)
      .eq('id', bestehend)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  const { error } = await admin.from('reparatur_termine').insert({
    claim_id: claimId,
    werkstatt_id: werkstattId,
    // kein Kunde-Wunsch -> wunschtermin auf den Werkstatt-Termin setzen (NOT NULL-Spalte),
    // bestaetigter_termin traegt den Vorschlag.
    wunschtermin: terminUtc,
    bestaetigter_termin: terminUtc,
    status: 'werkstatt_vorschlag',
  } as never)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// schlageWerkstattTerminVor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Werkstatt schlaegt (jederzeit, entkoppelt vom KVA) einen Reparaturtermin vor.
 * Weicht er vom Kunde-Wunsch ab bzw. gibt es keinen Wunsch -> status='werkstatt_vorschlag',
 * der Kunde bestaetigt ("Passt") oder reagiert ("Passt nicht").
 * @param terminLokal Berlin-Wandzeit "YYYY-MM-DDTHH:mm" (WunschterminPicker).
 */
export async function schlageWerkstattTerminVor(
  claimId: string,
  terminLokal: string,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!claimId || !terminLokal) return { ok: false, error: 'Auftrag und Termin sind erforderlich.' }

  // Ownership-Gate via RLS-View (Werkstatt sieht nur ihre eigenen Auftraege).
  const auftrag = await getWerkstattAuftrag(claimId)
  if (!auftrag) return { ok: false, error: 'Kein Zugriff auf diesen Auftrag.' }
  const werkstattId = auftrag.reparatur_werkstatt_id
  if (!werkstattId) return { ok: false, error: 'Keine Reparatur-Werkstatt gesetzt.' }

  const utc = resolveWunschterminIso(terminLokal)
  if (!utc) return { ok: false, error: 'Ungültiger Termin.' }

  const admin = createAdminClient()

  // Spec E 1a: Termin-Gate. Im kva_erst-Modus ohne kunde-seitigen KVA/Freigabe darf noch nicht
  // terminiert werden (Kostenschutz). direkt / Kunde- oder Zubringer-KVA / freigegebener
  // Werkstatt-KVA = offen. Ownership ist oben via RLS-View bereits bewiesen.
  const { data: gateRow } = await admin
    .from('claims')
    .select('reparatur_auftrag_modus, kva_quelle, reparatur_freigegeben_am, kva_abgelehnt_am')
    .eq('id', claimId)
    .maybeSingle()
  const gate = reparaturGate({
    reparatur_auftrag_modus: (gateRow?.reparatur_auftrag_modus as string | null) ?? null,
    kva_quelle: (gateRow?.kva_quelle as string | null) ?? null,
    reparatur_freigegeben_am: (gateRow?.reparatur_freigegeben_am as string | null) ?? null,
    kva_abgelehnt_am: (gateRow?.kva_abgelehnt_am as string | null) ?? null,
    // Ops-Test 11.08. (RC-9): kommt aus v_werkstatt_auftrag (derive_abrechnungsweg) und ist
    // hier schon geladen — bei Haftpflicht ist das Gutachten die Kostengrundlage, nicht der KVA.
    abrechnungsweg: auftrag.abrechnungsweg,
  })
  if (!gate.offen) {
    return {
      ok: false,
      error: gateGrundLabel(gate.grund) ?? 'Der Reparaturauftrag ist noch nicht zur Terminfindung freigegeben.',
    }
  }

  const res = await upsertWerkstattVorschlag(admin, claimId, werkstattId, utc)
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath(`/werkstatt/auftraege/${claimId}`)
  revalidatePath('/werkstatt/auftraege')

  // Kunde informieren (non-fatal) — bitte um Bestaetigung.
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({ claimId, ereignis: 'werkstatt_vorschlag', bestaetigterTermin: utc, svc })
  } catch (err) {
    console.warn('[schlageWerkstattTerminVor] Kunden-Notify (non-fatal):', err)
  }
  return { ok: true }
}

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

  // Reparatur-Cursor: Werkstatt bestaetigt den Termin -> reparatur-laeuft (reduced-repair, non-fatal,
  // forward-only, abrechnungsweg-gegated im Helper). Gegenstueck zum Kunde-akzeptiereWerkstattTermin
  // (#4567): so zieht der Cursor auch bei werkstatt-seitiger Bestaetigung mit, nicht erst beim Abschluss-Walk.
  const cursorFallId = await fallIdForClaim((data as unknown as { claim_id: string }).claim_id)
  if (cursorFallId) {
    await advanceReparaturCursorTo(cursorFallId, 'reparatur-laeuft', { grund: 'reparaturtermin_bestaetigt' })
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
 * Werkstatt laedt ihren Kostenvoranschlag HOCH (kein Erstellen aus dem Nichts):
 * legt das PDF im Storage ab, schreibt die (per OCR gelesenen) Betraege
 * claims.kostenvoranschlag_netto/brutto auf den BESTEHENDEN Claim und haengt eine
 * fall_dokumente-Zeile fuer den Kunden an. Flippt den Auftrag benoetigt -> erstellt.
 *
 * Das PDF ist PFLICHT — ohne pdfBase64/pdfMediaType kein Speichern (die Betraege
 * sind eine OCR-Ableitung des Dokuments, kein Frei-Autoren-Wert; sie duerfen fehlen,
 * das Dokument nicht).
 *
 * Ownership-Gate (Pflicht): getWerkstattAuftrag liest ueber die RLS-gegatete
 * v_werkstatt_auftrag-View — kein Treffer => diese Werkstatt gehoert nicht zu dem
 * Claim => Abbruch. Der eigentliche Write laeuft danach ueber den Admin-Client
 * (claims hat keine Werkstatt-RLS-Policy fuer UPDATE), aber NUR nach bestandener
 * Ownership-Pruefung.
 */
export async function erstelleKvaFuerAuftrag(
  claimId: string,
  input: {
    netto: number | null
    brutto: number | null
    pdfBase64?: string | null
    pdfMediaType?: string | null
    // AV5: die Werkstatt schlaegt beim KVA-Upload einen Reparaturtermin (Berlin-Wandzeit) +
    // die geschaetzte Reparaturdauer (Tage) mit vor. Beide optional (Modal macht den Termin
    // zur Pflicht; die Action bleibt tolerant).
    reparaturWunschterminLokal?: string | null
    reparaturdauerTage?: number | null
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!claimId) return { ok: false, error: 'Kein Auftrag.' }
  if (!input.pdfBase64 || !input.pdfMediaType) {
    return { ok: false, error: 'Bitte laden Sie den Kostenvoranschlag als PDF hoch.' }
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
      // Spec E 1a: Werkstatt-KVA → Quelle=werkstatt; ein (Gegen-)KVA nullt eine frühere
      // Freigabe/Ablehnung → das Gate schliesst auf 'wartet_freigabe' bis zur Kundenfreigabe.
      kva_quelle: 'werkstatt',
      reparatur_freigegeben_am: null,
      kva_abgelehnt_am: null,
      // AV5: geschaetzte Reparaturdauer (Tage) aus dem KVA-Upload.
      ...(input.reparaturdauerTage != null ? { reparaturdauer_tage_kva: input.reparaturdauerTage } : {}),
    } as never)
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }

  // KVA-PDF an den Claim haengen (non-critical) + fuer den Kunden sichtbar machen.
  try {
    const ext = input.pdfMediaType === 'application/pdf' ? 'pdf' : (input.pdfMediaType.split('/')[1] ?? 'bin')
    const bytes = Buffer.from(input.pdfBase64, 'base64')
    const dateiName = `kostenvoranschlag_${Date.now()}.${ext}`
    const storagePath = `faelle/${claimId}/${dateiName}`

    const { error: uploadErr } = await admin.storage
      .from('fall-dokumente')
      .upload(storagePath, bytes, {
        contentType: input.pdfMediaType,
        upsert: false,
      })
    if (uploadErr) throw uploadErr

    // fall_dokumente-Zeile, damit der Kunde das PDF im Dokumente-Tab sieht. Die
    // Kunde-Sicht liest fall_dokumente ueber fall_id (claim_id -> fall_id via
    // faelle_claim_bridge); claim_id wird ausserdem per DB-Trigger aus fall_id
    // abgeleitet, wir setzen ihn hier direkt (NOT NULL). fall_id via Reverse-Bridge,
    // Fallback claimId (in den Daten identisch; matcht die Kunde-Seite).
    const { data: bridge } = await admin
      .from('faelle_claim_bridge')
      .select('fall_id')
      .eq('claim_id', claimId)
      .maybeSingle()
    const fallId = (bridge as { fall_id: string } | null)?.fall_id ?? claimId

    const { error: docErr } = await admin.from('fall_dokumente').insert({
      fall_id: fallId,
      claim_id: claimId,
      dokument_typ: 'kostenvoranschlag',
      storage_path: storagePath,
      original_filename: dateiName,
      mime_type: input.pdfMediaType,
      groesse_bytes: bytes.byteLength,
      kategorie: 'kostenvoranschlag',
      quelle: 'werkstatt',
      sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
    } as never)
    if (docErr) throw docErr
  } catch (e) {
    console.error('[werkstatt-auftrag-kva] KVA-Doc-Upload/-Zeile fehlgeschlagen (nicht kritisch):', e)
  }

  // Die Werkstatt schlaegt beim KVA-Upload einen Reparaturtermin vor (non-fatal).
  // Neu: als werkstatt_vorschlag (der Kunde bestaetigt), nicht mehr als Kunde-Wunsch 'angefragt'.
  if (input.reparaturWunschterminLokal) {
    try {
      const utc = resolveWunschterminIso(input.reparaturWunschterminLokal)
      const werkstattId = auftrag.reparatur_werkstatt_id
      if (utc && werkstattId) {
        const res = await upsertWerkstattVorschlag(admin, claimId, werkstattId, utc)
        if (res.ok) {
          const svc = createServiceClient()
          await notifyKundeReparaturtermin({ claimId, ereignis: 'werkstatt_vorschlag', bestaetigterTermin: utc, svc })
        }
      }
    } catch (e) {
      console.error('[werkstatt-auftrag-kva] Reparaturtermin-Vorschlag (nicht kritisch):', e)
    }
  }

  revalidatePath(`/werkstatt/auftraege/${claimId}`)
  revalidatePath('/werkstatt/auftraege')
  return { ok: true }
}
