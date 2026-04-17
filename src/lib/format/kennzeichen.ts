// AAR-411: Kennzeichen-Formatierung. Die ursprüngliche Implementierung
// lebte in src/lib/dispatch/fahrzeug-marken.ts und wurde hier zentralisiert.
// fahrzeug-marken.ts re-exportiert `formatKennzeichen` zur Rückwärts-
// kompatibilität.

/**
 * Formatiert ein Kennzeichen auf die Standard-Form "K-AB 1234".
 * Akzeptiert "KAB1234", "K AB 1234", "k-ab-1234" usw.
 */
export function formatKennzeichen(raw: string | null | undefined): string {
  if (!raw) return ''
  const cleaned = raw.toUpperCase().replace(/[^A-ZÄÖÜ0-9\s-]/g, '').trim()
  const compact = cleaned.replace(/[\s-]+/g, '')
  // Non-greedy auf den Stadt-Block, damit "KAB1234" als K-AB 1234 gelesen
  // wird (nicht als KA-B) und "MEIAB123" als MEI-AB 123 (Backtracking).
  const m = compact.match(/^([A-ZÄÖÜ]{1,3}?)([A-ZÄÖÜ]{1,2})(\d{1,4})$/)
  if (m) return `${m[1]}-${m[2]} ${m[3]}`
  return cleaned
}

/**
 * Maskiert ein Kennzeichen für Datenschutz-Anzeigen:
 *   "K-JB 2025" → "K-XX 25"
 * Unvollständige Kennzeichen werden so gut wie möglich maskiert.
 */
export function maskKennzeichen(raw: string | null | undefined): string {
  const formatted = formatKennzeichen(raw)
  if (!formatted) return ''
  const m = formatted.match(/^([A-ZÄÖÜ]{1,3})-([A-ZÄÖÜ]{1,2})\s(\d{1,4})$/)
  if (!m) return formatted
  const [, stadt, , zahl] = m
  // Buchstaben-Block → XX, Zahlen → letzte 2 Stellen
  const letters = 'XX'
  const shortZahl = zahl.length > 2 ? zahl.slice(-2) : zahl
  return `${stadt}-${letters} ${shortZahl}`
}
