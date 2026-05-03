// Gutachten-OCR-Pipeline. Wird nach QC-Freigabe (gibKanzleipaketFrei)
// fire-and-forget gestartet und extrahiert die wesentlichen Werte aus
// dem Gutachten-PDF — schreibt sie als claim-SSoT auf die claims-Zeile.
//
// Erweiterte Auslese (CMM-32 Walkthrough): 9 Kernfelder + 5 Cluster
// (A Fahrzeug, B Vorschaeden, C Reparatur, D Mietwagen, E SV-Meta).
// Manuelle Admin-Korrekturen sind respektiert: ist
// gutachten_ocr_manuell_ueberschrieben=true, wird beim Re-Run nur
// NULL-Felder gefuellt — bestehende Werte bleiben.

import Anthropic from '@anthropic-ai/sdk'
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

  // Auftrag → Fall → Claim
  const { data: auftrag } = await admin
    .from('auftraege')
    .select('id, fall_id, gutachten_url')
    .eq('id', auftragId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }
  if (!auftrag.gutachten_url) return { ok: false, error: 'Kein Gutachten-URL' }

  const { data: fall } = await admin
    .from('faelle')
    .select('claim_id')
    .eq('id', auftrag.fall_id as string)
    .maybeSingle()
  const claimId = (fall?.claim_id as string | null) ?? null
  if (!claimId) return { ok: false, error: 'Fall hat keinen Claim' }

  // Idempotenz: bereits verarbeitet?
  const { data: existing } = await admin
    .from('claims')
    .select('gutachten_ocr_processed_at, gutachten_ocr_manuell_ueberschrieben')
    .eq('id', claimId)
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
      .from('claims')
      .select(dbCols)
      .eq('id', claimId)
      .maybeSingle()
    bestehendeWerte = (data ?? {}) as Record<string, unknown>
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: AI_MODELS.ocr,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'url',
                url: auftrag.gutachten_url as string,
              },
            },
            {
              type: 'text',
              text: 'Extrahiere die im System-Prompt definierten Felder aus diesem Gutachten.',
            },
          ],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      await admin
        .from('claims')
        .update({
          gutachten_ocr_processed_at: new Date().toISOString(),
          gutachten_ocr_error: 'Kein JSON in Claude-Antwort gefunden',
        })
        .eq('id', claimId)
      return { ok: false, error: 'Kein JSON in Antwort' }
    }
    const parsed = JSON.parse(match[0]) as GutachtenOcrResult

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

    const { error } = await admin.from('claims').update(update).eq('id', claimId)
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
    await admin
      .from('claims')
      .update({
        gutachten_ocr_processed_at: new Date().toISOString(),
        gutachten_ocr_error: msg,
      })
      .eq('id', claimId)
    return { ok: false, error: msg }
  }
}
