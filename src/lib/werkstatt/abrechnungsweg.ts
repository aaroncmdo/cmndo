// Reine, client-safe Routing-Logik fuer die 3 Abrechnungswege der
// Werkstatt-Finder-Anfrage (SP-A Fundament). KEINE Server-/DB-Imports — damit
// sie auch im Client-Bundle (Flow-Weiche) importierbar bleibt. Konsumenten:
// SP-B (Flow-Weiche: Frage -> Route + partieller Claim) und SP-D (Reparatur-Stepper).

export type Abrechnungsweg = 'haftpflicht' | 'kasko' | 'selbstzahler'
export type SchadenRoute = 'kanonisch' | 'kasko_hinweis' | 'selbstzahler_reparatur'

/**
 * Leitet den Abrechnungsweg aus der Qualifikation ab:
 * - schuldfrage='gegner'                                     -> haftpflicht (Gegner-VS reguliert, § 249)
 * - schuldfrage='eigenverantwortung' + eigene Versicherung   -> kasko
 * - schuldfrage='eigenverantwortung' ohne eigene Versicherung -> selbstzahler
 * - alles andere / Frage offen                               -> null (der Flow fragt nach)
 *
 * `gegner` dominiert: die Versicherungsfrage ist dann irrelevant (Gegner zahlt).
 */
export function resolveAbrechnungsweg(args: {
  schuldfrage: string | null
  ueberEigeneVersicherung: boolean | null
}): Abrechnungsweg | null {
  if (args.schuldfrage === 'gegner') return 'haftpflicht'
  if (args.schuldfrage === 'eigenverantwortung') {
    if (args.ueberEigeneVersicherung === true) return 'kasko'
    if (args.ueberEigeneVersicherung === false) return 'selbstzahler'
    return null // Versicherungsfrage noch offen -> Flow fragt nach
  }
  return null
}

/** Route pro Abrechnungsweg — steuert die Flow-Weiche (SP-B). */
export function routeForAbrechnungsweg(weg: Abrechnungsweg): SchadenRoute {
  switch (weg) {
    case 'haftpflicht':
      return 'kanonisch'
    case 'kasko':
      return 'kasko_hinweis'
    case 'selbstzahler':
      return 'selbstzahler_reparatur'
  }
}

/**
 * Ist es ein Reparatur-only-Claim (Selbstzahler)? -> reduzierter Stepper;
 * SV/Gutachten/Regulierung entfallen. Nimmt `string | null` (roher DB-Wert),
 * damit Consumer die Spalte direkt reinreichen koennen.
 */
export function istReparaturOnly(abrechnungsweg: string | null): boolean {
  return abrechnungsweg === 'selbstzahler'
}
