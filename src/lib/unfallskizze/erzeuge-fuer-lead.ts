// Gemeinsame Orchestrierung „Skizze fuer einen Lead erzeugen" — die Schritte um die
// pure Regel `sollSkizzeGenerieren` herum: Stand lesen, entscheiden, generieren, speichern.
//
// Warum geteilt statt kopiert: die Generierung haengt an ZWEI Momenten, weil der Hergang
// an zwei Momenten entstehen kann.
//   1. Bei der Lead-ANLAGE (createLead) — Kunde-Portal, Schaden-Karte, Werkstatt-Finder,
//      Flotte, Makler-FlowLink schicken den Hergang im ersten Save mit.
//   2. Beim NACHTRAEGLICHEN Ergaenzen (Flow-Feststellung) — dort entsteht der Lead frueher
//      als der Hergangstext.
// Beide Momente brauchen dieselben vier Schritte. Ohne diese Datei stuenden sie zweimal da.
//
// Messung prod 13.08. (alle Leads mit nicht-leerem `unfallhergang`):
//   schaden-karte 6 · self_service 6 · kunde_portal 3 · makler-flowlink 1 · flotte 1 · werkstatt_finder 1
//   = 18 mit Hergang, davon **0 mit Skizze**. Der Generator existiert seit AAR-317, war aber
//   nur im Dispatch-Portal verdrahtet — und dort hat ihn nie jemand angestossen.
//
// Die Funktion wirft NIE. Eine Skizze ist nirgends Voraussetzung; sie ist eine Zugabe,
// und eine Zugabe darf die Lead-Anlage nicht gefaehrden.

import { sollSkizzeGenerieren } from './soll-generieren'

/** Der Lead-Stand, den die Entscheidung + der Generator brauchen. */
export type SkizzeLeadStand = {
  unfallskizze_svg: string | null
  schadentyp: string | null
  gegner_fahrzeugtyp: string | null
}

/**
 * Minimaler struktureller Client-Typ — bewusst NICHT `SupabaseClient<Database>`:
 * `createAdminClient()` ist ungetypt, und ein Fake im Test soll ohne Cast passen.
 * Er beschreibt exakt die zwei Queries, die unten laufen — mehr braucht die Funktion nicht.
 */
export type SkizzeLeadClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => { maybeSingle: () => Promise<{ data: SkizzeLeadStand | null }> }
    }
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
}

export type SkizzeErgebnis =
  | { status: 'generiert' }
  | { status: 'uebersprungen'; grund: 'lead-fehlt' | 'regel' }
  | { status: 'fehler'; grund: string }

export type ErzeugeSkizzeInput = {
  leadId: string
  /** Hergang aus DIESEM Save — `unknown`, weil er aus Formular-Werten kommt. */
  hergang: unknown
  admin: SkizzeLeadClient
  /** Log-Praefix, damit man in den Logs sieht, welcher Moment ausgeloest hat. */
  kontext: string
}

/**
 * Erzeugt die Unfallskizze fuer einen Lead — falls die Regel es zulaesst.
 *
 * Gibt IMMER ein Ergebnis zurueck und wirft nie; Fehler landen als `console.warn`
 * und als `{ status: 'fehler' }`. Der Caller ruft sie fire-and-forget auf.
 *
 * Der Generator wird dynamisch importiert: er zieht das Anthropic-SDK nach, und
 * `createLead` ist ein sehr breit importierter Trichter, den das nicht belasten soll.
 */
export async function erzeugeSkizzeFuerLead(input: ErzeugeSkizzeInput): Promise<SkizzeErgebnis> {
  const { leadId, hergang, admin, kontext } = input
  try {
    // Erst den Stand lesen: `vorhandeneSkizze` entscheidet mit, und schadentyp/
    // gegner_fahrzeugtyp gehen als Kontext in den Prompt.
    const { data: stand } = await admin
      .from('leads')
      .select('unfallskizze_svg, schadentyp, gegner_fahrzeugtyp')
      .eq('id', leadId)
      .maybeSingle()

    if (!stand) return { status: 'uebersprungen', grund: 'lead-fehlt' }

    if (!sollSkizzeGenerieren({ hergangImSave: hergang, vorhandeneSkizze: stand.unfallskizze_svg })) {
      return { status: 'uebersprungen', grund: 'regel' }
    }

    const { generateUnfallskizze } = await import('./generate')
    const skizze = await generateUnfallskizze({
      unfallhergang: String(hergang),
      schadentyp: stand.schadentyp,
      gegnerFahrzeugtyp: stand.gegner_fahrzeugtyp,
    })
    if (!skizze.success) {
      console.warn(`[${kontext}] Unfallskizze-Generierung (non-critical):`, skizze.error)
      return { status: 'fehler', grund: skizze.error }
    }

    const { error } = await admin
      .from('leads')
      .update({
        unfallskizze_svg: skizze.svg,
        // Frisch generiert = noch nicht von Dispatch gesehen. Das Ablehnungs-Feld
        // wird mitgeleert, damit ein alter Grund nicht an einer neuen Skizze klebt.
        unfallskizze_bestaetigt: false,
        unfallskizze_ablehnung_grund: null,
        unfallskizze_generiert_am: new Date().toISOString(),
      })
      .eq('id', leadId)
    if (error) {
      console.warn(`[${kontext}] Unfallskizze speichern (non-critical):`, error.message)
      return { status: 'fehler', grund: error.message }
    }

    return { status: 'generiert' }
  } catch (err) {
    // Auch der dynamische Import kann scheitern (fehlender API-Key, Deploy-Race).
    const grund = err instanceof Error ? err.message : String(err)
    console.warn(`[${kontext}] Unfallskizze (non-critical):`, grund)
    return { status: 'fehler', grund }
  }
}
