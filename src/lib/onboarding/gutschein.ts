// SV-Onboarding-Gutscheincodes: erlauben, den Stripe-Anzahlungs-Schritt zu
// ueberspringen (Deposit wird als bezahlt markiert, der SV kommt durchs Gate).
//
// SERVER-ONLY: Diese Datei darf NIE in eine Client-Component importiert werden
// (sonst landet der Code-Klartext im Client-Bundle und ist oeffentlich lesbar).
// Nur der Server-Action-Pfad (einloeseGutscheincode in sv-onboarding-actions)
// importiert sie. Bewusst KEIN 'use server' — so ist die pure Funktion normal
// exportierbar + unit-testbar (Server-Actions duerfen keine Konstanten/Funktionen
// als Werte exportieren, s. AGENTS.md §server-actions).
//
// Codes kommen aus ENV (SV_ONBOARDING_GUTSCHEIN_CODES, komma-separiert) mit
// einem Default, damit das Feature ohne Env-Setup sofort funktioniert und in
// Prod ueber die Env rotierbar bleibt (ohne Code-Redeploy).

const DEFAULT_CODES = ['neuerclaimondogutachter2026!']

function ladeCodes(): string[] {
  const raw = process.env.SV_ONBOARDING_GUTSCHEIN_CODES
  if (!raw) return DEFAULT_CODES
  const codes = raw.split(',').map((c) => c.trim()).filter(Boolean)
  return codes.length > 0 ? codes : DEFAULT_CODES
}

/**
 * Prueft, ob `eingabe` ein gueltiger Onboarding-Gutscheincode ist.
 * Case-sensitive + getrimmt — Codes sind Geheimnisse, kein Fuzzy-Match.
 */
export function istGueltigerGutschein(eingabe: string | null | undefined): boolean {
  const norm = (eingabe ?? '').trim()
  if (!norm) return false
  return ladeCodes().some((c) => c === norm)
}
