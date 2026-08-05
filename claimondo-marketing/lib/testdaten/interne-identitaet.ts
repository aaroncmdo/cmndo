// SCHLANKER SPIEGEL von src/lib/testdaten/interne-identitaet.ts (Haupt-App) — nur die
// Identitaets-Checks (istInterneEmail/istInterneIdentitaet); die Send-Isolation-Helfer
// (nurZustellbareEmpfaenger etc.) braucht die Marketing-App nicht. Aenderungen an den
// Domain-/Marker-Listen IMMER in beiden Files nachziehen.
//
// SSoT-Zweck: erkennt interne/Test-Identitaeten, damit Test-Registrierungen/-Buchungen
// keine echten Team-/SV-Benachrichtigungen ausloesen. Die FIRMENDOMAIN @claimondo.de
// zaehlt bewusst als "intern" (Aaron-Entscheid 2026-07-03 — Gruender testen den
// Live-Funnel mit eigenen Adressen).

// Firmen- + Test-Domains: ein Lead mit dieser Domain ist nie ein echter externer Kunde.
const INTERNE_DOMAINS = new Set([
  'claimondo.de', 'claimondo.test', 'claimondo-test.de',
  'example.com', 'example.org', 'example.net', 'example.de',
  'lex-drive.com',
])

// Test-/Smoke-/E2E-Marker als BEGRENZTES Token (an Wortgrenze) — verhindert False-Positives
// wie "testarossa@ferrari.de", "contest@web.de" oder "qadir@gmail.com".
const TEST_MARKER = /(^|[.+_-])(test|smoke|e2e)([.+_@-]|$)/i

// Offensichtliche Platzhalter-Namen (Formular-Fuellungen), auch bei externer Email.
const PLATZHALTER_NAME = /mustermann|max\s+muster|test\s*test/i

function domainVon(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  return email.slice(at + 1)
}

/** true, wenn die Email zu einer internen/Test-Identitaet gehoert (Firmendomain oder Test-Marker). */
export function istInterneEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.trim().toLowerCase()
  const domain = domainVon(e)
  if (!domain) return false
  if (INTERNE_DOMAINS.has(domain)) return true
  if (TEST_MARKER.test(e)) return true
  return false
}

/** true, wenn Email ODER Name auf eine interne/Test-Identitaet hindeutet. */
export function istInterneIdentitaet(
  email?: string | null,
  name?: string | null,
): boolean {
  if (istInterneEmail(email)) return true
  if (name && PLATZHALTER_NAME.test(name)) return true
  return false
}
