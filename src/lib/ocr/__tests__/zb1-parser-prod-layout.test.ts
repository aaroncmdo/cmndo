import { describe, it, expect } from 'vitest'
import { parseZB1Fields } from '../zb1-parser'

// B5 (Ops-Test 11.08., Aaron-Entscheid „Testkorpus aus prod-Uploads"):
// ECHTER Google-Vision-Output eines Fahrzeugscheins von prod — der einzige, den es gibt
// (Erhebung 13.08.: von 233 ZB1-Dateien im Bucket sind 231 Smoke-Dummies < 2 KB, es bleiben
// 2 echte Scans; genau 1 Lead traegt `zb1_ocr_daten.raw_text`).
//
// WARUM DIESES FIXTURE ZAEHLT: die bestehende Suite (`zb1-parser.test.ts`) fuettert ein
// idealisiertes Sample, dessen Kommentar das selbst sagt — „Feld-Label auf eigener Zeile […]
// genau das Layout, das parseZB1Fields ueber die ^A$/^B$/… -Anker erwartet". Sie bestaetigt
// also das vom Code erwartete Layout statt des Layouts, das echtes OCR liefert. Dort steht
// der Feldcode MIT der amtlichen Beschriftung in EINER Zeile ("A Amtliches Kennzeichen"),
// wodurch KEIN einziger Anker greift und die Werte aus Zufalls-Fallbacks stammen.
//
// Der Schein ist der amtliche MUSTER-Fahrzeugschein („Fritzi Fahrer", „Hauptstr. 1",
// „12345 Berlin") — keine Kundendaten, daher unbedenklich als Fixture im Repo.
const PROD_ZB1_MUSTERSCHEIN = `Das steht in der Zulassungsbescheinigung
Zulassungsbescheinigung Teil I
Nr.:
(Fahrzeugschein)
B 14.01.2018
EHMU6910000K234157
01
Europäische
Gemeinschaft
D
Bundesrepublik
Deutschland
D1 FIAT
312
AXA1A
210000
40200
00000000
L2
9 1
18 3571
20 1488
13
V7 0115
7.1 00770
0051/05500
19 1627
00060
F1 001354
72 00640
G 940
Q
F2 001354
160
7.3
-
A Amtliches Kennzeichen
XX Z123
5
C1.1 Name oder Firmenname
Fahrer
00AN
D3 Fiat 500
2 FCA Italy
FZ. Z. PERS. BEF. B. 8 SPL.
Schräghecklimousine
V9715/2007*195/2013W
14 EURO6
P3 Benzin
8.1 00770
82 00640
83
-
U1 82
U2 04125
U3 74
0.1 00800
02 00400
S.1 4
$2
151 175/64 R14 82T
153
175/64 R14 82T
Rgrün
Ke3*2007/46*0064*25
623.4.2015
11 6
17 K 16 BZ926105
C1.2 Vorname(n)
Fritzi
C1.3 Anschnitt
12345 Berlin
Hauptstr. 1
Nächste HU
(Monat und Jahr):
3/2021
Berlin
Datum: 14.01.2018
C4c Der Inhaber der Zulassungsbescheinigung wird nicht
als Eigentümer des Fahrzeugs ausgewiesen
10 0001
22
14.1 26W0
P101242
21`

describe('parseZB1Fields — echtes prod-OCR-Layout (Feldcode + Beschriftung in EINER Zeile)', () => {
  const r = parseZB1Fields(PROD_ZB1_MUSTERSCHEIN)

  // ── Die vier belegten Fehlklassen aus dem Ops-Test ──────────────────────────────────

  it('liest das Kennzeichen aus Feld A statt aus zufaelligem Fliesstext', () => {
    // Vorher: "Q-F 2" — der ^A$-Anker griff nicht, also fiel der Parser auf einen
    // Fliesstext-Regex zurueck und klaubte sich aus den Zeilen "Q" + "F2 001354"
    // ein Phantom-Kennzeichen zusammen. Genau dieser Wert wird ueber `ziehVehicleNach`
    // ins Claim-Fahrzeug uebernommen und landet in SA und Gutachten.
    expect(r.kennzeichen).toBe('XX Z123')
  })

  it('trennt Nachname (C1.1) und Vorname (C1.2) korrekt', () => {
    // Vorher: nachname="Fritzi" (das ist der VORNAME), vorname=null.
    // Der Wert kam aus dem Adress-Fallback, der zwei Zeilen ueber der PLZ raet.
    expect(r.halter_nachname).toBe('Fahrer')
    expect(r.halter_vorname).toBe('Fritzi')
  })

  it('nimmt die Strasse aus C1.3 — nicht das Formular-Label selbst', () => {
    // Vorher: "C1.3 Anschnitt" — das LABEL landete als Halteranschrift im Lead.
    // Die Halteradresse geht in die Sicherungsabtretung ein.
    expect(r.halter_strasse).toBe('Hauptstr. 1')
  })

  it('liest PLZ und Ort auch wenn sie VOR der Strasse stehen', () => {
    // Dieses Layout listet "12345 Berlin" ueber "Hauptstr. 1" — umgekehrt zum
    // idealisierten Sample. Beide Reihenfolgen muessen tragen.
    expect(r.halter_plz).toBe('12345')
    expect(r.halter_stadt).toBe('Berlin')
  })

  // ── Was schon vorher stimmte: muss stimmen bleiben ──────────────────────────────────

  it('behaelt die bereits korrekten Felder (Regressionsschutz)', () => {
    expect(r.fahrzeug_hersteller).toBe('Fiat')
    expect(r.erstzulassung).toBe('14.01.2018')
    expect(r.fahrzeug_baujahr).toBe(2018)
  })

  it('lehnt die 18-stellige Zeichenkette korrekt als FIN ab', () => {
    // „EHMU6910000K234157" steht im Rohtext, hat aber 18 Zeichen — eine gueltige FIN
    // hat exakt 17. Der Parser verhaelt sich hier RICHTIG; der Ops-Test-Marker
    // („FIN nicht erkannt obwohl im Rohtext") war an dieser Stelle eine Fehldeutung.
    // Eine falsche FIN in der SA waere schaedlicher als gar keine.
    expect(r.fin_vin).toBeNull()
  })
})
