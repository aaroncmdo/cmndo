// Sanity-Guards gegen halluzinierte / inkonsistente Vision-Werte. Ein Modell-Ausreisser
// (z. B. 500.000 EUR Reparatur an einem Kleinwagen, oder min > max) darf keine unsinnige
// Ersteinschaetzung erzeugen. Reine Funktion -> vollstaendig testbar, aufgerufen in parseVision.

// Plausible Grenzen fuer eine PKW-Reparaturkosten-Schaetzung (Brutto). Bewusst grosszuegig:
// es geht nur darum, offensichtlichen Muell zu klemmen, nicht um fachliche Feinjustierung.
export const REPARATUR_MIN_FLOOR_EUR = 50
export const REPARATUR_MAX_CAP_EUR = 150_000

/**
 * Normalisiert eine Reparaturkosten-Spanne:
 * - ungueltige Zahlen (NaN/Infinity) -> Floor
 * - negative Werte -> Betrag
 * - min > max -> tauschen
 * - auf [FLOOR, CAP] klemmen und Konsistenz (min <= max) sicherstellen
 * Gibt gerundete Ganzzahl-Eurobetraege zurueck.
 */
function coerce(n: number): number {
  if (n === Number.POSITIVE_INFINITY) return REPARATUR_MAX_CAP_EUR // "zu hoch" -> Cap
  if (Number.isNaN(n) || n === Number.NEGATIVE_INFINITY) return REPARATUR_MIN_FLOOR_EUR
  return Math.abs(n)
}

export function plausibilisiereReparaturKosten(
  rohMin: number,
  rohMax: number,
): { min: number; max: number } {
  let min = coerce(rohMin)
  let max = coerce(rohMax)

  if (min > max) [min, max] = [max, min]

  const klemme = (n: number) => Math.min(Math.max(n, REPARATUR_MIN_FLOOR_EUR), REPARATUR_MAX_CAP_EUR)
  min = klemme(min)
  max = klemme(max)
  if (min > max) min = max

  return { min: Math.round(min), max: Math.round(max) }
}
