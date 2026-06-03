// AAR-467 C1: Promo-Code-Attribution für den Kunden-Flow.
//
// 15.05.2026: Cookie-Layer komplett entfernt. Drei verschiedene CMM-14-
// Crashes auf /schaden-melden (Sentry NEXTJS-8/9 + Digests 890686022,
// 2237539019, 2740258766) haben gezeigt, dass cookies().set() im Server-
// Component-Render-Pfad in Next 16+ deterministisch crasht — selbst über
// 'use server'-Wrapper (PR #1308) oder Client-useEffect (PR #1319) bleiben
// Quellen. Da der Cookie ohnehin NUR für die jeweilige Anlage gelesen wurde
// (keine Cross-Session-Persistenz), transportieren wir den Promo-Code jetzt
// direkt im Mini-Wizard-Form (hidden field → FormData → Server-Action).
// readPromoCookie + writePromoCookie + clearPromoCookie entfernt;
// promo-cookie-action.ts gelöscht. Nur der Format-Validator bleibt.

/**
 * Validiert das Promo-Code-Format (Muster `MK-` + 4 Zeichen [A-Z0-9]).
 * Wird im page.tsx beim Pickup aus der URL, im Zod-Schema des Wizards und
 * als Defense-in-Depth in createLeadFromMiniWizard verwendet.
 */
export function isValidPromoCodeFormat(code: string): boolean {
  return /^MK-[A-Z0-9]{4}$/.test(code)
}
