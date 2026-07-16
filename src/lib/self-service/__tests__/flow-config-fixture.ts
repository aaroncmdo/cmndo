// Die echte FlowLink-Matrix als Test-Fixture — Spiegel des DB-Seeds (Migration 20260714184641).
// Zur Laufzeit kommen diese Daten aus `flow_szenarien` + `flow_szenario_steps`; hier halten sie die
// LOGIK testbar. Aendert sich die Matrix in der DB, gehoert dieser Spiegel mitgezogen (er ist die
// Regressions-Absicherung dafuer, dass die Config das tut, was Aaron am 14.07. festgelegt hat).

import type { FlowSzenario, FlowSzenarioStep } from '../flow-szenarien'

export const SZENARIEN_FIXTURE: FlowSzenario[] = [
  { id: 'nur_gutachter', bezeichnung: 'Nur Gutachten', schuldfrage: 'gegner', eigene_versicherung: null, service_typ: 'nur_gutachter', feststellung_zweig: 'unfall', prioritaet: 20 },
  { id: 'haftpflicht', bezeichnung: 'Haftpflicht', schuldfrage: 'gegner', eigene_versicherung: null, service_typ: null, feststellung_zweig: 'unfall', prioritaet: 10 },
  { id: 'teilschuld', bezeichnung: 'Teilschuld', schuldfrage: 'unklar', eigene_versicherung: null, service_typ: null, feststellung_zweig: 'unfall', prioritaet: 10 },
  { id: 'kasko', bezeichnung: 'Kasko', schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja', service_typ: null, feststellung_zweig: 'schaden', prioritaet: 10 },
  { id: 'selbstzahler', bezeichnung: 'Selbstzahler', schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein', service_typ: null, feststellung_zweig: 'schaden', prioritaet: 10 },
  { id: 'unqualifiziert', bezeichnung: 'Schuldfrage offen', schuldfrage: null, eigene_versicherung: null, service_typ: null, feststellung_zweig: 'unfall', prioritaet: 0 },
]

export const STEPS_FIXTURE: FlowSzenarioStep[] = [
  { szenario_id: 'unqualifiziert', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  // quali_offen (abgeleitet in page.tsx) = schuldfrage fehlt ODER eigenverantwortung ohne VS-Antwort.
  // NICHT {schuldfrage: null} — sonst saehe ein 'eigenverantwortung'-Lead ohne Versicherungsantwort
  // den Quali-Step nie und wuerde still disqualifiziert (Mig 20260714190406).
  { szenario_id: 'unqualifiziert', step_id: 'quali', reihenfolge: 2, bedingung: { quali_offen: true } },

  { szenario_id: 'haftpflicht', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  { szenario_id: 'haftpflicht', step_id: 'feststellung', reihenfolge: 2, bedingung: { unfallhergang: null } },
  { szenario_id: 'haftpflicht', step_id: 'ort_besichtigung', reihenfolge: 3, bedingung: { besichtigungsort_effektiv: null } },
  { szenario_id: 'haftpflicht', step_id: 'termin', reihenfolge: 4, bedingung: { sv_id: null } },
  { szenario_id: 'haftpflicht', step_id: 'gutachter', reihenfolge: 5, bedingung: null },
  { szenario_id: 'haftpflicht', step_id: 'ort_fahrzeug', reihenfolge: 6, bedingung: { fahrzeug_standort_effektiv: null } },
  { szenario_id: 'haftpflicht', step_id: 'werkstatt', reihenfolge: 7, bedingung: { reparatur_werkstatt_id: null } },
  { szenario_id: 'haftpflicht', step_id: 'sa', reihenfolge: 8, bedingung: null },
  { szenario_id: 'haftpflicht', step_id: 'account', reihenfolge: 9, bedingung: null },

  { szenario_id: 'nur_gutachter', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  { szenario_id: 'nur_gutachter', step_id: 'feststellung', reihenfolge: 2, bedingung: { unfallhergang: null } },
  { szenario_id: 'nur_gutachter', step_id: 'ort_besichtigung', reihenfolge: 3, bedingung: { besichtigungsort_effektiv: null } },
  { szenario_id: 'nur_gutachter', step_id: 'termin', reihenfolge: 4, bedingung: { sv_id: null } },
  { szenario_id: 'nur_gutachter', step_id: 'gutachter', reihenfolge: 5, bedingung: null },
  { szenario_id: 'nur_gutachter', step_id: 'sa', reihenfolge: 6, bedingung: null },
  { szenario_id: 'nur_gutachter', step_id: 'account', reihenfolge: 7, bedingung: null },

  { szenario_id: 'teilschuld', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  { szenario_id: 'teilschuld', step_id: 'rueckruf', reihenfolge: 2, bedingung: null },

  { szenario_id: 'kasko', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  // Skip-Marker = hat_vorschaeden (Mig 20260716155354): fahrzeugschaden_beschreibung wird seit dem
  // Werkstatt-Embed Phase 3 (#4412) im Embed vorbelegt -> haette die Feststellung faelschlich geskippt.
  // hat_vorschaeden ist der LETZTE Feststellung-Micro-Step und wird von keinem Vor-Flow-Writer gesetzt.
  { szenario_id: 'kasko', step_id: 'feststellung', reihenfolge: 2, bedingung: { hat_vorschaeden: null } },
  { szenario_id: 'kasko', step_id: 'ort_fahrzeug', reihenfolge: 3, bedingung: { fahrzeug_standort_effektiv: null } },
  { szenario_id: 'kasko', step_id: 'werkstatt', reihenfolge: 4, bedingung: { reparatur_werkstatt_id: null } },
  { szenario_id: 'kasko', step_id: 'account', reihenfolge: 5, bedingung: null },

  { szenario_id: 'selbstzahler', step_id: 'zusammenfassung', reihenfolge: 1, bedingung: null },
  { szenario_id: 'selbstzahler', step_id: 'feststellung', reihenfolge: 2, bedingung: { hat_vorschaeden: null } },
  { szenario_id: 'selbstzahler', step_id: 'ort_fahrzeug', reihenfolge: 3, bedingung: { fahrzeug_standort_effektiv: null } },
  { szenario_id: 'selbstzahler', step_id: 'werkstatt', reihenfolge: 4, bedingung: { reparatur_werkstatt_id: null } },
  { szenario_id: 'selbstzahler', step_id: 'account', reihenfolge: 5, bedingung: null },
]
