/**
 * Operative Pflicht-Regeln: welches Dokument ein FAKT des Falls erzwingt.
 *
 * ANLASS (Aaron 28.08.2026): *„operativ ist entscheidend, wie wir die Pflichtfelder brauchen —
 * wenn Sachen wie ‚Polizei war vor Ort' im Flowlink gesetzt wurden, dann ist der Polizeibericht
 * Pflicht."*
 *
 * Bis dahin hing die Pflicht AUSSCHLIESSLICH am `szenario` (Phase × Szenario-Matrix). Ein
 * erhobener Fakt konnte keine Pflicht ausloesen — `conditional_on` in `onboarding_felder`
 * steuert nur die SICHTBARKEIT eines Feldes, nie seine Pflicht (`validatePhase` kann eine
 * Pflicht damit nur ab-, nie einschalten).
 *
 * ⭐ Zwei Messungen aus prod, die den Umbau tragen:
 *  1. **63 von 80 Claims tragen `szenario='normalfall'`** — ein Wert, den die Matrix gar nicht
 *     kennt. `getPflichtDokumenteFuerFall()` lieferte fuer sie in JEDER Phase eine leere Liste.
 *  2. **Das Vokabular stimmte nicht ueberein.** Die Matrix forderte `unfallbericht_polizei`,
 *     real heisst der Typ `polizeibericht`. Von allen geforderten Typen existierte genau EINER
 *     real (`fahrzeugschein`). Der Abgleich `!vorhandene.has(typ)` haette also selbst nach dem
 *     Ergaenzen von `normalfall` ALLES als fehlend gemeldet.
 *
 * Ergebnis beider Luecken: der `pflichtdokumente-reminder`-Cron laeuft alle 4 Stunden und hat
 * **noch nie** einen Task erzeugt (`task_code='dokument-hochladen'`: 0 Zeilen, seit jeher).
 */

/** Fakten, die im Flow/Onboarding erhoben werden und eine Dokumentpflicht ausloesen koennen. */
export type FallFakten = {
  polizei_vor_ort?: boolean | null
  hat_mietwagen?: boolean | null
  finanzierung_leasing?: boolean | null
  hat_sachschaden?: boolean | null
}

export type FaktenRegel = {
  /** Kurzname der Regel — erscheint in der Begruendung des Reminders. */
  id: string
  /** Trifft zu? */
  wenn: (f: FallFakten) => boolean
  /** Dann ist dieser Dokument-Typ Pflicht (KANONISCHER Typ, s. dokument-typen.ts). */
  dann: string
  /** Warum — wird dem Nutzer/Task gezeigt, damit die Forderung nachvollziehbar ist. */
  begruendung: string
}

/**
 * Bewusst KLEIN gehalten: nur Regeln, bei denen der Fakt das Dokument zweifelsfrei erzwingt
 * und der Kunde es auch liefern KANN. Eine Pflicht, die niemand erfuellen kann, blockiert den
 * Fall — dieselbe Falle wie `fahrzeugschein_foto`, das `pflicht:true` ist und nie gespeichert
 * wird (siehe audit-onboarding-fahrzeugschein-und-flowlink-felder).
 */
export const FAKTEN_REGELN: FaktenRegel[] = [
  {
    id: 'polizei-war-vor-ort',
    wenn: (f) => f.polizei_vor_ort === true,
    dann: 'polizeibericht',
    begruendung: 'Es wurde angegeben, dass die Polizei vor Ort war — der Bericht belegt den Hergang gegenüber dem Versicherer.',
  },
  {
    id: 'mietwagen-genommen',
    wenn: (f) => f.hat_mietwagen === true,
    dann: 'mietwagen_rechnung',
    begruendung: 'Ein Mietwagen wurde genutzt — ohne Rechnung erstattet der Versicherer die Kosten nicht.',
  },
  {
    id: 'fahrzeug-finanziert-oder-leasing',
    wenn: (f) => f.finanzierung_leasing === true,
    dann: 'leasingvertrag',
    begruendung: 'Das Fahrzeug ist finanziert oder geleast — der Vertrag klärt, wem die Entschädigung zusteht.',
  },
]

/**
 * Welche Dokumente die erhobenen Fakten zusaetzlich zur Szenario-Matrix erzwingen.
 * Reine Funktion, keine DB — damit in beiden Consumern (Cron + Sidebar) identisch.
 */
export function pflichtAusFakten(fakten: FallFakten | null | undefined): FaktenRegel[] {
  if (!fakten) return []
  return FAKTEN_REGELN.filter((r) => r.wenn(fakten))
}
