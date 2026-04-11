// KFZ-200: OCR-Validierung — Levenshtein + FIN/Kennzeichen-Abgleich.

/**
 * Berechnet die Levenshtein-Edit-Distanz zwischen zwei Strings.
 * Kleinere Werte = ähnlicher.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1,     // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

export interface ValidationResult {
  match: boolean
  similarity: number  // 0..1, 1 = exact match
  editDistance: number
}

function normalize(s: string): string {
  return s.toUpperCase().replace(/[\s\-]/g, '')
}

/**
 * Validiert ob eine extrahierte FIN mit der erwarteten FIN übereinstimmt.
 * Erlaubt OCR-Fehler (Ähnlichkeit > 0.85 = match).
 */
export function validateFinMatch(extracted: string, expected: string): ValidationResult {
  const a = normalize(extracted)
  const b = normalize(expected)
  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  const similarity = maxLen === 0 ? 1 : 1 - dist / maxLen
  return {
    match: similarity >= 0.85,
    similarity,
    editDistance: dist,
  }
}

/**
 * Validiert ob ein extrahiertes Kennzeichen mit dem erwarteten übereinstimmt.
 * Erlaubt OCR-Fehler (Ähnlichkeit > 0.80 = match, da Kennzeichen kürzer sind).
 */
export function validateKennzeichenMatch(extracted: string, expected: string): ValidationResult {
  const a = normalize(extracted)
  const b = normalize(expected)
  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  const similarity = maxLen === 0 ? 1 : 1 - dist / maxLen
  return {
    match: similarity >= 0.80,
    similarity,
    editDistance: dist,
  }
}
