import { describe, it, expect } from 'vitest'
import { parseZB1Fields } from '../zb1-parser'

// 09.09.2026 — die erfundene Fahrzeug-Identifizierungsnummer.
//
// Bis heute war E das EINZIGE Feld ohne Feldcode-Anker: die Nummer wurde blind als erste
// 17-Zeichen-Folge aus dem gesamten Fliesstext gefischt. Alle uebrigen Felder haben ihren
// Anker seit #5243 (13.08.) — E kam damals nie in die Feldcode-Liste.

/** Wortgetreuer OCR-Rohtext aus prod, Lead b07b94a3, 25.08.2026 (leads.zb1_ocr_daten). */
const PROD_ROHTEXT_25_08 = [
  'Zulassungsbescheinigung Teil I',
  'K-3-0-231/22-00708',
  'KOLDE',
  'Bendep',
  'Deutschland',
  'K LK9307',
  '31.03.2015',
  'HT',
  'VS5222632PRO85460',
  'BEAT',
  '63',
  'SCCGPAXO',
  'SGNPM5271117MJGI',
  'IBIZA',
  'SEAT (E)',
  'P2.2.Pers bef.b. spl',
  'Mahzawackfahrzeug',
  '715/2007 630/20123',
  'LAURA VANESSA',
  'STERENGESTAGSALLER 41',
  '50939 KOLN',
  '02.2024',
  '19.08.2022',
  '7593',
  'ADNO00932',
  '252/5400',
  '263',
  'AF',
  '4043 4061',
  '3693',
  '2428 2445',
  '2049',
  '75',
  '125',
  '1540',
  '1540',
  '820',
  '770',
  '820',
  '770',
  '78',
  '3750',
  '800',
  '520',
  '17 73',
  'ESA',
  '175/70 R14 BAS',
  '175/70 R14-049',
  'Rot/',
  '16.07.2014',
  'TT 3/',
  '9*2001/116+0067+31-',
  '67061',
  'EURO5:0;PI/CI; M, N 1',
  'Benvin',
  '0001',
  '35301198',
  '0.1:1000',
  'IS STRIG TECHN. ZUL.GES-HASSE D ZUGKOMBINATION',
  ':2340KG*WW.AHK LT.EGTO',
].join('\n')

describe('Fahrzeug-Identifizierungsnummer: Feld E schlägt den Zufallstreffer', () => {
  it('REGRESSION: aus dem prod-Rohtext wird kein Wort mehr zur Nummer', () => {
    const r = parseZB1Fields(PROD_ROHTEXT_25_08)
    // Vorher stand hier "MAHZAWACKFAHRZEUG" — ein verlesenes „Mehrzweckfahrzeug" aus
    // Feld 5. Siebzehn Zeichen, kein I/O/Q, also formal gültig; über
    // ensureVehicleFromFin wanderte es in die Fahrzeug-Identität und ins Gutachten.
    expect(r.fin_vin).not.toBe('MAHZAWACKFAHRZEUG')
    // Die echte Nummer ist in diesem Scan nicht rettbar: die Erkennung las in
    // "VS5222632PRO85460" ein O statt einer 0, das Muster verbietet O. Leer ist hier
    // richtig — eine falsche Nummer in der Sicherungsabtretung wäre schädlicher.
    expect(r.fin_vin).toBeNull()
  })

  it('ein 17-Zeichen-Wort ohne jede Ziffer ist nie eine Nummer', () => {
    expect(parseZB1Fields('Mahzawackfahrzeug').fin_vin).toBeNull()
    expect(parseZB1Fields('ABCDEFGHJKLMNPRST').fin_vin).toBeNull()
  })

  it('am Feldcode E wird die Nummer erkannt — Wert in derselben Zeile', () => {
    const r = parseZB1Fields(['A XX-Z 123', 'E HMU6910000K234157', 'D.1 FIAT'].join('\n'))
    expect(r.fin_vin).toBe('HMU6910000K234157')
  })

  it('am Feldcode E wird die Nummer erkannt — Wert auf der Folgezeile', () => {
    const r = parseZB1Fields(['E Fahrzeug-Identifizierungsnummer', 'HMU6910000K234157'].join('\n'))
    expect(r.fin_vin).toBe('HMU6910000K234157')
  })

  it('Feld E gewinnt gegen einen früheren Treffer im Fließtext', () => {
    const r = parseZB1Fields([
      'W0L0AHL0855123456',   // steht weiter oben, ist aber nicht Feld E
      'E HMU6910000K234157',
    ].join('\n'))
    expect(r.fin_vin).toBe('HMU6910000K234157')
  })

  it('ohne Feld E bleibt der plausible Fließtext-Treffer erhalten', () => {
    // Rückwärtskompatibilität: Scans ohne erkennbaren Feldcode (schlechte Ausleuchtung,
    // abgeschnittene Spalte) sollen weiter funktionieren wie bisher.
    const r = parseZB1Fields(['Zulassungsbescheinigung Teil I', 'W0L0AHL0855123456'].join('\n'))
    expect(r.fin_vin).toBe('W0L0AHL0855123456')
  })

  it('die übrigen Felder des prod-Scans bleiben unverändert', () => {
    // Der Anker fasst nur die Nummer an — was vorher erkannt wurde, wird es weiterhin.
    const r = parseZB1Fields(PROD_ROHTEXT_25_08)
    expect(r.hsn).toBe('7593')
    expect(r.halter_stadt).toBe('KOLN')
    expect(r.halter_plz).toBe('50939')
    expect(r.erstzulassung).toBe('16.07.2014')
  })
})
