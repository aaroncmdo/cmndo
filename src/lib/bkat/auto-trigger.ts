// AAR-504 Auto-Trigger: Fire-and-forget BKat-OCR nach Polizeibericht-Upload.
//
// Wird aus den zwei Polizeibericht-Upload-Pfaden aufgerufen:
//   1. /upload/dokumente/[token] (Web-Upload via Kunden-Portal)
//   2. /api/webhooks/twilio/inbound (WhatsApp-Upload)
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
import { inferBkatFromPolizeibericht } from './inference'

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
    const result = await inferBkatFromPolizeibericht([bildUrl])
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
    await supabase
      .from('leads')
      .update({
        bkat_unfallart: result.unfallart,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    console.info(
      `[AAR-504] Auto-OCR für Lead ${leadId} erfolgreich: ` +
        `unfallart=${result.unfallart}, tbnrs=${result.vorschlaege.length}, ` +
        `schuld_hint=${result.schuld_hint ?? 'neutral'}`,
    )
  } catch (err) {
    console.error(`[AAR-504] Auto-OCR für Lead ${leadId} fehlgeschlagen:`, err)
  }
}
