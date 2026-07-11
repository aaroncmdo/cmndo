export const GEWERKE = ['karosserie', 'lackierung', 'mechanik', 'glas', 'smart_repair'] as const
export type Gewerk = (typeof GEWERKE)[number]
export type BedarfQuelle = 'gutachten' | 'schadenbild' | 'kva' | 'manuell' | 'unbekannt'
export type Reparaturbedarf = { kategorien: Gewerk[]; quelle: BedarfQuelle; confidence: number }
export type Fit = 'passt' | 'passt_nicht' | 'unbekannt'
export function istGewerk(x: unknown): x is Gewerk {
  return typeof x === 'string' && (GEWERKE as readonly string[]).includes(x)
}
