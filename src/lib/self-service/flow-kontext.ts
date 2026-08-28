// Baut den Kontext, gegen den die DB-Bedingungen der Steps ausgewertet werden (flow_szenario_steps).
// Pure + client-safe: der Wizard muss den Kontext nach dem Quali-Step neu bauen koennen, ohne
// Server-Roundtrip.
//
// Hier — und NUR hier — liegen die ABGELEITETEN Felder. Damit bleibt die Bedingungs-Syntax in der DB
// simpel (AND-only, Feld==Wert) und muss weder ODER noch Fallback-Ketten koennen.

import type { FlowKontext } from './flow-szenarien'
import { brauchtWerkstattVermittlung } from '@/lib/werkstatt/vermittlung-core'

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
  // P4: 'gutachter-vermittlung' = SV-Sofort-Claim, Gutachten existiert bereits.
  source_channel?: string | null
  // Rohspalten fuer erhebt_felder (echte Erhebung, NICHT die *_effektiv-Fallback-Kette).
  kennzeichen?: string | null
  gegner_versicherung?: string | null
  schadentyp?: string | null
  hat_vorschaeden?: boolean | null
  freie_werkstattwahl?: boolean | null
  // Fuer werkstatt_waehlbar (s.u.) — dieselben Felder, die brauchtWerkstattVermittlung liest.
  reparaturwunsch?: string | null
  reparatur_vermittlung_status?: string | null
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

    // P4 UX-Follow-up (Smoke-MINOR 31.07., PR #4897): Vermittlungs-Kunden (Gutachten existiert
    // bereits) brauchen keine Logistik-Steps (Besichtigungsort/Termin/Gutachter/Werkstatt) —
    // die Config blendet sie per {"gutachten_vermittelt": null} aus. 'ja' statt true, weil die
    // Bedingungs-Syntax Feld==Wert vergleicht; null = normaler Weg -> Steps bleiben.
    gutachten_vermittelt: lead.source_channel === 'gutachter-vermittlung' ? 'ja' : null,

    // Zugeordneter SV: der Termin-Step faellt weg, sobald einer haengt (dann wird er ANGEZEIGT).
    sv_id: svHatTermin ? 'gesetzt' : null,

    // Werkstatt kann an zwei Feldern haengen -> eine Wahrheit fuer die Bedingung.
    reparatur_werkstatt_id: lead.reparatur_werkstatt_id ?? lead.werkstatt_id ?? null,

    // Ist der Werkstatt-Step ueberhaupt BEDIENBAR? Bewusst dieselbe Funktion, die auch die
    // Server-Action `waehleWerkstattFlow` als Gate benutzt — damit koennen Anzeige und
    // Annahme nicht auseinanderlaufen.
    //
    // Vorher lief das auseinander (prod-verifiziert 28.08.): die Step-Bedingung prueft nur
    // `reparatur_werkstatt_id`, das Server-Gate zusaetzlich `reparaturwunsch`. Wer die
    // Pflichtfrage "Wie moechtest du den Schaden abrechnen?" ueberspringt, bekam anschliessend
    // fuenf Werkstaetten angeboten — und jede Auswahl endete in "Fuer diesen Vorgang ist keine
    // Werkstatt-Auswahl moeglich." Ein Schritt, der nichts bewirken kann, gehoert nicht in den
    // Fluss. 'ja'/null statt bool, weil die Bedingungs-Syntax Feld==Wert vergleicht.
    //
    // ⚠ Das GATE selbst wird hier nicht dupliziert — waere es nachgebaut, koennte es beim
    // naechsten Constraint-Wechsel erneut divergieren. Genau das ist der Fehler, den dieser
    // Fix behebt.
    werkstatt_waehlbar: brauchtWerkstattVermittlung({
      reparaturwunsch: lead.reparaturwunsch ?? null,
      reparatur_werkstatt_id: lead.reparatur_werkstatt_id ?? null,
      werkstatt_id: lead.werkstatt_id ?? null,
      reparatur_vermittlung_status: lead.reparatur_vermittlung_status ?? null,
    })
      ? 'ja'
      : null,

    // Rohspalten fuer erhebt_felder — roh = echte Erhebung, NICHT die *_effektiv-Fallback-Kette
    // darunter. So sieht der Erhebungs-Gate den unmaskierten Zustand (Symptom 2). `?? null` (nicht ||)
    // bewahrt false bei den bool-Feldern.
    kennzeichen: lead.kennzeichen ?? null,
    gegner_versicherung: lead.gegner_versicherung ?? null,
    schadentyp: lead.schadentyp ?? null,
    hat_vorschaeden: lead.hat_vorschaeden ?? null,
    freie_werkstattwahl: lead.freie_werkstattwahl ?? null,
    fahrzeug_standort_adresse: lead.fahrzeug_standort_adresse ?? null,
    besichtigungsort_adresse: lead.besichtigungsort_adresse ?? null,
    unfallort: lead.unfallort ?? null,

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
