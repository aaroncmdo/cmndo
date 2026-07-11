import type { Gewerk } from './types'

export type GutachtenZeiten = {
  zeit_kar_std: number | string | null | undefined
  zeit_lack_std: number | string | null | undefined
  zeit_ak_std: number | string | null | undefined
}
const num = (x: number | string | null | undefined): number => {
  const n = typeof x === 'string' ? parseFloat(x) : x
  return Number.isFinite(n as number) ? (n as number) : 0
}

/**
 * Bedarf aus den strukturierten Gutachten-Stunden (gutachten_zeit_*). Rein.
 * VERIFIZIEREN: zeit_ak_std-Semantik gegen src/lib/ai/gutachten-ocr.ts System-Prompt
 * (AK = Arbeit/Mechanik?). glas/smart_repair stehen NICHT in den Stunden -> kommen
 * ueber den Foto-Pfad oder bleiben unbekannt (bewusst).
 */
export function deriveGewerkeAusGutachten(g: GutachtenZeiten): Gewerk[] {
  const out: Gewerk[] = []
  if (num(g.zeit_kar_std) > 0) out.push('karosserie')
  if (num(g.zeit_lack_std) > 0) out.push('lackierung')
  if (num(g.zeit_ak_std) > 0) out.push('mechanik')
  return out
}
