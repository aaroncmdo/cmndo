// Ops-Test 11.08. (#11): „unfallskizze generieren fehlt".
//
// Der Generator (generate.ts, AAR-317) existiert seit Langem, war aber NUR im Dispatch-
// Portal verdrahtet (dispatch/leads/[id]/_actions/unfallskizze.ts). Ein Kunde, der seinen
// Unfallhergang im Flow beschreibt, erzeugte damit nie eine Skizze — sie entstand erst,
// wenn ein Mitarbeiter sie manuell anstiess.
//
// Diese Regel entscheidet, ob der Flow-Save eine Skizze generieren soll. Sie ist pure,
// weil an ihr drei Dinge haengen, die man nicht raten will: API-Kosten, doppelte
// Generierung und Muell-Skizzen aus zu duennem Text.
//
// ⚠ KEINE Abhaengigkeit zum Unfallort: `generateUnfallskizze` nimmt ausschliesslich
// `unfallhergang` + `schadentyp` + `gegnerFahrzeugtyp` — alles Text. Die Plan-Annahme
// „Skizze braucht Koordinaten (D1 entsperrt D2)" trug nicht.

/**
 * Kuerzester Hergang, aus dem eine sinnvolle Skizze entstehen kann.
 *
 * Der System-Prompt zeichnet bei leerem/widerspruechlichem Text eine generische
 * Auffahrunfall-Darstellung. Genau das wollen wir NICHT teuer erzeugen: eine Skizze,
 * die nichts ueber diesen Unfall aussagt, ist schlechter als keine — sie sieht nach
 * Information aus. 20 Zeichen lassen „Von hinten aufgefahren" (22) durch und stoppen
 * Fragmente wie „Unfall" oder „k.A.".
 */
export const MIN_HERGANG_LAENGE = 20

export type SkizzeTriggerInput = {
  /** Wert von `unfallhergang` in DIESEM Save — undefined, wenn nicht mitgeschickt. */
  hergangImSave: unknown
  /** Bereits gespeicherte Skizze (leads.unfallskizze_svg). */
  vorhandeneSkizze: string | null
}

/**
 * PURE: Soll dieser Save eine Unfallskizze erzeugen?
 *
 * Drei Bedingungen, jede aus einem konkreten Grund:
 *  1. Der Hergang kam in DIESEM Save vor — sonst liefe bei jedem Wizard-Schritt ein
 *     Claude-Call, obwohl sich am Text nichts geaendert hat.
 *  2. Er ist lang genug (s. MIN_HERGANG_LAENGE).
 *  3. Es gibt noch keine Skizze — die vorhandene kann bereits von Dispatch freigegeben
 *     oder abgelehnt worden sein; ein stilles Ueberschreiben wuerde diese Entscheidung
 *     verwerfen. Neu-Generieren bleibt der explizite Dispatch-Weg (clearSkizze).
 */
export function sollSkizzeGenerieren(input: SkizzeTriggerInput): boolean {
  if (typeof input.hergangImSave !== 'string') return false
  if (input.hergangImSave.trim().length < MIN_HERGANG_LAENGE) return false
  if (input.vorhandeneSkizze != null && input.vorhandeneSkizze.trim() !== '') return false
  return true
}
