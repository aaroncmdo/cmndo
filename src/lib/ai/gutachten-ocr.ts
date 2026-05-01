// Gutachten-OCR-Pipeline. Wird nach QC-Freigabe (gibKanzleipaketFrei)
// fire-and-forget gestartet und extrahiert die wesentlichen Werte aus
// dem Gutachten-PDF — schreibt sie als claim-SSoT auf die claims-Zeile.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from './models'

type GutachtenOcrResult = {
  reparaturkosten_netto?: number | null
  reparaturkosten_brutto?: number | null
  minderwert?: number | null
  restwert?: number | null
  wiederbeschaffungswert?: number | null
  wiederbeschaffungsdauer_tage?: number | null
  nutzungsausfall_tage?: number | null
  totalschaden?: boolean | null
  gutachten_datum?: string | null
}

const SYSTEM_PROMPT =
  'Du bist ein OCR-Assistent für deutsche Kfz-Gutachten. Deine Aufgabe: aus dem ' +
  'angehängten Gutachten-PDF die folgenden Felder extrahieren und ausschließlich ' +
  'als JSON zurückgeben (keine Erklärungen, kein Markdown):\n' +
  '{\n' +
  '  "reparaturkosten_netto": number|null (Euro, ohne USt),\n' +
  '  "reparaturkosten_brutto": number|null (Euro, mit USt),\n' +
  '  "minderwert": number|null (Wertminderung in Euro),\n' +
  '  "restwert": number|null (Restwert in Euro, falls Totalschaden),\n' +
  '  "wiederbeschaffungswert": number|null (WBW in Euro),\n' +
  '  "wiederbeschaffungsdauer_tage": number|null (Kalendertage),\n' +
  '  "nutzungsausfall_tage": number|null (Tage),\n' +
  '  "totalschaden": boolean|null,\n' +
  '  "gutachten_datum": "YYYY-MM-DD"|null (Datum des Gutachtens)\n' +
  '}\n\n' +
  'Werte die nicht im Dokument stehen → null. Bei Beträgen: Komma als Dezimaltrenner ' +
  'wegnormalisieren (z.B. "3.245,67 €" → 3245.67). Antworte nur mit dem JSON-Objekt.'

/**
 * Extrahiert Felder aus dem Gutachten-PDF und schreibt sie auf den Claim.
 * Idempotent: wenn gutachten_ocr_processed_at gesetzt ist, läuft nichts.
 */
export async function extractGutachtenAndSaveToClaim(
  auftragId: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY fehlt' }

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
    .select('gutachten_ocr_processed_at')
    .eq('id', claimId)
    .maybeSingle()
  if (existing?.gutachten_ocr_processed_at) {
    return { ok: true } // schon verarbeitet
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: AI_MODELS.ocr,
      max_tokens: 1024,
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

    // Update claim
    const update: Record<string, unknown> = {
      gutachten_ocr_processed_at: new Date().toISOString(),
      gutachten_ocr_raw: parsed,
      gutachten_ocr_error: null,
    }
    if (parsed.reparaturkosten_netto != null) update.reparaturkosten_netto = parsed.reparaturkosten_netto
    if (parsed.reparaturkosten_brutto != null) update.reparaturkosten_brutto = parsed.reparaturkosten_brutto
    if (parsed.minderwert != null) update.minderwert = parsed.minderwert
    if (parsed.restwert != null) update.restwert = parsed.restwert
    if (parsed.wiederbeschaffungswert != null) update.wiederbeschaffungswert = parsed.wiederbeschaffungswert
    if (parsed.wiederbeschaffungsdauer_tage != null) update.wiederbeschaffungsdauer_tage = parsed.wiederbeschaffungsdauer_tage
    if (parsed.nutzungsausfall_tage != null) update.nutzungsausfall_tage = parsed.nutzungsausfall_tage
    if (parsed.totalschaden != null) update.totalschaden = parsed.totalschaden
    if (parsed.gutachten_datum) update.gutachten_datum = parsed.gutachten_datum

    const { error } = await admin.from('claims').update(update).eq('id', claimId)
    if (error) return { ok: false, error: error.message }

    // Timeline-Audit
    await admin.from('timeline').insert({
      fall_id: auftrag.fall_id,
      typ: 'system',
      titel: 'Gutachten-OCR abgeschlossen',
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
