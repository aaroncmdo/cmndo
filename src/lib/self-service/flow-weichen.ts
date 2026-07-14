// Die FlowLink-Weiche — jetzt DB-getrieben (Aaron 14.07.).
//
// VORHER war hier eine if/else-Kette: jede neue Weiche und jeder neue Step brauchten einen Deploy.
// JETZT liegt die Matrix als Daten in `flow_szenarien` + `flow_szenario_steps`; diese Datei ist nur
// noch der duenne, getestete Wrapper, der die Config in das umrechnet, was die UI braucht.
//
// Die Weichen-Flags werden aus den STEPS abgeleitet, nicht separat gepflegt — die Step-Sequenz ist
// die SSoT. Steht 'termin' in der Sequenz, braucht der Kunde einen Gutachter-Termin. Punkt.

import { resolveAbrechnungsweg, type Abrechnungsweg } from '@/lib/werkstatt/abrechnungsweg'
import {
  matcheSzenario,
  berechneAktiveSteps,
  type FlowSzenario,
  type FlowSzenarioStep,
  type FlowKontext,
} from './flow-szenarien'

export type FeststellungZweig = 'unfall' | 'schaden'

export type FlowWeichen = {
  /** Welches Szenario greift (flow_szenarien.id). */
  szenarioId: string
  /** Die aktiven Steps in Reihenfolge — nach Auswertung der Bedingungen. */
  steps: string[]
  abrechnungsweg: Abrechnungsweg | null
  /** Abgeleitet aus den Steps: steht 'termin' drin, braucht der Kunde einen Gutachter. */
  brauchtGutachter: boolean
  brauchtWerkstatt: boolean
  brauchtRueckruf: boolean
  /** 'unfall' = volle Unfall-Aufnahme; 'schaden' = nur Schaden+Fahrzeug (Kasko/Selbstzahler). */
  feststellungZweig: FeststellungZweig
}

const LEER: FlowWeichen = {
  szenarioId: 'unbekannt',
  steps: [],
  abrechnungsweg: null,
  brauchtGutachter: false,
  brauchtWerkstatt: false,
  brauchtRueckruf: false,
  feststellungZweig: 'unfall',
}

/**
 * Loest die Weichen fuer einen Lead auf: welches Szenario, welche Steps, welche Feststellung.
 *
 * @param szenarien   aus `flow_szenarien` (aktiv)
 * @param szenarioSteps aus `flow_szenario_steps` (aktiv)
 * @param kontext     der Lead-Zustand inkl. abgeleiteter Felder (sv_id, *_effektiv, ...)
 */
export function resolveFlowWeichen(
  szenarien: FlowSzenario[],
  szenarioSteps: FlowSzenarioStep[],
  kontext: FlowKontext,
): FlowWeichen {
  const szenario = matcheSzenario(szenarien, kontext)
  if (!szenario) return LEER

  const steps = berechneAktiveSteps(szenarioSteps, szenario.id, kontext)
  const eigeneVersicherung = kontext.eigene_versicherung

  return {
    szenarioId: szenario.id,
    steps,
    // Der abrechnungsweg selbst bleibt die kanonische DB-Ableitung (derive_abrechnungsweg spiegelt
    // dieselbe Regel serverseitig). Die UI braucht ihn fuer den Haftpflicht-Hinweis am SA-Step.
    abrechnungsweg: resolveAbrechnungsweg({
      schuldfrage: (kontext.schuldfrage as string | null) ?? null,
      ueberEigeneVersicherung:
        eigeneVersicherung === 'ja' ? true : eigeneVersicherung === 'nein' ? false : null,
    }),
    brauchtGutachter: steps.includes('termin'),
    brauchtWerkstatt: steps.includes('werkstatt'),
    brauchtRueckruf: steps.includes('rueckruf'),
    feststellungZweig: szenario.feststellung_zweig,
  }
}
