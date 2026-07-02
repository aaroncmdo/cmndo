export const B2B_TAGS = [
  'Schadenregulierung',
  'Recht & Urteile',
  'Gutachten',
  'Werkstatt',
  'Versicherer',
  'Markt & News',
  'Tools',
] as const

export type B2BTag = (typeof B2B_TAGS)[number]

/**
 * Prueft ob ein String ein gueltiger B2B-Community-Tag ist.
 * Pure Funktion — kein DB-Call, direkt testbar.
 */
export function isValidTag(t: string): t is B2BTag {
  return (B2B_TAGS as readonly string[]).includes(t)
}
