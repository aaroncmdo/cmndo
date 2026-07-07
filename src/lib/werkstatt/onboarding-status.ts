// Reine Ableitung des Werkstatt-Onboarding-Status fuer die Admin-Detailseite.
// Aus drei Signalen: hat der Account ueberhaupt einen Login, wurde das Passwort
// schon gesetzt (force_password_change), und hat sich die Werkstatt schon mal
// eingeloggt (last_sign_in_at). Pure + testbar.

export type OnboardingTon = 'neutral' | 'info' | 'success' | 'warning'

export interface OnboardingStatus {
  key: 'kein_login' | 'aktiv' | 'eingeladen' | 'bereit'
  label: string
  ton: OnboardingTon
}

export function leiteOnboardingStatus(input: {
  hatLogin: boolean
  forcePasswordChange: boolean | null
  lastSignInAt: string | null
}): OnboardingStatus {
  if (!input.hatLogin) {
    return { key: 'kein_login', label: 'Kein Login-Account', ton: 'warning' }
  }
  if (input.lastSignInAt) {
    return { key: 'aktiv', label: 'Aktiv — bereits eingeloggt', ton: 'success' }
  }
  if (input.forcePasswordChange) {
    return { key: 'eingeladen', label: 'Eingeladen — Passwort noch nicht gesetzt', ton: 'info' }
  }
  return { key: 'bereit', label: 'Login bereit — noch nicht eingeloggt', ton: 'neutral' }
}
