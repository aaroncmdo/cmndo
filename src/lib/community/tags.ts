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

export function isValidTag(t: string): t is B2BTag {
  return (B2B_TAGS as readonly string[]).includes(t)
}
