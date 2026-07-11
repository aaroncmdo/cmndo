import type { Gewerk, Fit } from './types'

/** 3-Zustand: leere Faehigkeiten = unbekannt (NICHT "kann alles"). Bedarf = Menge (alle noetig). */
export function computeFit(faehigkeiten: Gewerk[] | string[] | null | undefined, bedarf: Gewerk[]): Fit {
  if (bedarf.length === 0) return 'unbekannt'
  if (!faehigkeiten || faehigkeiten.length === 0) return 'unbekannt'
  const set = new Set(faehigkeiten as string[])
  return bedarf.every((b) => set.has(b)) ? 'passt' : 'passt_nicht'
}
