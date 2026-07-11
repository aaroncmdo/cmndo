import type { Reparaturbedarf } from './types'
import { deriveGewerkeAusGutachten } from './gutachten-gewerke'
import type { GutachtenZeiten } from './gutachten-gewerke'
import { klassifiziereSchadenbild } from './schadenbild-gewerke'

export const MANUELL_CONFIDENCE = 40

/** Rein/testbar: waehlt die staerkste Evidenz (Eskalation: gutachten > schadenbild > manuell > unbekannt). */
export async function waehleBedarf(inputs: {
  gutachtenZeiten: { zeit_kar_std: unknown; zeit_lack_std: unknown; zeit_ak_std: unknown } | null
  fotoUrls: string[]
  manuell: string[] | null
}): Promise<Reparaturbedarf> {
  // 1. Gutachten (confidence 100, hoechste Evidenz)
  if (inputs.gutachtenZeiten) {
    const kategorien = deriveGewerkeAusGutachten(inputs.gutachtenZeiten as GutachtenZeiten)
    if (kategorien.length) return { kategorien, quelle: 'gutachten', confidence: 100 }
  }

  // 2. Schadenbild-KI (model confidence)
  if (inputs.fotoUrls.length) {
    const { kategorien, confidence } = await klassifiziereSchadenbild(inputs.fotoUrls)
    if (kategorien.length) return { kategorien, quelle: 'schadenbild', confidence }
  }

  // 3. Manuell (confidence 40)
  const manuell = (inputs.manuell ?? []).filter(Boolean)
  if (manuell.length) return { kategorien: manuell as never, quelle: 'manuell', confidence: MANUELL_CONFIDENCE }

  // 4. Unbekannt
  return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
}
