// PURE Qualifikations-Regel fuer die Gewinnspiel-Teilnahme.
//
// Bewusst OHNE server-only / DB / Next-Imports -> im vitest-node-Env isoliert
// testbar (Muster: src/lib/embed/anfrage-columns.ts).
//
// Zwei Felder tragen die Schuldfrage, je nach Kanal — und ihre CHECK-Werte
// sind NICHT deckungsgleich:
//   leads.schuldfrage                              gegner | unklar | eigenverantwortung
//   gutachter_finder_anfragen.schuldfrage          gegner | unklar | teilschuld
//   gutachter_finder_anfragen.schuld_einschaetzung unverschuldet | nicht_sicher
//
// Nur 'gegner' existiert in beiden schuldfrage-CHECKs. 'teilschuld' zaehlt
// bewusst NICHT als Haftpflichtschaden: dort wird der Schaden nur anteilig
// nach Quote ersetzt (§ 254 BGB), nicht voll von der Gegenseite getragen.

import { toE164 } from '@/lib/format/telefon'

export type QualifikationsInput = {
  telefon?: string | null
  schuldfrage?: string | null
  schuldEinschaetzung?: string | null
}

/** Maschinenlesbarer Grund fuer Logs und Admin-Auswertung — kein Nutzertext. */
export type QualifikationsGrund =
  | 'qualifiziert'
  | 'keine_telefonnummer'
  | 'kein_haftpflichtschaden'

export type QualifikationsErgebnis = {
  qualifiziert: boolean
  telefonNormalisiert: string | null
  grund: QualifikationsGrund
}

/**
 * Entscheidet, ob ein Lead in den Lostopf gehoert.
 *
 * Zwei Bedingungen, beide notwendig:
 *   1. Eine Telefonnummer — ohne sie gibt es weder WhatsApp-Verifikation noch
 *      Gewinnbenachrichtigung. Mehrere Lead-Kanaele liefern keine (gemessen:
 *      werkstatt_finder 0/4, kunde_portal 0/3).
 *   2. Ein Haftpflichtschaden laut einem der beiden Schuldfrage-Felder.
 */
export function qualifiziertFuerGewinnspiel(
  input: QualifikationsInput,
): QualifikationsErgebnis {
  const telefonNormalisiert = toE164(input.telefon)
  if (!telefonNormalisiert) {
    return { qualifiziert: false, telefonNormalisiert: null, grund: 'keine_telefonnummer' }
  }

  const istHaftpflicht =
    input.schuldfrage === 'gegner' || input.schuldEinschaetzung === 'unverschuldet'

  if (!istHaftpflicht) {
    return { qualifiziert: false, telefonNormalisiert, grund: 'kein_haftpflichtschaden' }
  }

  return { qualifiziert: true, telefonNormalisiert, grund: 'qualifiziert' }
}
