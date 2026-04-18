// AAR-361: Rollen-basierte Redirect-Ziele an EINER Stelle zentralisiert.
// Vorher war das Mapping an 4 Stellen dupliziert (login/actions.ts,
// login/LoginClient.tsx, passwort-aendern/page.tsx, 2fa/TwoFaClient.tsx) —
// und an jeder Stelle fehlte 'dispatch', was nach 2FA zu einem Redirect-
// Loop führte: router.push('/') → / → /login → Middleware → /login/2fa →
// User zweimal eingeloggt.

export type Rolle =
  | 'admin'
  | 'kundenbetreuer'
  | 'dispatch'
  | 'sachverstaendiger'
  | 'kunde'
  | 'kanzlei'
  | 'makler'
  | string

export function roleToPath(rolle: Rolle | null | undefined): string {
  switch (rolle) {
    case 'sachverstaendiger':
      return '/gutachter'
    case 'kunde':
      return '/kunde'
    case 'dispatch':
      return '/dispatch/dashboard'
    // AAR-462 F4: Makler-Portal bekommt eigenen Einstiegspunkt. Rolle
    // kommt aus AAR-461 F3 (user_role-Enum-Erweiterung).
    case 'makler':
      return '/makler'
    case 'kundenbetreuer':
    case 'admin':
    case 'kanzlei':
      return '/admin'
    default:
      return '/admin'
  }
}
