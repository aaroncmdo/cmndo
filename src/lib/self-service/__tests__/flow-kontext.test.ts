import { describe, it, expect } from 'vitest'
import { bauFlowKontext } from '../flow-kontext'

describe('bauFlowKontext', () => {
  it('SV zugeordnet -> sv_id gesetzt (Termin-Step faellt weg)', () => {
    expect(bauFlowKontext({}, true).sv_id).toBe('gesetzt')
    expect(bauFlowKontext({}, false).sv_id).toBeNull()
  })

  it('Werkstatt kann an reparatur_werkstatt_id ODER werkstatt_id haengen', () => {
    expect(bauFlowKontext({ reparatur_werkstatt_id: 'w-1' }, false).reparatur_werkstatt_id).toBe('w-1')
    expect(bauFlowKontext({ werkstatt_id: 'w-2' }, false).reparatur_werkstatt_id).toBe('w-2')
    expect(bauFlowKontext({}, false).reparatur_werkstatt_id).toBeNull()
  })

  // Die zwei VERSCHIEDENEN Orte (Aaron 14.07.).
  it('Besichtigungsort faellt auf den Fahrzeugstandort zurueck (der SV kommt zum Auto)', () => {
    const k = bauFlowKontext({ fahrzeug_standort_adresse: 'Koeln' }, false)
    expect(k.besichtigungsort_effektiv).toBe('Koeln')
  })

  it('Fahrzeugstandort faellt NICHT auf den Besichtigungsort zurueck', () => {
    const k = bauFlowKontext({ besichtigungsort_adresse: 'Bonn' }, false)
    expect(k.besichtigungsort_effektiv).toBe('Bonn')
    // Wo der SV besichtigt, sagt nichts darueber, wo das Auto steht -> muss abgefragt werden.
    expect(k.fahrzeug_standort_effektiv).toBeNull()
  })

  it('beide Orte fallen als letztes auf den Unfallort zurueck (Auto steht evtl. noch dort)', () => {
    const k = bauFlowKontext({ unfallort: 'A3 Kilometer 12' }, false)
    expect(k.besichtigungsort_effektiv).toBe('A3 Kilometer 12')
    expect(k.fahrzeug_standort_effektiv).toBe('A3 Kilometer 12')
  })

  // Die "scharfe Kante": ohne diese Ableitung stirbt der Lead still.
  it('quali_offen: schuldfrage fehlt', () => {
    expect(bauFlowKontext({}, false).quali_offen).toBe(true)
  })

  it('quali_offen: eigenverantwortung OHNE Versicherungsantwort -> Quali muss nachholen', () => {
    const k = bauFlowKontext({ schuldfrage: 'eigenverantwortung', eigene_versicherung: null }, false)
    expect(k.quali_offen).toBe(true)
  })

  it('quali_offen=false: eigenverantwortung MIT Versicherungsantwort', () => {
    expect(
      bauFlowKontext({ schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja' }, false).quali_offen,
    ).toBe(false)
    expect(
      bauFlowKontext({ schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein' }, false).quali_offen,
    ).toBe(false)
  })

  it('quali_offen=false: gegner braucht keine Versicherungsfrage (Gegner zahlt)', () => {
    expect(bauFlowKontext({ schuldfrage: 'gegner' }, false).quali_offen).toBe(false)
  })

  it('quali_offen=false: unklar (Teilschuld) laeuft in den Rueckruf, nicht in die VS-Frage', () => {
    expect(bauFlowKontext({ schuldfrage: 'unklar' }, false).quali_offen).toBe(false)
  })
})

describe('bauFlowKontext — Rohspalten fuer erhebt_felder', () => {
  it('traegt die operativen Rohspalten NEBEN den abgeleiteten *_effektiv-Feldern', () => {
    const k = bauFlowKontext(
      { schuldfrage: 'gegner', unfallort: 'Koeln', fahrzeug_standort_adresse: null, kennzeichen: 'K-AB-12', hat_vorschaeden: false },
      false,
    )
    // Rohspalte leer -> erhebt_felder sieht sie als offen (Symptom 2: NICHT per unfallort-Fallback maskiert)
    expect(k.fahrzeug_standort_adresse).toBeNull()
    // abgeleitetes Feld bleibt fuer Prefill/bedingung (Fallback auf unfallort)
    expect(k.fahrzeug_standort_effektiv).toBe('Koeln')
    expect(k.kennzeichen).toBe('K-AB-12')
    // false ist ein WERT (kein ?? null-Verlust)
    expect(k.hat_vorschaeden).toBe(false)
  })
  it('leere Rohspalten sind null (nicht undefined) — istLeer greift', () => {
    const k = bauFlowKontext({ schuldfrage: 'gegner' }, false)
    expect(k.kennzeichen).toBeNull()
    expect(k.gegner_versicherung).toBeNull()
    expect(k.schadentyp).toBeNull()
    expect(k.freie_werkstattwahl).toBeNull()
  })
})

describe('bauFlowKontext — gutachten_vermittelt (P4 UX-Follow-up: Vermittlung direkt zur SA)', () => {
  // P4-Smoke 31.07. (MINOR im PR-#4897-Report): Vermittlungs-Kunden sahen die Logistik-Steps
  // (Besichtigungsort/Termin/Gutachter/Werkstatt), obwohl das Gutachten bereits existiert.
  // Die Steps werden per Config-Bedingung {"gutachten_vermittelt": null} ausgeblendet.
  it("source_channel='gutachter-vermittlung' -> 'ja' (Config blendet Logistik-Steps aus)", () => {
    const k = bauFlowKontext({ schuldfrage: null, source_channel: 'gutachter-vermittlung' }, false)
    expect(k.gutachten_vermittelt).toBe('ja')
  })
  it('normale Wege (embed/nativ/null) -> null (Bedingung {feld: null} laesst Steps stehen)', () => {
    expect(bauFlowKontext({ schuldfrage: 'gegner', source_channel: 'embed' }, false).gutachten_vermittelt).toBeNull()
    expect(bauFlowKontext({ schuldfrage: 'gegner' }, false).gutachten_vermittelt).toBeNull()
  })
})

describe('bauFlowKontext — werkstatt_waehlbar (Anzeige == Annahme)', () => {
  // Prod-Befund 28.08.2026: Der Werkstatt-Step erschien auch, wenn ihn die Server-Action
  // gar nicht annehmen kann. Die Step-Bedingung prüfte nur `reparatur_werkstatt_id`, das
  // Gate von `waehleWerkstattFlow` zusätzlich `reparaturwunsch`. Wer die Pflichtfrage
  // "Wie möchtest du den Schaden abrechnen?" übersprang, bekam fünf Werkstätten angeboten
  // und jede Auswahl endete in "Für diesen Vorgang ist keine Werkstatt-Auswahl möglich."
  //
  // Diese Tests halten fest, dass beide Seiten dieselbe Wahrheit lesen.
  it("mit Reparatur-Wunsch waehlbar -> 'ja' (Step erscheint)", () => {
    expect(bauFlowKontext({ reparaturwunsch: 'reparatur' }, false).werkstatt_waehlbar).toBe('ja')
    expect(bauFlowKontext({ reparaturwunsch: 'fiktiv' }, false).werkstatt_waehlbar).toBe('ja')
  })

  it('OHNE Antwort auf die Abrechnungsfrage -> null (Step bleibt weg — das ist der Fix)', () => {
    expect(bauFlowKontext({ schuldfrage: 'gegner' }, false).werkstatt_waehlbar).toBeNull()
    expect(bauFlowKontext({ reparaturwunsch: null }, false).werkstatt_waehlbar).toBeNull()
  })

  it('Wunsch ohne Vermittlungsbedarf (unentschieden/keine) -> null', () => {
    expect(bauFlowKontext({ reparaturwunsch: 'unentschieden' }, false).werkstatt_waehlbar).toBeNull()
  })

  it('bereits vermittelt -> null (kein zweiter Durchgang)', () => {
    expect(
      bauFlowKontext({ reparaturwunsch: 'reparatur', reparatur_werkstatt_id: 'w1' }, false).werkstatt_waehlbar,
    ).toBeNull()
    expect(
      bauFlowKontext({ reparaturwunsch: 'reparatur', werkstatt_id: 'inbound1' }, false).werkstatt_waehlbar,
    ).toBeNull()
    expect(
      bauFlowKontext({ reparaturwunsch: 'reparatur', reparatur_vermittlung_status: 'vermittelt' }, false)
        .werkstatt_waehlbar,
    ).toBeNull()
  })

  it('gilt szenario-unabhaengig (kasko/selbstzahler tragen denselben Step)', () => {
    const kasko = { schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja', reparaturwunsch: 'reparatur' }
    const selbstzahler = { schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein', reparaturwunsch: 'reparatur' }
    expect(bauFlowKontext(kasko, false).werkstatt_waehlbar).toBe('ja')
    expect(bauFlowKontext(selbstzahler, false).werkstatt_waehlbar).toBe('ja')
  })
})
