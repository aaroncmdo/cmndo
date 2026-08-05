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

/**
 * Ableiter-Vereinheitlichung (Problem B): spiegelt die DB-Funktion derive_abrechnungsweg EXAKT
 * (Mig 20260804161329), damit die gespeicherte Spalte (der convert schreibt sie) und die 3 Views
 * (v_claim_base/-phase/-werkstatt_auftrag berechnen sie neu) NIE divergieren. Unterschied zu
 * resolveAbrechnungsweg: + schadenart-Fallback (schuldfrage fehlt, schadenart='haftpflicht'
 * -> haftpflicht). service_typ ist bewusst KEIN Input — der frühere nur_gutachter-Sonderfall
 * ('nicht_zutreffend') wurde entfernt: abrechnungsweg = Schaden-Natur, unabhängig vom Service-Umfang.
 * ⚠ MUSS logikgleich zur DB-Funktion bleiben (Unit-Test deckt die Matrix ab).
 */
export function deriveAbrechnungsweg(args: {
  schuldfrage: string | null
  eigeneVersicherung: string | null
  schadenart: string | null
}): Abrechnungsweg | null {
  if (args.schuldfrage === 'gegner') return 'haftpflicht'
  if (args.schuldfrage === 'eigenverantwortung') {
    if (args.eigeneVersicherung === 'ja') return 'kasko'
    if (args.eigeneVersicherung === 'nein') return 'selbstzahler'
    return null
  }
  if (args.schuldfrage == null && args.schadenart === 'haftpflicht') return 'haftpflicht'
  return null
}

/**
 * Fallback-Quali aus der Versicherungs-Klassifikation `schadens_art`, für Entry-Points, die
 * schadens_art erheben, aber NICHT schuldfrage/eigene_versicherung (kunde/schaden-melden,
 * admin/faelle/anlegen). Ohne sie erzeugen diese beim Sofort-Convert einen wegs-losen Claim
 * (abrechnungsweg=null), weil resolveAbrechnungsweg (Spalte) UND derive_abrechnungsweg (DB-Views)
 * nur aus schuldfrage+eigene_versicherung ableiten. Wir leiten die QUALI-Achse ab (nicht
 * abrechnungsweg direkt) und schreiben sie auf den LEAD -> beide Ableiter, die lead.schuldfrage
 * lesen, bleiben konsistent (kein Spalte-vs-View-Drift).
 *   haftpflicht         -> gegner                          => haftpflicht
 *   vollkasko/teilkasko -> eigenverantwortung + eigene VS  => kasko
 *   eigenverschulden    -> eigenverantwortung ohne VS      => selbstzahler
 *   unbekannt / sonst   -> null (ehrlich offen; Fall bleibt wegs-los bis Quali)
 */
export function qualiAusSchadensart(schadensArt: string | null | undefined): {
  schuldfrage: 'gegner' | 'eigenverantwortung'
  eigeneVersicherung: 'ja' | 'nein' | null
} | null {
  switch (schadensArt) {
    case 'haftpflicht':
      return { schuldfrage: 'gegner', eigeneVersicherung: null }
    case 'vollkasko':
    case 'teilkasko':
      return { schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'ja' }
    case 'eigenverschulden':
      return { schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'nein' }
    default:
      return null
  }
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

/**
 * WS2 (Reduced-Repair): Ist es ein Werkstatt-Reparatur-Claim (Selbstzahler ODER Kasko mit freier
 * Werkstattwahl)? -> reduzierter Stepper + Werkstatt-Vermittlung; SV/Gutachten/Regulierung entfallen.
 * Kasko-gebunden (freieWerkstattwahl===false) wird schon im Quali disqualifiziert und konvertiert nie
 * -> ein kasko-CLAIM ist implizit freie Wahl; null/undefined/true zaehlen als Werkstatt-Strecke, nur
 * explizites false schliesst aus. Verallgemeinert istReparaturOnly (das nur 'selbstzahler' kennt).
 */
export function istWerkstattReparaturWeg(
  abrechnungsweg: string | null,
  freieWerkstattwahl?: boolean | null,
): boolean {
  if (abrechnungsweg === 'selbstzahler') return true
  if (abrechnungsweg === 'kasko') return freieWerkstattwahl !== false
  return false
}
