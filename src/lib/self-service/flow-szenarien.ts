// Der pure Kern des DB-getriebenen FlowLinks (Aaron 14.07.: "das soll komplett db driven sein, damit
// es wiederverwendbar ist — wenn wir Weichen da reinbauen, passt es nicht, falls etwas dazukommt oder
// weggeht").
//
// Die DATEN (welche Szenarien, welche Steps, welche Bedingungen) liegen in `flow_szenarien` +
// `flow_szenario_steps`. Die LOGIK (matchen, auswerten, filtern) liegt HIER — pure, client-safe und
// vitest-getestet. So bleibt die Matrix ohne Deploy aenderbar, ohne dass wir Typsicherheit und
// Testbarkeit verlieren.
//
// Verallgemeinert das bestehende conditional_on-Muster (onboarding_felder) von den FELDERN auf die STEPS.

export type FlowSzenario = {
  id: string
  bezeichnung: string
  /** NULL = Wildcard (Bedingung egal) */
  schuldfrage: string | null
  eigene_versicherung: string | null
  service_typ: string | null
  feststellung_zweig: 'unfall' | 'schaden'
  /** Hoehere Prioritaet gewinnt -> das spezifischere Szenario schlaegt das allgemeinere. */
  prioritaet: number
}

export type FlowSzenarioStep = {
  szenario_id: string
  step_id: string
  reihenfolge: number
  /** NULL = immer sichtbar. Sonst ein Praedikat auf dem Lead-Zustand (s. erfuelltBedingung). */
  bedingung: Record<string, unknown> | null
  /**
   * Operative Rohspalten, die dieser Step einsammelt. Der Step bleibt sichtbar, solange
   * MINDESTENS EINE davon leer ist (s. erhebtNoch). Leer/fehlend = kein Erhebungs-Gate.
   * NUR Rohspalten (kein DB-Default, kein *_effektiv) — der check:flow-erhebt-felder-Ratchet
   * erzwingt das. Trennt Erhebungs-Vollstaendigkeit (hier) von Zustaendigkeit (bedingung).
   */
  erhebt_felder?: string[] | null
  aktiv?: boolean
}

/** Der Lead-Zustand, gegen den Bedingungen ausgewertet werden (inkl. abgeleiteter Felder). */
export type FlowKontext = Record<string, unknown>

/**
 * Leer heisst: null, undefined oder Leerstring.
 * `false` und `0` sind WERTE, keine Leerwerte — sonst wuerde `freie_werkstattwahl=false`
 * (werkstattgebunden!) faelschlich als "noch nicht beantwortet" gelten.
 */
function istLeer(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/**
 * Wertet eine Step-Bedingung gegen den Lead-Zustand aus.
 *
 *   null                 -> immer sichtbar
 *   {"feld": null}       -> sichtbar, wenn das Feld LEER ist        (z.B. termin nur ohne SV)
 *   {"feld": "$gesetzt"} -> sichtbar, wenn das Feld GESETZT ist
 *   {"feld": "wert"}     -> sichtbar bei Gleichheit
 *   {"feld": ["a","b"]}  -> sichtbar, wenn das Feld einer der Werte ist
 *   mehrere Keys         -> UND
 */
export function erfuelltBedingung(
  bedingung: Record<string, unknown> | null | undefined,
  kontext: FlowKontext,
): boolean {
  if (!bedingung) return true

  return Object.entries(bedingung).every(([feld, erwartet]) => {
    const ist = kontext[feld]
    if (erwartet === null) return istLeer(ist)
    if (erwartet === '$gesetzt') return !istLeer(ist)
    if (Array.isArray(erwartet)) return erwartet.includes(ist as never)
    return ist === erwartet
  })
}

/**
 * Erhebungs-Gate: true, solange der Step noch operative Daten braucht (>=1 gelistetes Feld leer)
 * oder gar keine erhebt_felder traegt. Gegenstueck zu erfuelltBedingung (Zustaendigkeit).
 * `istLeer`-Semantik: false/0 sind WERTE (ein beantwortetes bool-Feld gilt als erhoben).
 */
export function erhebtNoch(felder: string[] | null | undefined, kontext: FlowKontext): boolean {
  if (!felder || felder.length === 0) return true
  return felder.some((f) => istLeer(kontext[f]))
}

/**
 * Welches Szenario greift? Ein Szenario matcht, wenn ALLE seiner gesetzten Bedingungen
 * (schuldfrage/eigene_versicherung/service_typ) zum Lead passen; NULL ist ein Wildcard.
 * Bei mehreren Treffern gewinnt die hoechste Prioritaet (= das spezifischere Szenario).
 *
 * Die "scharfe Kante": `eigenverantwortung` OHNE `eigene_versicherung` matcht weder kasko noch
 * selbstzahler -> es faellt auf `unqualifiziert` zurueck, und der Quali-Step holt die Frage nach.
 * Genau das verhindert, dass so ein Lead still disqualifiziert wird.
 */
export function matcheSzenario(
  szenarien: FlowSzenario[],
  kontext: FlowKontext,
): FlowSzenario | null {
  const passend = szenarien.filter(
    (s) =>
      (s.schuldfrage === null || s.schuldfrage === kontext.schuldfrage) &&
      (s.eigene_versicherung === null || s.eigene_versicherung === kontext.eigene_versicherung) &&
      (s.service_typ === null || s.service_typ === kontext.service_typ),
  )
  if (passend.length === 0) return null

  return passend.reduce((beste, s) => (s.prioritaet > beste.prioritaet ? s : beste))
}

/**
 * Die aktiven Steps des Szenarios, in Reihenfolge — nach Auswertung der Bedingungen.
 * Damit sind auch die dynamischen Weichen ("Termin-Step nur ohne SV", "Werkstatt-Step nur ohne
 * Werkstatt") Daten statt Code.
 */
export function berechneAktiveSteps(
  steps: FlowSzenarioStep[],
  szenarioId: string,
  kontext: FlowKontext,
): string[] {
  return steps
    .filter((s) => s.szenario_id === szenarioId && s.aktiv !== false)
    .sort((a, b) => a.reihenfolge - b.reihenfolge)
    .filter((s) => erfuelltBedingung(s.bedingung, kontext))
    .filter((s) => erhebtNoch(s.erhebt_felder, kontext))
    .map((s) => s.step_id)
}
