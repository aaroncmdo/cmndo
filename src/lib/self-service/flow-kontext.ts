// Baut den Kontext, gegen den die DB-Bedingungen der Steps ausgewertet werden (flow_szenario_steps).
// Pure + client-safe: der Wizard muss den Kontext nach dem Quali-Step neu bauen koennen, ohne
// Server-Roundtrip.
//
// Hier — und NUR hier — liegen die ABGELEITETEN Felder. Damit bleibt die Bedingungs-Syntax in der DB
// simpel (AND-only, Feld==Wert) und muss weder ODER noch Fallback-Ketten koennen.

import type { FlowKontext } from './flow-szenarien'

export type LeadFuerKontext = {
  schuldfrage?: string | null
  eigene_versicherung?: string | null
  service_typ?: string | null
  unfallhergang?: string | null
  fahrzeugschaden_beschreibung?: string | null
  reparatur_werkstatt_id?: string | null
  werkstatt_id?: string | null
  besichtigungsort_adresse?: string | null
  fahrzeug_standort_adresse?: string | null
  unfallort?: string | null
  disqualifiziert?: boolean | null
}

/**
 * @param lead        die Lead-Felder (page.tsx laedt select('*'))
 * @param svHatTermin ist bereits ein SV/Termin zugeordnet? (terminMitSv || terminPending)
 *                    Das haengt NICHT am Lead, sondern am Termin-Lookup — daher separat.
 */
export function bauFlowKontext(lead: LeadFuerKontext, svHatTermin: boolean): FlowKontext {
  const schuldfrage = lead.schuldfrage ?? null
  const eigeneVersicherung = lead.eigene_versicherung ?? null

  return {
    schuldfrage,
    eigene_versicherung: eigeneVersicherung,
    service_typ: lead.service_typ ?? null,
    unfallhergang: lead.unfallhergang ?? null,
    fahrzeugschaden_beschreibung: lead.fahrzeugschaden_beschreibung ?? null,
    disqualifiziert: lead.disqualifiziert ?? null,

    // Zugeordneter SV: der Termin-Step faellt weg, sobald einer haengt (dann wird er ANGEZEIGT).
    sv_id: svHatTermin ? 'gesetzt' : null,

    // Werkstatt kann an zwei Feldern haengen -> eine Wahrheit fuer die Bedingung.
    reparatur_werkstatt_id: lead.reparatur_werkstatt_id ?? lead.werkstatt_id ?? null,

    // Die ZWEI VERSCHIEDENEN Orte (Aaron 14.07.):
    //   besichtigungsort = wo der SV besichtigt -> Anker fuer den GUTACHTER-Finder
    //   fahrzeug_standort = wo das Auto steht   -> Anker fuer den WERKSTATT-Finder
    // Der SV kommt zum Auto, wenn nichts anderes vereinbart ist -> der Besichtigungsort faellt auf den
    // Fahrzeugstandort zurueck. Umgekehrt NICHT: wo der SV besichtigt, sagt nichts darueber, wo das
    // Auto steht (es kann laengst in einer Werkstatt stehen).
    besichtigungsort_effektiv:
      lead.besichtigungsort_adresse ?? lead.fahrzeug_standort_adresse ?? lead.unfallort ?? null,
    fahrzeug_standort_effektiv: lead.fahrzeug_standort_adresse ?? lead.unfallort ?? null,

    // Die "scharfe Kante" (Makler-Audit): schuldfrage='eigenverantwortung' OHNE eigene_versicherung
    // ergibt abrechnungsweg=null -> der Lead wuerde beim Convert still disqualifiziert. Der Quali-Step
    // MUSS die Versicherungsfrage also auch dann nachholen, wenn die schuldfrage schon gesetzt ist.
    quali_offen:
      schuldfrage === null ||
      (schuldfrage === 'eigenverantwortung' && eigeneVersicherung === null),
  }
}
