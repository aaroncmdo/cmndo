// CMM-44 MP-4b: 4-Hauptphasen-Pipeline-Renderer für die Fallakte-Phasen-ANZEIGE.
// Löst die alte 10-Phasen/52-Subphasen-Matrix ab. Die feinkörnige Matrix
// (SUBPHASE_VISIBILITY + PHASE_META) wurde im Lifecycle-Freeze (Track 1, T1.0)
// entfernt — sie war test-only Dead-Weight (keine Prod-Consumer) und ihre
// Backing-Spalte `faelle.aktuelle_phase` ist längst weg. Modell:
//   erfassung -> begutachtung -> regulierung -> abschluss

import type { PhaseState, PhaseStepData, Rolle, SubphaseData } from '@/components/shared/fall-phases/types'
// CMM-44 MP-4b: 4-Phasen-Modell aus dem getClaimLifecycle-Resolver.
import {
  MAIN_PHASE_LABEL,
  SUBPHASE_LABEL,
  getVisibleMainPhases,
  type ClaimLifecycle,
  type ClaimMainPhase,
  type ClaimSubPhase,
} from '@/lib/claims/lifecycle'

// ─── CMM-44 MP-4b: 4-Hauptphasen-Pipeline aus getClaimLifecycle ─────────────
// 4 Hauptphasen, B-1: KEINE Klage-Hauptphase — Klage ist ein abschluss-Substate.
// Die aktive Hauptphase trägt den aktuellen ClaimSubPhase als einzigen Sub-Step
// (Label aus SUBPHASE_LABEL); abschluss zeigt den terminalen Substate. Side-
// Quests (Nachbesichtigung/Stellungnahme) rendert der Consumer separat aus
// lifecycle.aktiveSideQuests (parallel, nicht im linearen Pipeline-Pfad).
//
// MP-5 (DE-2): `rolle` personalisiert das LABEL des aktiven Substates — externe
// Rollen (kunde/makler) sehen kundenfreundliche Sprache (KUNDE_SUBSTATE_LABEL),
// intern (admin/kb/sv) das technische SUBPHASE_LABEL. Die VISIBILITY der 4 Haupt-
// phasen + des aktiven Substates bleibt rollenneutral (alle Rollen sehen denselben
// Fortschritt).
const CLAIM_MAIN_PHASE_ORDER: ClaimMainPhase[] = [
  'erfassung',
  'begutachtung',
  'regulierung',
  'abschluss',
]

// MP-5 (DE-2): Rollen-spezifische Substate-Labels. Die 13 ClaimSubPhase-Backbone-
// Substates sind rollenneutral SICHTBAR (jede Rolle sieht denselben 4-Phasen-
// Fortschritt). Personalisiert wird nur das LABEL der externen Rollen
// (kunde/makler) — kundenfreundliche Sprache. Intern (admin/kb/sv) = technisches
// Default (SUBPHASE_LABEL).
const KUNDE_SUBSTATE_LABEL: Partial<Record<ClaimSubPhase, string>> = {
  sa_offen: 'Schaden wird erfasst',
  vollmacht_offen: 'Unterlagen werden vorbereitet',
  onboarding_offen: 'Letzte Angaben ausstehend',
  termin: 'Termin wird vereinbart',
  besichtigung: 'Begutachtung läuft',
  gutachten: 'Gutachten wird erstellt',
  kanzlei_uebergabe: 'Akte geht an die Kanzlei',
  versicherungskontakt: 'Kanzlei klärt mit der Versicherung',
  auszahlung: 'Auszahlung wird vorbereitet',
  erfolgreich_reguliert: 'Erfolgreich abgeschlossen',
  storniert: 'Fall abgeschlossen',
  klage_rechtsstreit: 'An die Klage übergeben',
  verjaehrt: 'Fall abgeschlossen',
}

const EXTERN_ROLLEN: ReadonlySet<Rolle> = new Set<Rolle>(['kunde', 'makler'])

/** MP-5: Label des aktiven Substates je Rolle. Externe (kunde/makler) -> freundlich,
 *  intern (admin/kb/sv) -> technisches Default. */
export function substateLabelForRolle(sub: ClaimSubPhase, rolle: Rolle): string {
  if (EXTERN_ROLLEN.has(rolle)) return KUNDE_SUBSTATE_LABEL[sub] ?? SUBPHASE_LABEL[sub]
  return SUBPHASE_LABEL[sub]
}

export function buildClaimPhasePipeline(
  lifecycle: ClaimLifecycle,
  rolle: Rolle,
): PhaseStepData[] {
  // AAR-939: nur_gutachter-Claims blenden die Regulierungs-Phase aus (kein
  // Regulierungs-Tail). Defensiv: sollte ein nur_gutachter-Claim wider Erwarten
  // doch in 'regulierung' stehen, NICHT ausblenden (sonst landet die aktive
  // Phase ausserhalb der Pipeline) -> Fallback auf die volle Reihenfolge.
  const visible = getVisibleMainPhases(lifecycle.serviceTyp)
  const phasen = visible.includes(lifecycle.mainPhase) ? visible : CLAIM_MAIN_PHASE_ORDER
  const aktuellIdx = phasen.indexOf(lifecycle.mainPhase) // 0..(phasen.length-1)
  const istTerminal = lifecycle.mainPhase === 'abschluss'

  return phasen.map((mp, idx) => {
    let state: PhaseState
    if (idx < aktuellIdx) state = 'done'
    else if (idx === aktuellIdx) state = istTerminal ? 'done' : 'active'
    else state = 'upcoming'

    // Nur die aktuelle (bzw. terminale) Hauptphase traegt den aktiven Substate
    // als einzigen Sub-Step — der Lifecycle kennt keine Substate-Historie der
    // bereits abgeschlossenen Phasen.
    const subphases: SubphaseData[] | undefined =
      idx === aktuellIdx
        ? [
            {
              id: lifecycle.subPhase,
              label: substateLabelForRolle(lifecycle.subPhase, rolle),
              state: istTerminal ? 'done' : 'active',
              visible: true,
            },
          ]
        : undefined

    return {
      phase: idx + 1, // 1..4 fuer die "01".."04"-Badge in PhaseStep
      name: MAIN_PHASE_LABEL[mp],
      state,
      subphases,
    }
  })
}
