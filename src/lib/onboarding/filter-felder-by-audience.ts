import type { OnboardingFeld } from '@/components/onboarding/types'

// audience-Default = 'beide' (fehlt das Feld in der DB-Zeile -> beide Renderer sehen es).
export function filterFelderByAudience(
  felder: OnboardingFeld[],
  audience: 'kunde' | 'dispatcher',
): OnboardingFeld[] {
  return felder.filter((f) => {
    const a = (f as OnboardingFeld & { audience?: string }).audience ?? 'beide'
    return a === 'beide' || a === audience
  })
}
