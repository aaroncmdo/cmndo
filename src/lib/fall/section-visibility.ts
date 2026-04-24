// AAR-745 (Phase A): Visibility-Single-Source für Fallakte-Sections.
// Generalisiert prozess-section-visibility.ts (bisher nur Admin-ProzessTab)
// auf alle 3 Portale (Admin / SV / Kunde). Regel-Matrix ist unverändert
// gegenüber der Admin-Funktion — lediglich das Ergebnis wird pro Rolle
// gefiltert, weil z.B. Kunde keine Stellungnahme oder Rüge sieht.
//
// Ziel: eine Quelle der Wahrheit für "welche Prozess-Sektion ist jetzt
// sichtbar" — heute 4× reimplementiert (Admin-ProzessTab, SV-Karten
// self-gating, Kunde-Sections, punktuelle Cards). Ein Bug = 4× fixen.
//
// Migration: prozess-section-visibility.ts bleibt bestehen als
// @deprecated Wrapper, damit bestehende Consumer nicht brechen.

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

export type FallVisibilityRolle = 'admin' | 'sv' | 'kunde'

/**
 * Subphase-Input — minimiert auf das was die Visibility braucht, damit
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
 * Sections die pro Rolle überhaupt angezeigt werden sollen, unabhängig
 * vom Phase-Trigger. Kunde sieht z.B. keine Rüge oder Stellungnahme —
 * das sind interne Prozess-Schritte. SV sieht keine Kanzlei- oder
 * AS-Sections — die laufen am SV vorbei.
 *
 * Diese Matrix definiert die Portal-Sichtbarkeit, NICHT die inhaltliche
 * Sichtbarkeit (Phase/Trigger). Beide werden kombiniert angewendet.
 */
const ROLLE_SECTION_WHITELIST: Record<FallVisibilityRolle, ReadonlySet<FallSectionKey>> = {
  admin: new Set<FallSectionKey>([
    'kanzlei',
    'as',
    'vs_reaktion',
    'stellungnahme',
    'ruege',
    'nachbesichtigung',
    'klage',
    'auszahlung',
  ]),
  sv: new Set<FallSectionKey>([
    'vs_reaktion',
    'stellungnahme',
    'ruege',
    'nachbesichtigung',
    'auszahlung',
  ]),
  kunde: new Set<FallSectionKey>([
    'kanzlei',
    'vs_reaktion',
    'nachbesichtigung',
    'klage',
    'auszahlung',
  ]),
}

/**
 * Liefert die Liste aller Sections die aufgrund von Phase + Daten-
 * Triggern (z.B. mandatsnummer, ruege_counter, vs_reaktion_typ) aktiv
 * sein sollen. Ohne Rollen-Filter — das macht
 * {@link getVisibleFallSections}.
 *
 * Regeln (unverändert aus AAR-543):
 * - kanzlei      : Phase ≥ 4 ODER mandatsnummer ODER kanzlei_uebergeben_am
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

  if (phase >= 4 || fall.mandatsnummer || fall.kanzlei_uebergeben_am) {
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

/**
 * Kombiniert die inhaltliche (Phase/Trigger) mit der Portal-Sichtbarkeit
 * (Rolle). Reihenfolge bleibt kanonisch wie in
 * {@link getTriggeredFallSections}.
 *
 * @example
 * const visible = getVisibleFallSections(fall, 'admin', subphase)
 * {visible.includes('stellungnahme') && <StellungnahmeSection />}
 */
export function getVisibleFallSections(
  fall: FallLike,
  rolle: FallVisibilityRolle,
  subphase: FallPhaseInput,
): FallSectionKey[] {
  const whitelist = ROLLE_SECTION_WHITELIST[rolle]
  return getTriggeredFallSections(subphase, fall).filter((key) => whitelist.has(key))
}

/**
 * Hilfsfunktion für Call-Sites die einzeln gaten — liest nicht schöner
 * als `visible.includes(key)`, aber macht die Intention explizit.
 */
export function isFallSectionVisible(
  fall: FallLike,
  rolle: FallVisibilityRolle,
  subphase: FallPhaseInput,
  section: FallSectionKey,
): boolean {
  return getVisibleFallSections(fall, rolle, subphase).includes(section)
}
