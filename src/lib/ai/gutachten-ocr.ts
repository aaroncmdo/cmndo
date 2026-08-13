// Gutachten-OCR-Pipeline. Wird seit Filmcheck-Inkrement 2c fire-and-forget in
// gutachtenAbgeben (lib/auftrag/qc.ts) gestartet — VOR der QC, nicht mehr nach
// QC-Freigabe (gibKanzleipaketFrei) — und extrahiert die wesentlichen Werte aus
// dem Gutachten-PDF — schreibt sie als claim-SSoT auf die claims-Zeile.
//
// Robustheit (Filmcheck-Haertung 2026-07-02): Das PDF wird als base64 im
// Request mitgesendet (Bytes selbst aus dem Storage geladen), nicht per
// source:{type:'url'} an Anthropic delegiert. Grund: sobald STORAGE_USE_SIGNED_URLS
// aktiv ist, ist auftraege.gutachten_url eine signed-URL mit 1h-TTL — die waere
// zum spaeteren OCR-Zeitpunkt evtl. abgelaufen. base64 ist TTL- und
// Fetchbarkeit-unabhaengig. URL-Pfad bleibt als Fallback (Lookup/Download-Fail
// oder >~28 MB Anthropic-base64-Limit).
//
// Erweiterte Auslese (CMM-32 Walkthrough): 9 Kernfelder + 5 Cluster
// (A Fahrzeug, B Vorschaeden, C Reparatur, D Mietwagen, E SV-Meta).
// Manuelle Admin-Korrekturen sind respektiert: ist
// gutachten_ocr_manuell_ueberschrieben=true, wird beim Re-Run nur
// NULL-Felder gefuellt — bestehende Werte bleiben.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from './models'

type GutachtenOcrResult = {
  // Kern (legacy)
  reparaturkosten_netto?: number | null
  reparaturkosten_brutto?: number | null
  minderwert?: number | null
  restwert?: number | null
  wiederbeschaffungswert?: number | null
  wiederbeschaffungsdauer_tage?: number | null
  nutzungsausfall_tage?: number | null
  totalschaden?: boolean | null
  gutachten_datum?: string | null
  // A — Fahrzeug
  fin?: string | null
  kennzeichen?: string | null
  erstzulassung?: string | null
  laufleistung_km?: number | null
  tuv_bis?: string | null
  fahrzeug_typ?: string | null
  farbe?: string | null
  farbcode?: string | null
  kraftstoff?: 'benzin' | 'diesel' | 'hybrid' | 'elektro' | 'gas' | 'sonstiges' | null
  // B — Vorschaeden
  vorschaeden_text?: string | null
  lackmesswert_max_my?: number | null
  karosseriezustand?: 'makellos' | 'gebrauchsspuren' | 'unfallbeschaedigt' | 'sonstiges' | null
  // C — Reparatur
  zeit_ak_std?: number | null
  zeit_kar_std?: number | null
  zeit_lack_std?: number | null
  lohnsatz_ak_eur?: number | null
  lohnsatz_kar_eur?: number | null
  lohnsatz_lack_eur?: number | null
  materialkosten_eur?: number | null
  lackmaterial_eur?: number | null
  verbringung_eur?: number | null
  // D — Mietwagen
  mietwagen_klasse?: string | null
  mietwagen_tagessatz_eur?: number | null
  nutzungsausfall_tagessatz_eur?: number | null
  // E — SV-Meta
  sv_honorar_netto?: number | null
  sv_honorar_brutto?: number | null
  kalkulationssystem?: 'audatex' | 'dat' | 'autoixpert' | 'sonstiges' | null
  seitenzahl?: number | null
}

// Structured-outputs-Schema (spiegelt GutachtenOcrResult). Opus 4.8 fuellt es via
// messages.parse() -> erzwingt valides JSON statt fragilem raw.match(/{...}/).
const GutachtenSchema = z.object({
  reparaturkosten_netto: z.number().nullable(),
  reparaturkosten_brutto: z.number().nullable(),
  minderwert: z.number().nullable(),
  restwert: z.number().nullable(),
  wiederbeschaffungswert: z.number().nullable(),
  wiederbeschaffungsdauer_tage: z.number().nullable(),
  nutzungsausfall_tage: z.number().nullable(),
  totalschaden: z.boolean().nullable(),
  gutachten_datum: z.string().nullable(),
  fin: z.string().nullable(),
  kennzeichen: z.string().nullable(),
  erstzulassung: z.string().nullable(),
  laufleistung_km: z.number().nullable(),
  tuv_bis: z.string().nullable(),
  fahrzeug_typ: z.string().nullable(),
  farbe: z.string().nullable(),
  farbcode: z.string().nullable(),
  kraftstoff: z.enum(['benzin', 'diesel', 'hybrid', 'elektro', 'gas', 'sonstiges']).nullable(),
  vorschaeden_text: z.string().nullable(),
  lackmesswert_max_my: z.number().nullable(),
  karosseriezustand: z.enum(['makellos', 'gebrauchsspuren', 'unfallbeschaedigt', 'sonstiges']).nullable(),
  zeit_ak_std: z.number().nullable(),
  zeit_kar_std: z.number().nullable(),
  zeit_lack_std: z.number().nullable(),
  lohnsatz_ak_eur: z.number().nullable(),
  lohnsatz_kar_eur: z.number().nullable(),
  lohnsatz_lack_eur: z.number().nullable(),
  materialkosten_eur: z.number().nullable(),
  lackmaterial_eur: z.number().nullable(),
  verbringung_eur: z.number().nullable(),
  mietwagen_klasse: z.string().nullable(),
  mietwagen_tagessatz_eur: z.number().nullable(),
  nutzungsausfall_tagessatz_eur: z.number().nullable(),
  sv_honorar_netto: z.number().nullable(),
  sv_honorar_brutto: z.number().nullable(),
  kalkulationssystem: z.enum(['audatex', 'dat', 'autoixpert', 'sonstiges']).nullable(),
  seitenzahl: z.number().nullable(),
})

const SYSTEM_PROMPT =
  'Du bist ein OCR-Assistent fuer deutsche Kfz-Gutachten. Deine Aufgabe: aus dem ' +
  'angehaengten Gutachten-PDF die folgenden Felder extrahieren und ausschliesslich ' +
  'als JSON zurueckgeben (keine Erklaerungen, kein Markdown). Wert nicht im Dokument ' +
  '→ null. Betraege: Komma als Dezimaltrenner wegnormalisieren ("3.245,67 €" → 3245.67). ' +
  'Datumswerte als ISO YYYY-MM-DD. Strings nur den eigentlichen Inhalt (ohne Label-Praefix).\n\n' +
  '{\n' +
  '  "reparaturkosten_netto": number|null,\n' +
  '  "reparaturkosten_brutto": number|null,\n' +
  '  "minderwert": number|null,\n' +
  '  "restwert": number|null,\n' +
  '  "wiederbeschaffungswert": number|null,\n' +
  '  "wiederbeschaffungsdauer_tage": number|null,\n' +
  '  "nutzungsausfall_tage": number|null,\n' +
  '  "totalschaden": boolean|null,\n' +
  '  "gutachten_datum": "YYYY-MM-DD"|null,\n' +
  '  "fin": string|null (17-stellige Fahrzeug-Identifikationsnummer),\n' +
  '  "kennzeichen": string|null (Format z.B. "B-AB 1234"),\n' +
  '  "erstzulassung": "YYYY-MM-DD"|null,\n' +
  '  "laufleistung_km": number|null,\n' +
  '  "tuv_bis": "YYYY-MM-DD"|null (HU-/AU-Datum),\n' +
  '  "fahrzeug_typ": string|null (Hersteller + Modell + Variante, z.B. "BMW 320d xDrive"),\n' +
  '  "farbe": string|null (z.B. "schwarz metallic"),\n' +
  '  "farbcode": string|null (Lackcode, z.B. "475"),\n' +
  '  "kraftstoff": "benzin"|"diesel"|"hybrid"|"elektro"|"gas"|"sonstiges"|null,\n' +
  '  "vorschaeden_text": string|null (Beschreibung dokumentierter Vorschaeden, kompakt),\n' +
  '  "lackmesswert_max_my": number|null (max gemessener Lackdicke-Wert in Mikrometern),\n' +
  '  "karosseriezustand": "makellos"|"gebrauchsspuren"|"unfallbeschaedigt"|"sonstiges"|null,\n' +
  '  "zeit_ak_std": number|null (Arbeitszeit Mechanik in Stunden),\n' +
  '  "zeit_kar_std": number|null (Arbeitszeit Karosserie in Stunden),\n' +
  '  "zeit_lack_std": number|null (Arbeitszeit Lack in Stunden),\n' +
  '  "lohnsatz_ak_eur": number|null (Stundensatz Mechanik),\n' +
  '  "lohnsatz_kar_eur": number|null (Stundensatz Karosserie),\n' +
  '  "lohnsatz_lack_eur": number|null (Stundensatz Lack),\n' +
  '  "materialkosten_eur": number|null (Ersatzteilkosten gesamt),\n' +
  '  "lackmaterial_eur": number|null (Lackmaterial gesamt),\n' +
  '  "verbringung_eur": number|null (Verbringungskosten zur Lackiererei),\n' +
  '  "mietwagen_klasse": string|null (z.B. "Klasse 5"),\n' +
  '  "mietwagen_tagessatz_eur": number|null,\n' +
  '  "nutzungsausfall_tagessatz_eur": number|null,\n' +
  '  "sv_honorar_netto": number|null (Honorar des Sachverstaendigen netto),\n' +
  '  "sv_honorar_brutto": number|null,\n' +
  '  "kalkulationssystem": "audatex"|"dat"|"autoixpert"|"sonstiges"|null,\n' +
  '  "seitenzahl": number|null (Anzahl Gutachten-Seiten)\n' +
  '}\n\n' +
  'Antworte NUR mit dem JSON-Objekt.'

const FIELD_MAP: Array<[keyof GutachtenOcrResult, string]> = [
  ['reparaturkosten_netto', 'reparaturkosten_netto'],
  ['reparaturkosten_brutto', 'reparaturkosten_brutto'],
  ['minderwert', 'minderwert'],
  ['restwert', 'restwert'],
  ['wiederbeschaffungswert', 'wiederbeschaffungswert'],
  ['wiederbeschaffungsdauer_tage', 'wiederbeschaffungsdauer_tage'],
  ['nutzungsausfall_tage', 'nutzungsausfall_tage'],
  ['totalschaden', 'totalschaden'],
  ['gutachten_datum', 'gutachten_datum'],
  ['fin', 'gutachten_fin'],
  ['kennzeichen', 'gutachten_kennzeichen'],
  ['erstzulassung', 'gutachten_erstzulassung'],
  ['laufleistung_km', 'gutachten_laufleistung_km'],
  ['tuv_bis', 'gutachten_tuv_bis'],
  ['fahrzeug_typ', 'gutachten_fahrzeug_typ'],
  ['farbe', 'gutachten_farbe'],
  ['farbcode', 'gutachten_farbcode'],
  ['kraftstoff', 'gutachten_kraftstoff'],
  ['vorschaeden_text', 'gutachten_vorschaeden_text'],
  ['lackmesswert_max_my', 'gutachten_lackmesswert_max_my'],
  ['karosseriezustand', 'gutachten_karosseriezustand'],
  ['zeit_ak_std', 'gutachten_zeit_ak_std'],
  ['zeit_kar_std', 'gutachten_zeit_kar_std'],
  ['zeit_lack_std', 'gutachten_zeit_lack_std'],
  ['lohnsatz_ak_eur', 'gutachten_lohnsatz_ak_eur'],
  ['lohnsatz_kar_eur', 'gutachten_lohnsatz_kar_eur'],
  ['lohnsatz_lack_eur', 'gutachten_lohnsatz_lack_eur'],
  ['materialkosten_eur', 'gutachten_materialkosten_eur'],
  ['lackmaterial_eur', 'gutachten_lackmaterial_eur'],
  ['verbringung_eur', 'gutachten_verbringung_eur'],
  ['mietwagen_klasse', 'gutachten_mietwagen_klasse'],
  ['mietwagen_tagessatz_eur', 'gutachten_mietwagen_tagessatz_eur'],
  ['nutzungsausfall_tagessatz_eur', 'gutachten_nutzungsausfall_tagessatz_eur'],
  ['sv_honorar_netto', 'gutachten_sv_honorar_netto'],
  ['sv_honorar_brutto', 'gutachten_sv_honorar_brutto'],
  ['kalkulationssystem', 'gutachten_kalkulationssystem'],
  ['seitenzahl', 'gutachten_seitenzahl'],
]

/** PDF-Quelle fuer die Extraktion: entweder bereits geladene Bytes oder eine abrufbare URL. */
export type GutachtenPdfQuelle = { base64: string } | { url: string }

/**
 * E3b (13.08.): die REINE Extraktion — PDF rein, Felder raus, **kein** DB-Zugriff.
 *
 * Herausgeschnitten aus `extractGutachtenAndSaveToClaim`, weil dort Extraktion und
 * DB-Write gekoppelt waren: Der Vermittlungs-Einstieg (SV legt einen Fall aus einem
 * fertigen Gutachten an) braucht die Felder, BEVOR ein Claim existiert — er soll ja
 * erst daraus entstehen. Ein claim-gebundener Pfad ist dort per Definition unbrauchbar.
 *
 * `extractGutachtenAndSaveToClaim` ruft jetzt diese Funktion; ihr Verhalten ist
 * unveraendert (gleicher Prompt, gleiches Modell, gleiches Schema).
 */
export async function extractGutachtenFelder(
  quelle: GutachtenPdfQuelle,
): Promise<{ ok: true; felder: GutachtenOcrResult } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY fehlt' }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.parse({
      model: AI_MODELS.doc_ocr,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source:
                'base64' in quelle
                  ? { type: 'base64', media_type: 'application/pdf', data: quelle.base64 }
                  : { type: 'url', url: quelle.url },
            },
            {
              type: 'text',
              text: 'Extrahiere die im System-Prompt definierten Felder aus diesem Gutachten.',
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(GutachtenSchema) },
    })

    const parsed = response.parsed_output as GutachtenOcrResult | null
    if (!parsed) return { ok: false, error: 'Keine strukturierte OCR-Antwort' }
    return { ok: true, felder: parsed }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'OCR fehlgeschlagen' }
  }
}

/**
 * Extrahiert Felder aus dem Gutachten-PDF und schreibt sie auf den Claim.
 * Idempotent: wenn gutachten_ocr_processed_at gesetzt ist und force=false,
 * laeuft nichts. Mit force=true wird der Aufruf erzwungen — z.B. via
 * Admin-„Re-Run"-Button. Manuell ueberschriebene Felder bleiben dabei
 * unangetastet (siehe Doku der Spalte).
 */
export async function extractGutachtenAndSaveToClaim(
  auftragId: string,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY fehlt' }

  const force = opts?.force === true
  const admin = createAdminClient()

  // Phase 1.5b: auftrag.claim_id direkt verfügbar — kein faelle-Hop mehr nötig.
  const { data: auftrag } = await admin
    .from('auftraege')
    .select('id, fall_id, claim_id, gutachten_url')
    .eq('id', auftragId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }
  if (!auftrag.gutachten_url) return { ok: false, error: 'Kein Gutachten-URL' }

  const claimId = (auftrag.claim_id as string | null) ?? null
  if (!claimId) return { ok: false, error: 'Auftrag hat keinen Claim' }

  // Idempotenz: bereits verarbeitet?
  // Cluster F+G PR-1: Reads über v_gutachten_werte (Dual-Source View) — claims+gutachten via COALESCE
  const { data: existing } = await admin
    .from('v_gutachten_werte')
    .select('gutachten_ocr_processed_at, gutachten_ocr_manuell_ueberschrieben')
    .eq('claim_id', claimId)
    .maybeSingle()
  if (existing?.gutachten_ocr_processed_at && !force) {
    return { ok: true } // schon verarbeitet
  }
  const manuellUeberschrieben = !!existing?.gutachten_ocr_manuell_ueberschrieben

  // Bei manuell ueberschriebenen Werten: heute existierende DB-Werte laden,
  // damit wir nicht-NULL-Felder beim Re-Run NICHT ueberschreiben.
  let bestehendeWerte: Record<string, unknown> = {}
  if (manuellUeberschrieben) {
    const dbCols = FIELD_MAP.map(([, dbCol]) => dbCol).join(', ')
    const { data } = await admin
      .from('v_gutachten_werte')
      .select(dbCols)
      .eq('claim_id', claimId)
      .maybeSingle()
    bestehendeWerte = (data ?? {}) as Record<string, unknown>
  }

  // Filmcheck-Haertung 2026-07-02: PDF-Bytes selbst laden -> als base64 senden,
  // damit die OCR nicht von externer Fetchbarkeit + signed-URL-TTL abhaengt.
  // Spiegelt den fall_dokumente-Lookup aus gutachtenAbgeben (qc.ts): juengstes
  // gutachten/gutachten_anlage unter claims/<claimId>/gutachten/<auftragId>/.
  // Faellt auf den bestehenden url-Pfad zurueck, wenn Lookup/Download scheitert
  // oder die Datei groesser als das Anthropic-base64-Limit (~28 MB Rohbytes,
  // ~32 MB base64) ist — kein Regressionsrisiko gegenueber dem alten url-Pfad.
  const MAX_BASE64_BYTES = 28 * 1024 * 1024
  let pdfBase64: string | null = null
  try {
    const { data: docs } = await admin
      .from('fall_dokumente')
      .select('storage_path, dokument_typ, hochgeladen_am')
      .eq('fall_id', auftrag.fall_id as string)
      .in('dokument_typ', ['gutachten', 'gutachten_anlage'])
      .like('storage_path', `claims/${claimId}/gutachten/${auftragId}/%`)
      .is('geloescht_am', null)
      .order('hochgeladen_am', { ascending: false })
      .limit(1)
    const storagePath = (docs as Array<{ storage_path: string | null }> | null)?.[0]?.storage_path ?? null
    if (storagePath) {
      const { data: blob, error: dlErr } = await admin.storage
        .from('fall-dokumente')
        .download(storagePath)
      if (!dlErr && blob) {
        const buf = Buffer.from(await blob.arrayBuffer())
        if (buf.byteLength <= MAX_BASE64_BYTES) {
          pdfBase64 = buf.toString('base64')
        } else {
          console.warn(
            `[gutachten-ocr] PDF ${buf.byteLength} bytes > ${MAX_BASE64_BYTES} — nutze url-Fallback`,
          )
        }
      }
    }
  } catch (err) {
    console.warn('[gutachten-ocr] base64-Vorbereitung fehlgeschlagen, url-Fallback:', err)
  }

  try {
    // E3b: der LLM-Aufruf lebt jetzt in `extractGutachtenFelder` (pure, DB-frei) —
    // hier bleibt nur die claim-gebundene Klammer (Idempotenz, Merge, Write).
    const ocr = await extractGutachtenFelder(
      pdfBase64 ? { base64: pdfBase64 } : { url: auftrag.gutachten_url as string },
    )
    const parsed = ocr.ok ? ocr.felder : null
    if (!parsed) {
      // Cluster F+G PR-1: Write via RPC apply_gutachten_ocr (Dual-Write claims+gutachten)
      await admin.rpc('apply_gutachten_ocr', {
        p_claim_id: claimId,
        p_values: {
          gutachten_ocr_processed_at: new Date().toISOString(),
          gutachten_ocr_error: 'Keine strukturierte OCR-Antwort',
        },
      })
      return { ok: false, error: 'Keine strukturierte Antwort' }
    }

    // Update claim — ueber FIELD_MAP iterieren. Bei manuell-ueberschriebenen
    // Claims nur leere DB-Felder fuellen.
    const update: Record<string, unknown> = {
      gutachten_ocr_processed_at: new Date().toISOString(),
      gutachten_ocr_raw: parsed,
      gutachten_ocr_error: null,
    }
    for (const [ocrKey, dbCol] of FIELD_MAP) {
      const v = parsed[ocrKey]
      if (v == null) continue
      if (manuellUeberschrieben && bestehendeWerte[dbCol] != null) continue
      update[dbCol] = v
    }

    // Cluster F+G PR-1: Write via RPC apply_gutachten_ocr (Dual-Write claims+gutachten)
    const { error } = await admin.rpc('apply_gutachten_ocr', {
      p_claim_id: claimId,
      p_values: update,
    })
    if (error) return { ok: false, error: error.message }

    // Timeline-Audit
    await admin.from('timeline').insert({
      fall_id: auftrag.fall_id,
      typ: 'system',
      titel: force ? 'Gutachten-OCR neu ausgeloest' : 'Gutachten-OCR abgeschlossen',
      beschreibung: parsed.totalschaden
        ? `Totalschaden — WBW ${parsed.wiederbeschaffungswert ?? '?'} €, Restwert ${parsed.restwert ?? '?'} €`
        : `Reparaturkosten netto ${parsed.reparaturkosten_netto ?? '?'} €, Minderwert ${parsed.minderwert ?? '?'} €`,
    })

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gutachten-ocr] Fehler:', msg)
    // Cluster F+G PR-1: Write via RPC apply_gutachten_ocr (Dual-Write claims+gutachten)
    await admin.rpc('apply_gutachten_ocr', {
      p_claim_id: claimId,
      p_values: {
        gutachten_ocr_processed_at: new Date().toISOString(),
        gutachten_ocr_error: msg,
      },
    })
    return { ok: false, error: msg }
  }
}
