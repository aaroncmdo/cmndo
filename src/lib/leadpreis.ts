/**
 * Leadpreis-Berechnung basierend auf Schadenhöhe (Netto-RK).
 * Paketpreis = 25% (mit Paket), Einzelpreis = 30% (ohne Paket).
 * Mindestens 200 EUR. Exakte Stufen aus der Preistabelle.
 */

// [schadenhoehe, paketpreis, einzelpreis]
const PREIS_TABELLE: [number, number, number][] = [
  [500, 200, 200],
  [750, 200, 200],
  [1000, 200, 200],
  [1250, 200, 200],
  [1500, 200, 200],
  [1750, 200, 200],
  [2000, 200, 200],
  [2500, 200, 200],
  [3000, 200, 200],
  [3500, 200, 200],
  [4000, 200, 212],
  [4500, 200, 224],
  [5000, 200, 236],
  [5500, 206, 248],
  [6000, 216, 259],
  [7000, 230, 276],
  [7500, 237, 284],
  [8000, 245, 294],
  [9000, 261, 313],
  [10000, 277, 332],
  [11000, 292, 350],
  [12000, 309, 370],
  [13000, 325, 390],
  [14000, 341, 409],
  [15000, 358, 429],
  [17500, 392, 470],
  [20000, 430, 516],
  [25000, 500, 599],
  [30000, 577, 692],
  [35000, 646, 776],
  [40000, 721, 865],
  [45000, 823, 987],
  [50000, 901, 1081],
]

/**
 * Berechnet den Leadpreis per linearer Interpolation zwischen den Stufen.
 * @param schadenhoehe Netto-Reparaturkosten in EUR
 * @param hatPaket true = Paketpreis (25%), false = Einzelpreis (30%)
 * @returns Leadpreis in EUR (gerundet auf ganze Euro)
 */
export function berechneLeadpreis(schadenhoehe: number, hatPaket: boolean): number {
  if (schadenhoehe <= 0) return 200

  const col = hatPaket ? 1 : 2

  // Below first tier
  if (schadenhoehe <= PREIS_TABELLE[0][0]) {
    return PREIS_TABELLE[0][col]
  }

  // Above last tier: extrapolate using percentage
  const last = PREIS_TABELLE[PREIS_TABELLE.length - 1]
  if (schadenhoehe >= last[0]) {
    const pct = hatPaket ? 0.25 : 0.30
    return Math.max(last[col], Math.round(schadenhoehe * pct))
  }

  // Find bracketing tiers and interpolate
  for (let i = 0; i < PREIS_TABELLE.length - 1; i++) {
    const lower = PREIS_TABELLE[i]
    const upper = PREIS_TABELLE[i + 1]

    if (schadenhoehe >= lower[0] && schadenhoehe <= upper[0]) {
      // Exact match
      if (schadenhoehe === lower[0]) return lower[col]
      if (schadenhoehe === upper[0]) return upper[col]

      // Linear interpolation
      const ratio = (schadenhoehe - lower[0]) / (upper[0] - lower[0])
      const preis = lower[col] + ratio * (upper[col] - lower[col])
      return Math.round(preis)
    }
  }

  // Fallback
  const pct = hatPaket ? 0.25 : 0.30
  return Math.max(200, Math.round(schadenhoehe * pct))
}

/** Convenience wrapper: returns preis + typ */
export function getLeadpreis(schadenshoehe: number, istImPaket: boolean): { preis: number; typ: 'paket' | 'einzel' } {
  return { preis: berechneLeadpreis(schadenshoehe, istImPaket), typ: istImPaket ? 'paket' : 'einzel' }
}

export { PREIS_TABELLE }
