// Zugriff auf die Stadt-Stammdaten im Admin-Build.
//
// Die Quelle der Wahrheit ist und bleibt
// claimondo-marketing/lib/kfz-gutachter/staedte.ts. Diese Datei liest den
// generierten Snapshot `staedte-stammdaten.json`, weil `src/` und
// `claimondo-marketing/` getrennte Next-Builds sind (src/tsconfig mappt "@/*"
// ausschliesslich auf "./src/*" — Cross-Projekt-Import ist nicht moeglich).
//
// Snapshot neu erzeugen nach jeder Aenderung an STAEDTE:
//   node scripts/build-stadt-stammdaten.mjs
// Drift-Pruefung (CI-tauglich):
//   node scripts/build-stadt-stammdaten.mjs --check

import stammdaten from './staedte-stammdaten.json'
import type { StadtKontext } from './generate'

export type StadtStammdaten = {
  slug: string
  name: string
  bundesland: string
  plzPrefix: string
  bevoelkerung: string
  lat: number
  lng: number
  landgericht: string
  amtsgericht: string
  kammer: string
  bvskHonorarSpanne: string
  /** Die 6 geografisch naechsten Stadt-Pages, im Script vorberechnet. */
  nachbarorte: string[]
}

export const STAEDTE_STAMMDATEN: StadtStammdaten[] = stammdaten as StadtStammdaten[]

/** Nachschlagen per Slug. Unbekannt -> null (der Caller entscheidet). */
export function getStadtStammdaten(slug: string): StadtStammdaten | null {
  return STAEDTE_STAMMDATEN.find((s) => s.slug === slug) ?? null
}

/**
 * Baut den Kontext, den der Generator in den Prompt haengt: die bereits
 * geprueften Fakten, damit das Modell sie nicht wiederholt und ihnen nicht
 * widerspricht.
 */
export function getStadtKontext(slug: string): StadtKontext | null {
  const s = getStadtStammdaten(slug)
  if (!s) return null
  return {
    name: s.name,
    bundesland: s.bundesland,
    plzPrefix: s.plzPrefix,
    bevoelkerung: s.bevoelkerung,
    amtsgericht: s.amtsgericht,
    landgericht: s.landgericht,
    nachbarorte: s.nachbarorte,
  }
}
