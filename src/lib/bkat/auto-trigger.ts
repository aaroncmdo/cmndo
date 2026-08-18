// AAR-504 Auto-Trigger: BKat-OCR nach Polizeibericht-Upload.
//
// Aufruf-Pfade (alle nutzen `scheduleBkatAnalyseAfterUpload` damit der
// Trigger via Next.js `after()` zuverlässig nach dem Response-Send läuft —
// klassisches Promise.catch() ohne `after()` würde von Vercel ggf.
// gekillt bevor die Mapbox/Claude-Calls durch sind):
//   1. /upload/dokumente/[token]   — Web-Upload via Kunden-Token
//   2. /api/webhooks/twilio/inbound — WhatsApp-Upload
//   3. /kunde/onboarding (Wizard)  — post-Konvertierung über fall.lead_id
//   4. /gutachter/termine/[id]     — SV-Vor-Ort-Upload
//
// Architektur-Entscheidung:
// - Polizeibericht vorhanden → Auto-OCR läuft im Hintergrund, ohne Kunde-Dialog
// - Kein Polizeibericht → kein Auto-Trigger, Dispatcher stößt LLM-Fallback
//   manuell im BkatAnalysePanel (Phase 3) an
// - Kunde sieht nie die Klassifikation — interne Dispatcher-UI-Info
//
// Persistenz: nur `leads.bkat_unfallart` + `leads.polizeibericht_status`.
// TBNRs werden NICHT in die DB geschrieben (Kanzlei-Missverständnis-Risiko).
// Die TBNRs werden bei späterem Dispatcher-Review über BkatAnalysePanel neu
// aus dem Bild extrahiert (ist deterministisch, OCR ist konsistent).

import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { inferBkatFromPolizeibericht } from './inference'
import { resignStorageUrl } from '@/lib/storage/url'
import { bkatToLegacySchadentyp } from './lookup'

/**
 * Fire-and-forget BKat-Analyse nach einem Polizeibericht-Upload.
 * Errors werden geloggt aber nie geworfen — der Upload-Flow darf nicht
 * blockieren wenn die KI-Analyse fehlschlägt.
 */
export async function triggerAutoBkatOcr(
  supabase: SupabaseClient,
  leadId: string,
  bildUrl: string,
): Promise<void> {
  try {
    // Die uebergebene URL ist nicht zwingend abrufbar: `fall-dokumente` ist ein PRIVATER
    // Bucket → eine getPublicUrl liefert HTTP 400, eine signed-URL laeuft nach ihrer TTL ab.
    // Anthropic-Vision holt das Bild OHNE Auth (source.type='url') → frisch signieren.
    // Nicht-Storage-URLs (z.B. Twilio-Media) parsen nicht und fallen unveraendert durch.
    const fetchbareUrl = (await resignStorageUrl(supabase, bildUrl)) ?? bildUrl
    const result = await inferBkatFromPolizeibericht([fetchbareUrl])
    if (result.source !== 'ocr' || !result.unfallart) {
      // OCR lief, fand aber keine verwertbare TBNR oder Claude hat keine
      // Unfallart zugeordnet. Kein Fehler — Dispatcher wird später via
      // LLM-Fallback im BkatAnalysePanel klassifizieren.
      console.info(`[AAR-504] Auto-OCR für Lead ${leadId}: keine Klassifikation`)
      return
    }

    // Nur bkat_unfallart speichern. TBNRs sind transient im Result und
    // werden bei späterem Dispatcher-Review erneut extrahiert (gleiches
    // Bild, gleicher deterministischer Prompt).
    // Auch den Legacy-schadentyp schreiben, damit der SchadentypPicker
    // sofort den passenden Eintrag highlightet (statt erst nach Dispatcher-
    // Übernahme).
    const legacy = bkatToLegacySchadentyp(result.unfallart)
    // Ergebnis einer kostenpflichtigen Bild-Auswertung — geht der Write verloren,
    // muss sie erneut laufen.
    const { error: bkatFehler } = await supabase
      .from('leads')
      .update({
        bkat_unfallart: result.unfallart,
        ...(legacy ? { schadentyp: legacy } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
    if (bkatFehler) {
      console.error(`[bkat] Unfallart nicht gespeichert (Lead ${leadId}):`, bkatFehler.message)
    }

    console.info(
      `[AAR-504] Auto-OCR für Lead ${leadId} erfolgreich: ` +
        `unfallart=${result.unfallart}, tbnrs=${result.vorschlaege.length}, ` +
        `schuld_hint=${result.schuld_hint ?? 'neutral'}`,
    )
  } catch (err) {
    console.error(`[AAR-504] Auto-OCR für Lead ${leadId} fehlgeschlagen:`, err)
  }
}

/**
 * Robuster Aufruf-Wrapper: schedult triggerAutoBkatOcr via Next.js
 * `after()` damit die OCR-Analyse nach Response-Send zuverlässig läuft.
 * Aufruf in jedem Polizeibericht-Upload-Pfad direkt nach erfolgreichem
 * Storage-Upload + leads-Update.
 *
 * Vor `after()`: Promise.catch() fire-and-forget hat auf Vercel das
 * Risiko dass der Container vor Abschluss recycled wird → Mapbox/Claude-
 * Calls brechen ab. Mit `after()` bleibt der Worker bis Promise resolved.
 */
export function scheduleBkatAnalyseAfterUpload(
  supabase: SupabaseClient,
  leadId: string,
  bildUrl: string,
): void {
  if (!leadId || !bildUrl) return
  after(async () => {
    try {
      await triggerAutoBkatOcr(supabase, leadId, bildUrl)
    } catch (err) {
      console.error(
        `[AAR-504] scheduleBkatAnalyseAfterUpload Lead ${leadId}:`,
        err instanceof Error ? err.message : err,
      )
    }
  })
}
