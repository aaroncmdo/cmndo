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

  it('werkstattbindung_quelle wird roh durchgereicht (Step-Bedingung Kasko)', () => {
    expect(bauFlowKontext({ werkstattbindung_quelle: 'unbekannt' }, false).werkstattbindung_quelle).toBe('unbekannt')
    expect(bauFlowKontext({}, false).werkstattbindung_quelle).toBeNull()
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
