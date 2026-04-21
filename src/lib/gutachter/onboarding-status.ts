// AAR-512: Zentrale Onboarding-Status-Logik für das Gutachter-Portal.
//
// Vorher prüfte das Layout nur `anzahlung_status !== 'bezahlt'` — irreführend
// wenn der SV in einer anderen Onboarding-Stufe hängt (Logo/Vertrag/SA/Kalender).
// Hier: eine Wahrheit für „Onboarding komplett" + Deep-Link-Berechnung zum
// nächsten offenen Step im `/gutachter/willkommen`-Wizard.

export type OnboardingSv = {
  vertrag_unterschrieben: boolean | null
  anzahlung_status: string | null
  portal_zugang_freigeschaltet: boolean | null
  sa_vorlage_status: 'ausstehend' | 'geprueft' | 'zurueckgewiesen' | null
  gcal_connected: boolean | null
  logo_url: string | null
}

/** True wenn alle Pflicht-Steps abgeschlossen sind. */
export function isOnboardingComplete(sv: OnboardingSv): boolean {
  return (
    sv.vertrag_unterschrieben === true &&
    sv.anzahlung_status === 'bezahlt' &&
    sv.portal_zugang_freigeschaltet === true &&
    sv.sa_vorlage_status === 'geprueft' &&
    sv.gcal_connected === true &&
    !!sv.logo_url
  )
}

/** Step-Keys analog zu STEPS_4 in WillkommenClient.tsx. */
export type OnboardingStepKey =
  | 'konditionen'
  | 'branding'
  | 'vertrag'
  | 'anzahlung'
  | 'sa_vorlage'
  | 'kalender'

/**
 * Nächster offener Step. Reihenfolge matched STEPS_4 in WillkommenClient.tsx.
 * Gibt `null` wenn alles fertig (= `isOnboardingComplete() === true`).
 */
export function getNextOnboardingStep(sv: OnboardingSv): OnboardingStepKey | null {
  if (!sv.logo_url) return 'branding'
  if (!sv.vertrag_unterschrieben) return 'vertrag'
  if (sv.anzahlung_status !== 'bezahlt' || !sv.portal_zugang_freigeschaltet) return 'anzahlung'
  if (sv.sa_vorlage_status === null || sv.sa_vorlage_status === 'zurueckgewiesen') return 'sa_vorlage'
  if (!sv.gcal_connected) return 'kalender'
  return null
}

/** URL zum /gutachter/willkommen-Wizard mit `?step=<index>` Deep-Link. */
export function getOnboardingDeepLink(sv: OnboardingSv): string {
  const STEP_INDEX: Record<OnboardingStepKey, number> = {
    konditionen: 0,
    branding: 1,
    vertrag: 2,
    anzahlung: 3,
    sa_vorlage: 4,
    kalender: 5,
  }
  const next = getNextOnboardingStep(sv)
  if (!next) return '/gutachter/willkommen'
  return `/gutachter/willkommen?step=${STEP_INDEX[next]}`
}
