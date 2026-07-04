// Recipient-Aufloesung fuer Email-Deliveries: primaere Login-Email + optionale
// zweite Kontakt-Adresse des Kunden (profiles.zweit_email, AAR-703). Pure/testbar,
// keine Server-Imports. Der Kunde traegt seine Zweitadresse selbst im Profil ein
// -> gewollter Kontaktkanal, kein Fremd-Empfaenger.

/**
 * Baut die Empfaenger-Liste aus primaerer + optionaler zweiter Email. Trimmt,
 * dedupt case-insensitive (kein Doppelversand wenn zweit == primaer) und laesst
 * leere Werte weg. Primaere zuerst. Leeres Array = kein Empfaenger (Caller skipt).
 */
export function buildEmailRecipients(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [primary, secondary]) {
    const value = raw?.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}
