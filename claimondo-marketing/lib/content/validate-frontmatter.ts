import type { ClaimondoAsset } from './claimondo-mdx'

/**
 * Build-/Test-Validator für die Feed-Pflichtfelder excerpt + keyFacts
 * (geo-feeds-spec §1). Wird vom Test src/lib/feed/__tests__/feed-frontmatter.test.ts
 * über alle Assets gefahren — schlägt rot an, wenn ein MDX-Asset die Felder nicht
 * (oder außerhalb der Längen-Ranges) hat.
 */
export function validateAsset(a: ClaimondoAsset): string[] {
  const errors: string[] = []
  const file = a.filePath

  if (!a.excerpt || a.excerpt.length < 100 || a.excerpt.length > 600) {
    errors.push(`${file}: excerpt fehlt oder außerhalb 100–600 Zeichen (ist: ${a.excerpt?.length ?? 0})`)
  }
  if (!a.keyFacts || a.keyFacts.length < 3 || a.keyFacts.length > 6) {
    errors.push(`${file}: keyFacts muss 3–6 Einträge haben (ist: ${a.keyFacts?.length ?? 0})`)
  }
  for (const fact of a.keyFacts ?? []) {
    if (fact.length < 20 || fact.length > 150) {
      errors.push(`${file}: keyFact außerhalb 20–150 Zeichen: "${fact.slice(0, 40)}…" (${fact.length})`)
    }
  }
  return errors
}
