// Fallakte-Section-Relevanz: welche Prozess-Sektionen sind bei der aktuellen
// Phase + Datenlage eines Falls INHALTLICH aktiv (rollen-agnostisch).
//
// Historie: Die frühere Rollen-Whitelist-Schicht (getVisibleFallSections +
// ROLLE_SECTION_WHITELIST + isFallSectionVisible) war toter Ballast. Einziger
// Consumer war der Admin-ProzessTab, der die Rolle hart als 'admin' übergab,
// und admins Whitelist enthielt alle 8 Sections → der Rollen-Filter war selbst
// dort ein No-op. SV berechnete das Ergebnis und benutzte es nie; kunde/makler
// importierten es nie; 4 weitere Rollen waren gar nicht modelliert. Entfernt als
// Dead-Code-Hygiene (2026-07-28, verhaltens-neutral). Die per-Rolle-Sichtbarkeit
// einer gemeinsamen Fallakte gehört ins Fundament-Paket C4 (Verfassung §4:
// „Eine Akte, viele Sichten"), NICHT in diese Trigger-Logik — hier bewusst nicht
// entschieden.

import type { Szenario } from './subphase-resolver'

export type FallSectionKey =
  | 'kanzlei'
  | 'as'
  | 'vs_reaktion'
  | 'stellungnahme'
  | 'ruege'
  | 'nachbesichtigung'
  | 'klage'
  | 'auszahlung'

/**
 * Subphase-Input — minimiert auf das was die Relevanz-Logik braucht, damit
 * sowohl Admin (`SubphaseResult`) als auch SV (`getSvSubphase`) ihn
 * füttern können ohne shape-Kompatibilität. `phase` ist numerisch
 * (z.B. 5, 7, 7.6), `szenario` darf null sein.
 */
export type FallPhaseInput = {
  phase: number
  szenario: Szenario | null
}

type FallLike = Record<string, unknown>

/**
 * Liefert die Liste aller Sections die aufgrund von Phase + Daten-Triggern
 * (z.B. mandatsnummer, ruege_counter, vs_reaktion_typ) inhaltlich aktiv sein
 * sollen. Rollen-agnostisch — WELCHE Rolle welche Section sehen darf, ist hier
 * bewusst NICHT modelliert (→ Fundament C4 / Verfassung §4).
 *
 * Regeln (unverändert aus AAR-543):
 * - kanzlei      : Phase ≥ 4 ODER mandatsnummer ODER kanzlei_uebergeben_am
 *                  ODER status='kanzlei-uebergeben' ODER
 *                  sub_phase='kanzlei_uebergabe' (19.07.: Fall liegt fachlich
 *                  bei der Kanzlei, bevor Mandatsnummer/Datum gesetzt sind)
 * - as           : Phase ≥ 5 ODER anschlussschreiben_am
 * - vs_reaktion  : Phase ≥ 6 ODER vs_reaktion_typ
 * - stellungnahme: kuerzungstyp in [technisch, gemischt] UND
 *                  stellungnahme_status !== 'nicht-angefordert'
 * - ruege        : Phase ≥ 7 ODER ruege_gesendet_am ODER ruege_counter > 0
 * - nachbesichtigung: nbStatus in [angefordert, termin-gewaehlt,
 *                  durchgefuehrt, ergebnis-eingegangen] ODER
 *                  vs_reaktion_typ === 'nachbesichtigung'
 * - klage        : szenario='klagefall' ODER status='klage' ODER Phase ≥ 7.6
 * - auszahlung   : irgendeiner der Split-Beträge ODER regulierung_am
 */
export function getTriggeredFallSections(
  subphase: FallPhaseInput,
  fall: FallLike,
): FallSectionKey[] {
  const result: FallSectionKey[] = []
  const { phase, szenario } = subphase

  // Prod-UI-Smoke 19.07.: `mandatsnummer` und `kanzlei_uebergeben_am` werden
  // erst von der Kanzlei bzw. beim Paket-Push gesetzt. Ein Fall kann aber
  // fachlich laengst uebergeben sein (operative_status='kanzlei-uebergeben',
  // kanzlei_faelle-Row vorhanden), waehrend beide Felder NULL sind — auf prod
  // steht CLM-2026-00837 genau so. Dann blieb der Prozess-Tab leer
  // ("0 Trigger-Felder") und der Kundenbetreuer konnte den Kanzlei-Lifecycle
  // nicht uebernehmen. Der Fall-Status ist hier die verlaesslichere Achse.
  if (
    phase >= 4 ||
    fall.mandatsnummer ||
    fall.kanzlei_uebergeben_am ||
    fall.status === 'kanzlei-uebergeben' ||
    fall.sub_phase === 'kanzlei_uebergabe'
  ) {
    result.push('kanzlei')
  }

  if (phase >= 5 || fall.anschlussschreiben_am) {
    result.push('as')
  }

  if (phase >= 6 || fall.vs_reaktion_typ) {
    result.push('vs_reaktion')
  }

  const kuerzungstyp = fall.vs_kuerzungs_typ as string | null
  const stellungnahmeStatus = fall.technische_stellungnahme_status as string | null
  if (
    stellungnahmeStatus &&
    stellungnahmeStatus !== 'nicht-angefordert' &&
    (kuerzungstyp === 'technisch' || kuerzungstyp === 'gemischt')
  ) {
    result.push('stellungnahme')
  }

  const ruegeCounter = (fall.ruege_counter as number | null) ?? 0
  if (phase >= 7 || fall.ruege_gesendet_am || ruegeCounter > 0) {
    result.push('ruege')
  }

  // Whitelist statt truthy-Check, weil DB-Default 'nicht-angefordert' sonst
  // die Section fälschlich aktiv zeigt. Spiegelt AKTIVE_STATES aus
  // components/gutachter/NachbesichtigungCard.
  const nbStatus = fall.nachbesichtigung_status as string | null
  const nbAngefordert =
    nbStatus === 'angefordert' ||
    nbStatus === 'termin-gewaehlt' ||
    nbStatus === 'durchgefuehrt' ||
    nbStatus === 'ergebnis-eingegangen'
  if (fall.vs_reaktion_typ === 'nachbesichtigung' || nbAngefordert) {
    result.push('nachbesichtigung')
  }

  if (szenario === 'klagefall' || fall.status === 'klage' || phase >= 7.6) {
    result.push('klage')
  }

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
