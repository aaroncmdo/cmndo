/**
 * Safety gate for AI-generated legal/news content.
 * Pure function — no side effects, no imports needed.
 *
 * Check order (deterministic reason):
 *   1. laenge
 *   2. kein_paragraph
 *   3. kein_disclaimer
 *   4. az_review
 */
export function validateForAutoPublish(a: { body: string }): {
  autopublish: boolean
  reason?: string
} {
  // 1. Laenge
  if (a.body.length < 800 || a.body.length > 15000) {
    return { autopublish: false, reason: 'laenge' }
  }

  // 2. Paragraph-Beleg (§§)
  if (!/§\s?\d+/.test(a.body)) {
    return { autopublish: false, reason: 'kein_paragraph' }
  }

  // 3. Disclaimer
  if (!/keine\s+rechtsberatung/i.test(a.body)) {
    return { autopublish: false, reason: 'kein_disclaimer' }
  }

  // 4. Kein unverifizierbares Gerichts-Aktenzeichen.
  // Treffer: roemische Senate (VI ZR), arabische Straf-Senate (1 StR), Buchstaben-Suffix (VIa ZR),
  // erweiterte Register (KZR, KVR, KVZ, EnZR, EnVR, AnwZ, Ss, OWi, BvR, BvL).
  if (
    /\b([IVXLC]{1,4}[a-z]?|\d{1,2})\s+(ZR|StR|ZB|ZA|AR|KZR|KVR|KVZ|EnZR|EnVR|AnwZ|Ss|OWi|BvR|BvL)\s*(\([A-Za-z]+\))?\s+\d+\/\d{2,4}\b/.test(
      a.body,
    )
  ) {
    return { autopublish: false, reason: 'az_review' }
  }

  return { autopublish: true }
}
