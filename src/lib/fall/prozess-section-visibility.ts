// AAR-543 (C6): Sichtbarkeits-Map für die 8 Prozess-Tab Sections.
// Arbeitet direkt auf SubphaseResult (aus C1) + fall-Row, damit die gleiche
// Quelle der Wahrheit wie für den Phase-Header genutzt wird. Status-Feld
// (faelle.status) wird NICHT mehr primär konsultiert — die Subphase leitet
// sich aus den Daten-Triggern ab und ist präziser.

import type { SubphaseResult } from './subphase-resolver'

export type ProzessSection =
  | 'kanzlei'
  | 'as'
  | 'vs_reaktion'
  | 'stellungnahme'
  | 'ruege'
  | 'nachbesichtigung'
  | 'klage'
  | 'auszahlung'

type FallLike = Record<string, unknown>

/**
 * Liefert die Liste der sichtbaren Sections in Reihenfolge.
 * Regeln (aus AAR-543-Spec):
 * - kanzlei      : Phase ≥ 4 (akte-uebergeben) ODER mandatsnummer gesetzt
 * - as           : Phase ≥ 5 (AS-Vorbereitung) ODER anschlussschreiben_am
 * - vs_reaktion  : Phase ≥ 6 ODER vs_reaktion_typ gesetzt
 * - stellungnahme: conditional — nur wenn Kürzungstyp 'technisch' oder 'gemischt'
 *                  UND Stellungnahme-Status existiert (!= 'nicht-angefordert')
 * - ruege        : Phase ≥ 7 ODER ruege_gesendet_am ODER ruege_counter > 0
 * - nachbesichtigung: vs_reaktion_typ='nachbesichtigung' ODER nachbesichtigung_status
 * - klage        : szenario='klagefall' ODER Phase ≥ 7.6
 * - auszahlung   : irgendeiner der Split-Beträge gesetzt ODER regulierung_am
 */
export function getVisibleProzessSections(
  subphase: SubphaseResult,
  fall: FallLike,
): ProzessSection[] {
  const result: ProzessSection[] = []
  const { phase, szenario } = subphase

  // 1. Kanzlei + E-Akte
  if (phase >= 4 || fall.mandatsnummer || fall.kanzlei_uebergeben_am) {
    result.push('kanzlei')
  }

  // 2. Anspruchsschreiben
  if (phase >= 5 || fall.anschlussschreiben_am) {
    result.push('as')
  }

  // 3. VS-Reaktion (inkl. Quote-Pfad)
  if (phase >= 6 || fall.vs_reaktion_typ) {
    result.push('vs_reaktion')
  }

  // 4. Technische Stellungnahme (conditional)
  const kuerzungstyp = fall.vs_kuerzungs_typ as string | null
  const stellungnahmeStatus = fall.technische_stellungnahme_status as string | null
  if (
    stellungnahmeStatus &&
    stellungnahmeStatus !== 'nicht-angefordert' &&
    (kuerzungstyp === 'technisch' || kuerzungstyp === 'gemischt')
  ) {
    result.push('stellungnahme')
  }

  // 5. Rüge
  const ruegeCounter = (fall.ruege_counter as number | null) ?? 0
  if (phase >= 7 || fall.ruege_gesendet_am || ruegeCounter > 0) {
    result.push('ruege')
  }

  // 6. Nachbesichtigung — nur wenn tatsächlich angefordert (Whitelist-Status),
  // NICHT wenn nachbesichtigung_status z.B. 'nicht-angefordert' (DB-Default).
  // Spiegelt AKTIVE_STATES aus components/gutachter/NachbesichtigungCard.
  const nbStatus = fall.nachbesichtigung_status as string | null
  const nbAngefordert =
    nbStatus === 'angefordert' ||
    nbStatus === 'termin-gewaehlt' ||
    nbStatus === 'durchgefuehrt' ||
    nbStatus === 'ergebnis-eingegangen'
  if (fall.vs_reaktion_typ === 'nachbesichtigung' || nbAngefordert) {
    result.push('nachbesichtigung')
  }

  // 7. Klage
  if (szenario === 'klagefall' || fall.status === 'klage' || phase >= 7.6) {
    result.push('klage')
  }

  // 8. Auszahlung
  if (
    fall.auszahlung_kunde_betrag != null ||
    fall.auszahlung_kunde_eingegangen_am ||
    fall.auszahlung_gutachter_eingegangen_am ||
    fall.zahlung_eingegangen_am ||
    fall.regulierung_am
  ) {
    result.push('auszahlung')
  }

  return result
}
