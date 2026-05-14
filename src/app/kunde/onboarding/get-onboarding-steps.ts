// AAR-903 Adaptives Onboarding: berechnet welche Wizard-Steps der konkrete
// Kunde durchlaufen muss. Welche Steps gerendert werden, haengt von den
// bereits am Lead/Fall/Claim erfassten Daten ab.
//
// Pflicht-Steps (nie skip):
//   - welcome   — Begruessung + Erklaerung
//   - fall      — Fall-Uebersicht damit Kunde sieht "ja, das ist mein Fall"
//   - fertig    — Abschluss + Weiterleitung zur Fallakte
//
// Optionale Steps (skip wenn Daten vorhanden):
//   - termin    — skip wenn Fall bereits einen reservierten/bestaetigten
//                 SV-Termin hat (z.B. aus DynamicWizard-Buchung auf der
//                 Karte heraus)
//   - dokumente — skip wenn keine offenen Pflicht-Slots existieren
//                 (Pflichtdokumente-Section bleibt parallel auf der Fallakte,
//                 Kunde kann sie spaeter nachreichen — siehe AGENTS.md
//                 §pflichtdokumente)
//
// Volle Spec: docs/14.05.2026/mini-wizard-magic-link-konzept.md §Phase 3.

import type { PflichtdokumentStand } from './actions'

export type OnboardingStepId = 'welcome' | 'fall' | 'termin' | 'dokumente' | 'fertig'

export type OnboardingStep = {
  id: OnboardingStepId
  label: string
}

const ALL_STEPS: readonly OnboardingStep[] = [
  { id: 'welcome', label: 'Willkommen' },
  { id: 'fall', label: 'Ihr Fall' },
  { id: 'termin', label: 'Termin' },
  { id: 'dokumente', label: 'Dokumente' },
  { id: 'fertig', label: 'Fertig' },
] as const

export type OnboardingContext = {
  /** Sv-Termin auf dem Fall (gutachter_termine.start_zeit) — wenn gesetzt
   *  und Status reserviert/bestaetigt, ueberspringen wir den Termin-Step. */
  hatTerminGebucht: boolean
  /** Anzahl offener Pflichtdokument-Slots. Wenn 0, ueberspringen wir den
   *  Dokumente-Step. */
  offenePflichtdokumente: number
}

/** Reine Funktion: gibt die fuer diesen Kunden sichtbaren Steps zurueck.
 *  Ordnung bleibt stabil (welcome → fall → termin → dokumente → fertig). */
export function getOnboardingSteps(ctx: OnboardingContext): OnboardingStep[] {
  return ALL_STEPS.filter((step) => {
    if (step.id === 'termin') return !ctx.hatTerminGebucht
    if (step.id === 'dokumente') return ctx.offenePflichtdokumente > 0
    return true
  })
}

/** Hilfs-Konverter aus den OnboardingWizard-Props in den Context. */
export function buildOnboardingContext(input: {
  termin: { datum: string | null } | null
  pflichtDocs: PflichtdokumentStand[]
}): OnboardingContext {
  return {
    hatTerminGebucht: !!input.termin?.datum,
    offenePflichtdokumente: input.pflichtDocs.filter(
      (d) => d.status !== 'hochgeladen',
    ).length,
  }
}
