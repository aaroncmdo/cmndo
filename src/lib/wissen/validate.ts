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

  // 4. Kein unverifizierbares Gerichts-Aktenzeichen
  if (/\b[IVX]{1,4}\s+(ZR|StR|ZB|AR)\s+\d+\/\d{2}\b/.test(a.body)) {
    return { autopublish: false, reason: 'az_review' }
  }

  return { autopublish: true }
}
