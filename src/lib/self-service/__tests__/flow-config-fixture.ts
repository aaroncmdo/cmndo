// Die echte FlowLink-Matrix als Test-Fixture — Spiegel des DB-Seeds (Migration 20260714184641).
// Zur Laufzeit kommen diese Daten aus `flow_szenarien` + `flow_szenario_steps`; hier halten sie die
// LOGIK testbar. Aendert sich die Matrix in der DB, gehoert dieser Spiegel mitgezogen (er ist die
// Regressions-Absicherung dafuer, dass die Config das tut, was Aaron am 14.07. festgelegt hat).

import type { FlowSzenario, FlowSzenarioStep } from '../flow-szenarien'

export const SZENARIEN_FIXTURE: FlowSzenario[] = [
  // 'nur_gutachter' ist KEIN eigenes Szenario mehr (Phantom, Spec 2026-07-21 §2.5): der Gutachter
  // gehoert immer zum Haftpflichtanspruch; die Kanzlei-Wahl am SA-Ende steuert nur Downstream
  // (LexDrive/Vollmacht via service_typ), aendert NICHT die Flow-Ausfuehrung.
  { id: 'haftpflicht', bezeichnung: 'Haftpflicht', schuldfrage: 'gegner', eigene_versicherung: null, service_typ: null, feststellung_zweig: 'unfall', prioritaet: 10 },
  { id: 'teilschuld', bezeichnung: 'Teilschuld', schuldfrage: 'unklar', eigene_versicherung: null, service_typ: null, feststellung_zweig: 'unfall', prioritaet: 10 },
  { id: 'kasko', bezeichnung: 'Kasko', schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja', service_typ: null, feststellung_zweig: 'schaden', prioritaet: 10 },
  { id: 'selbstzahler', bezeichnung: 'Selbstzahler', schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein', service_typ: null, feststellung_zweig: 'schaden', prioritaet: 10 },
  { id: 'unqualifiziert', bezeichnung: 'Schuldfrage offen', schuldfrage: null, eigene_versicherung: null, service_typ: null, feststellung_zweig: 'unfall', prioritaet: 0 },
]

// Ziel-Matrix (Spec 2026-07-21): Erhebungs-Steps tragen `erhebt_felder` (Rohspalten) statt
// Ein-Feld-Stellvertreter-`bedingung`. Ein Step bleibt sichtbar, solange >=1 gelistete Spalte leer
// ist. Die *_effektiv-Felder gaten NICHT mehr (sie werden nur noch Vorbefuellung). werkstatt hat
// jetzt einen Anzeige-Gegenpart (werkstatt_anzeige, {reparatur_werkstatt_id:'$gesetzt'}); Kasko
// bekommt das Werkstattbindungs-Gate (freie_werkstattwahl bestaetigen). ⚠ hat_vorschaeden ist NICHT
// in erhebt_felder (DB-Default 'false' -> als Gate untauglich, s. check:flow-erhebt-felder).
export const STEPS_FIXTURE: FlowSzenarioStep[] = [
  { szenario_id: 'unqualifiziert', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  // quali_offen (abgeleitet in page.tsx) = schuldfrage fehlt ODER eigenverantwortung ohne VS-Antwort.
  { szenario_id: 'unqualifiziert', step_id: 'quali', reihenfolge: 2, bedingung: { quali_offen: true } },

  { szenario_id: 'haftpflicht', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  { szenario_id: 'haftpflicht', step_id: 'feststellung', reihenfolge: 2, bedingung: null, erhebt_felder: ['kennzeichen', 'unfallhergang', 'unfallort', 'gegner_versicherung'] },
  { szenario_id: 'haftpflicht', step_id: 'ort_besichtigung', reihenfolge: 3, bedingung: null, erhebt_felder: ['besichtigungsort_adresse'] },
  { szenario_id: 'haftpflicht', step_id: 'termin', reihenfolge: 4, bedingung: { sv_id: null } },
  { szenario_id: 'haftpflicht', step_id: 'gutachter', reihenfolge: 5, bedingung: null },
  { szenario_id: 'haftpflicht', step_id: 'ort_fahrzeug', reihenfolge: 6, bedingung: null, erhebt_felder: ['fahrzeug_standort_adresse'] },
  { szenario_id: 'haftpflicht', step_id: 'werkstatt', reihenfolge: 7, bedingung: { reparatur_werkstatt_id: null } },
  { szenario_id: 'haftpflicht', step_id: 'werkstatt_anzeige', reihenfolge: 8, bedingung: { reparatur_werkstatt_id: '$gesetzt' } },
  { szenario_id: 'haftpflicht', step_id: 'sa', reihenfolge: 9, bedingung: null },
  { szenario_id: 'haftpflicht', step_id: 'account', reihenfolge: 10, bedingung: null },

  { szenario_id: 'teilschuld', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  { szenario_id: 'teilschuld', step_id: 'rueckruf', reihenfolge: 2, bedingung: null },

  { szenario_id: 'kasko', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  { szenario_id: 'kasko', step_id: 'feststellung', reihenfolge: 2, bedingung: null, erhebt_felder: ['kennzeichen', 'schadentyp', 'unfallhergang'] },
  // Werkstattbindungs-Gate: Kasko-Kunde bestaetigt aktiv, dass die Police keine Werkstatt vorschreibt.
  // NUR Kasko (Selbstzahler hat keine Versicherung/Police -> keine Bindung moeglich).
  { szenario_id: 'kasko', step_id: 'werkstattbindung_check', reihenfolge: 3, bedingung: { freie_werkstattwahl: null } },
  { szenario_id: 'kasko', step_id: 'ort_fahrzeug', reihenfolge: 4, bedingung: null, erhebt_felder: ['fahrzeug_standort_adresse'] },
  { szenario_id: 'kasko', step_id: 'werkstatt', reihenfolge: 5, bedingung: { reparatur_werkstatt_id: null } },
  { szenario_id: 'kasko', step_id: 'werkstatt_anzeige', reihenfolge: 6, bedingung: { reparatur_werkstatt_id: '$gesetzt' } },
  { szenario_id: 'kasko', step_id: 'account', reihenfolge: 7, bedingung: null },

  { szenario_id: 'selbstzahler', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  { szenario_id: 'selbstzahler', step_id: 'feststellung', reihenfolge: 2, bedingung: null, erhebt_felder: ['kennzeichen', 'schadentyp', 'unfallhergang'] },
  { szenario_id: 'selbstzahler', step_id: 'ort_fahrzeug', reihenfolge: 3, bedingung: null, erhebt_felder: ['fahrzeug_standort_adresse'] },
  { szenario_id: 'selbstzahler', step_id: 'werkstatt', reihenfolge: 4, bedingung: { reparatur_werkstatt_id: null } },
  { szenario_id: 'selbstzahler', step_id: 'werkstatt_anzeige', reihenfolge: 5, bedingung: { reparatur_werkstatt_id: '$gesetzt' } },
  { szenario_id: 'selbstzahler', step_id: 'account', reihenfolge: 6, bedingung: null },
]
