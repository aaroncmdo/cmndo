// SSoT: erkennt interne/Test-Identitaeten (Leads/Kunden), damit Test-/interne Buchungen
// NIE einen echten Sachverstaendigen erreichen (buchen ODER benachrichtigen) — und umgekehrt.
//
// Hintergrund (2026-07-03): Der einzige echte aktive SV (UnfallSafe/Koeln) bekam laufend
// Test-Termine + Nachrichten, weil die Gruender den Live-Funnel mit ihren eigenen
// @claimondo.de-Adressen (aaron.sprafke@, info@) testen und das Matching keinen
// Testdaten-Filter hatte. Deshalb zaehlt die FIRMENDOMAIN @claimondo.de hier bewusst als
// "intern" (Aaron-Entscheid).
//
// ACHTUNG — NICHT verwechseln mit dem Test-ACCOUNT-Filter in
// src/lib/start-link/pick-dispatcher.ts: dort ist dispatch@claimondo.de ein ECHTER interner
// Dispatcher (kein Test). Hier geht es um die Identitaet eines LEADS/Kunden — und ein Lead
// mit @claimondo.de ist niemals ein echter externer Kunde, sondern intern/Test.

// Firmen- + Test-Domains: ein Lead mit dieser Domain ist nie ein echter externer Kunde.
// + RFC-2606-Test-Domains (example.*) und lex-drive.com (Related-Company, Gruender-Tests) —
// Prod-Audit 04.07.2026: diese Test-Leads rutschten sonst als "extern" durch (False-Negatives).
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

/** Filtert eine Empfaenger-Liste (string | string[]) auf die NICHT-internen Adressen. */
export function nurExterneEmpfaenger(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to]
  return list.filter((r): r is string => !!r && !istInterneEmail(r))
}

// Operative Betriebs-Inboxen: reine Team-/Funktions-Postfaecher, die als GEWOLLTE Zielperson
// operativer Alerts/Handoffs dienen (Team-Lead-Alert, Embed-Dispatch-Benachrichtigung,
// Kanzlei-Mandat-Fallback). Sie sind NIE Matching-Ziele (kein SV im Kandidaten-Pool) -> beim
// SENDEN duerfen sie erreicht werden, auch als @claimondo.de-Adresse.
//
// ⚠ NUR fuer die Send-Isolation (nurZustellbareEmpfaenger). Fuer die LEAD-IDENTITAET (Matching)
// bleibt @claimondo.de weiter intern (istInterneEmail bewusst unveraendert) — ein Lead mit
// info@ ist Test/intern. Founder-Adressen (aaron@/aaron.sprafke@) stehen bewusst NICHT hier:
// sie sind Dual-Use (auch Test-Lead-Mail) -> deren Alerts brauchen den per-call
// allowInternalRecipient, nicht die pauschale Allowlist.
const OPERATIVE_EMPFAENGER = new Set<string>([
  'info@claimondo.de',
  'schaden@claimondo.de', // kanzlei/email-fallback: geplantes Migrations-Ziel (KANZLEI_EMAIL_TO)
])

/** true, wenn die Adresse eine operative Betriebs-Inbox ist (Send-Allowlist, s.o.). */
export function istOperativerEmpfaenger(email: string | null | undefined): boolean {
  if (!email) return false
  return OPERATIVE_EMPFAENGER.has(email.trim().toLowerCase())
}

/**
 * Fuer die SEND-Isolation: behaelt die ZUSTELLBAREN Empfaenger = extern ODER operative
 * Betriebs-Inbox. Unterschied zu nurExterneEmpfaenger (das operative Inboxen als intern
 * wegfiltern wuerde): operative Inboxen sind gewollte Alert-Ziele, keine Matching-Bystander.
 */
export function nurZustellbareEmpfaenger(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to]
  return list.filter((r): r is string => !!r && (!istInterneEmail(r) || istOperativerEmpfaenger(r)))
}

/**
 * Letzte 9 Ziffern einer Telefonnummer (formatunabhaengig) — robuster Match-Key gegen
 * Schreibweisen (+49 / 0049 / 0-Praefix / Leerzeichen). Leerer String bei < 9 Ziffern
 * (zu kurz -> kein verlaesslicher Match, lieber nicht suppressen).
 */
export function letzte9Ziffern(telefon: string | null | undefined): string {
  const digits = (telefon ?? '').replace(/[^0-9]/g, '')
  return digits.length >= 9 ? digits.slice(-9) : ''
}
