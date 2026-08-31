# Befunde — kompletter Kundenfluss bis Abschluss (prod)

> Gefahren 31.08.2026 per Playwright gegen `app.claimondo.de`, echte Eingaben, jeder
> Zustandsübergang ein echter Klick. Soll vorab: `docs/2026-08-31-operatives-soll-kompletter-kundenfluss.md`.

## Ergebnis in einem Satz

**Der Claim läuft durch — dreimal, reproduzierbar.**

| Lauf | Weg | Claim | Ergebnis |
|---|---|---|---|
| **A** | Haftpflicht · nur Gutachten | `CLM-2026-06271` | ✅ 18 Schritte |
| **B** | wie A, **Abrechnungsfrage übersprungen** | `CLM-2026-06272` | ✅ Werkstatt-Step akzeptierte die Auswahl (#5734 greift) |
| **C** | wie A, bis zum Endbildschirm | `CLM-2026-06278` | ✅ „Geschafft!" erreicht |

Alle drei: `service_typ=nur_gutachter`, `sa_unterschrieben=true`, Lead `umgewandelt`,
FlowLink `abgeschlossen`, SV zugewiesen, `kanzlei_wunsch='nicht_gefragt'` (korrekt — bei
„nur Gutachten" wird nicht nach Anwalt gefragt).

Was fehlt, liegt **nicht** im Datenfluss, sondern in dem, was der Kunde erfährt.

⚠ **Korrektur eines eigenen Zwischenbefunds:** Der erste Lauf meldete „Sackgasse bei
Schritt 14/18". Beides war mein Messfehler — ein zu früh abbrechender Walker (Ladezustand)
und ein Kalender-Chevron, dessen Name für Hilfstechnik auf `Weiter` passt. Nach beiden
Korrekturen lief der Weg bis zur Unterschrift durch. Die Befunde unten sind die, die
**nach** dieser Korrektur stehen geblieben sind.

---

## 🔴 Blocker — der Kunde bleibt ohne Information

### F1 · Nach der Unterschrift erfährt er auf keinem Kanal etwas
Er unterschreibt eine **Sicherungsabtretung** (ein Vertrag) — danach:

| Zeitpunkt | Kanal | Inhalt |
|---|---|---|
| 11:20:29 | WhatsApp → **Team** | „🔔 Neuer Lead" |
| 11:20:30 | WhatsApp → **Kunde** | Login-Link |
| 11:34:37 | `gruppenchat` (nur **in** der App) | „Fall CLM-2026-06271 wurde erstellt" |

**Keine WhatsApp, keine E-Mail nach der Beauftragung.** Die einzige Nachricht liegt in
einem Chat, den er von sich aus aufrufen müsste — und zu dem er keinen Weg hat (→ F2).
Für die *Meldung* gibt es eine Bestätigung, für den *Vertragsabschluss* nicht.

### F2 · Beide Abschluss-Bildschirme bieten **null** Aktionen
Es gibt zwei, und keiner führt weiter (beide gemessen, `innerText` + Button-Zählung):

| Wann | Text | Aktionen |
|---|---|---|
| **direkt nach der Unterschrift** (`step_account`) | „Geschafft! / Ihr Fall wurde erfolgreich erstellt." | **0** |
| **beim erneuten Öffnen des Links** (`done`) | „✅ Geschafft! Ihre Schadenmeldung ist bereits eingegangen …" | **0** |

Es fehlen auf beiden: die **Fallnummer** (`CLM-2026-06278` steht nirgends), ein Weg in den
eben angelegten Chat, ein Beleg der unterschriebenen Sicherungsabtretung, der Name des
zugewiesenen Gutachters, der offene Terminstatus.

⚠ Der erste Screen zeigt **gleichzeitig** „Geschafft!" **und** einen laufenden Spinner
„Einen Moment, wir schließen alles ab …" — fertig und nicht fertig auf einem Bildschirm.

### F3 · Der Wiederkehr-Text sagt das Falsche
Wer seinen Link später nochmal öffnet (z. B. aus der WhatsApp), liest „Ihre
**Schadenmeldung** ist bereits eingegangen" — dabei hat er **beauftragt und unterschrieben**.
Der Text beschreibt den Zustand von vor der Unterschrift. „melden uns in Kürze" nennt weder
Frist noch Kanal.

### F3b · Doppelter Satz auf dem Abschluss-Screen
`sub` = „Ihr Fall wurde erfolgreich erstellt." und `success_text` = „Ihr Fall wurde
erfolgreich erstellt. Wir kümmern uns…" — derselbe Satz zweimal untereinander.
**Nur in `de`** (die anderen 5 Locales sind sauber). → gefixt.

### F16 · Das Kundenkonto entsteht erst, wenn er auf der Seite bleibt
Die Konto-Anlage läuft **client-seitig nach** der Unterschrift (`creatingAccount` →
`setAccountCreated`). Gemessen über die drei Läufe:

| Lauf | Browser nach Unterschrift | Claim | Profil |
|---|---|---|---|
| A | sofort geschlossen | ✅ | **0** |
| B / C | blieb offen | ✅ | 1 |

Wer den Tab direkt nach dem Unterschreiben schließt, hat einen **Fall ohne Zugang**: Der
Claim existiert, das Konto nicht — und sein FlowLink zeigt ab da nur noch den karg-en
`done`-Screen ohne jede Aktion (F2). ⚠ Kein Fehler, keine Meldung, kein Nachholpfad.

---

## 🟠 Falsch oder irreführend

### F4 · Dieselbe Pflichtfrage zweimal
| Schritt 5 | Schritt 17 |
|---|---|
| „Reparatur oder Auszahlung?" | „Wie möchtest du den Schaden abrechnen? *" |
| Reparatur · Fiktive Abrechnung · Noch unentschieden | Reparatur · Fiktive Abrechnung · Noch unentschieden |

Identische Optionen, zweimal beantwortet — die zweite als Pflichtfeld markiert.

### F5 · Der Default arbeitet gegen „nur Gutachten"
Auf dem Unterschrifts-Screen ist **„Komplettservice (empfohlen)" vorausgewählt**. Wer nur
das Gutachten will, muss aktiv abwählen — direkt über der Unterschrift.

### F6 · „SA unterzeichnen"
Der Button, mit dem der Kunde einen Vertrag schließt, trägt eine interne Abkürzung.
„SA" steht nirgends auf dem Bildschirm ausgeschrieben.

### F7 · Umlaut-Verstoß im Vertragstext
> „Anwalt + Vollmacht inkl. — 0 EUR, wir regeln alles **fuer** Sie"

Verstoß gegen AGENTS.md §Sprache, an der prominentesten Stelle des Flusses.

### F8 · Anrede wechselt **innerhalb eines Bildschirms**
„Mit **Ihrer** Unterschrift…" · „Wie möchtest **du** den Schaden abrechnen?" · „wichtig für
**dein** Gutachten" · „kostenlos für **Sie**" · „**IHRE** UNTERSCHRIFT".
→ gehört in die laufende Anrede-Lane (`COORDINATION-kundensicht-anrede-und-geld-pr-kette`),
hier nur als Fundstelle notiert, **nicht** angefasst (fremde PR-Kette offen).

### F9 · Testdaten im echten Kundenweg — **5 von 32 Werkstätten**
Schritt 18 sagt wörtlich: „Ihr Fahrzeug wird zu **SMOKE WF-Werkstatt mth00495-d9bb2b54,
Köln** gebracht."

Gemessen: `select … from werkstaetten where name ~* '(smoke|test|dummy|fixture)'` →
**5 Treffer, alle `status='aktiv'`** = 16 % des produktiven Pools. Ein echter Kunde kann
eine davon zugewiesen bekommen.

⚠ **Nicht eigenmächtig deaktiviert** — parallel laufende Werkstatt-Smokes anderer Sessions
hängen an genau diesen Datensätzen (belegt: `throwaway-kunde-repweg-…@claimondo.test`,
31.08. vormittags). Erst klären, welche Fixture wem gehört; sonst bricht man fremde Läufe.
Sauberer Zielzustand wäre ein `ist_testaccount`-Äquivalent wie bei `sachverstaendige`,
das der Matching-Filter respektiert — statt Deaktivieren.

---

## 🟡 Zu viel / zu wenig

### F10 · Fortschrittsanzeige stimmt nicht
Angezeigt „6 von 7" bzw. „3 von 8" — tatsächlich gelaufen: **18 Schritte**. Die Zahl
verspricht durchgehend etwas anderes, als der Weg hält.

### F11 · Jeder Schritt ist überspringbar
„Vorerst überspringen" auf 12 von 18 Schritten. Man kann bis zur Unterschrift
durchklicken, ohne eine einzige Angabe zu machen.

### F12 · Der Unterschrifts-Screen trägt vier Entscheidungen
Abrechnungsart (Pflicht) + Service-Umfang + Sicherungsabtretung lesen + AGB-Häkchen +
Unterschrift — auf einem Bildschirm.

### F13 · „Fahrzeugschein fotografieren" bietet vier Auswege
„Foto aufnehmen" · „Überspringen" · „Lieber ohne Foto — Fahrzeugdaten manuell eingeben" ·
„Weiter" · „Vorerst überspringen". Drei davon bedeuten dasselbe.

### F14 · Terminangebot ohne Ausweichtag
Angeboten wurden nur Slots **am selben Tag** (Mo., 31.08., 13:40 / 14:20 — gemessen
gegen 11:30 Uhr). Wer heute nicht kann, hat nur „Termin lieber später vereinbaren".

---

## 🔧 Testbarkeit (kein Kundenfehler, aber es blockiert Regel 4)

### F15 · Der Buchungspfad ist auf prod nicht smokebar — die Vorrichtung dafür ist leer
Ein interner Lead bekommt **echte** SVs angeboten; beim Klick lehnt der Test-SV-Guard ab
(`writes.ts` → `code:'test_guard'`). Das ist **so gewollt** (der Guard sperrt die
Konstellation, nicht die Uhrzeit) und trifft echte Kunden **nicht**.

Dafür existiert eine gebaute Ausnahme — `e2e_test_fixtures` (Mig `20260812152026`): ein SV,
der fürs Matching echt zählt, für den Guard als Test. **Die Tabelle ist leer** (gemessen).
Folge: Genau der Schritt, an dem der Termin entsteht, ist end-to-end nie bewiesen.

⚠ **Nicht eigenmächtig befüllen:** Ein Eintrag macht den betreffenden SV für **echte**
Kunden unbuchbar (Guard-Matrix: echt → Test = BLOCK). Das ist eine Aaron-Entscheidung,
kein Nebenbei-Fix.

---

## Stand der Abarbeitung

### ✅ Erledigt in diesem PR

| # | Was | Nachweis |
|---|---|---|
| **F7** | Umlaute in den DB-Texten (`onboarding_felder`): **8 Datensätze**, `fuer Sie`→`für Sie`, `Kfz-Schaeden`→`Kfz-Schäden`, `kuemmern`, `uebergeben`, `Sachverstaendigen`. Migration `20260831114106`. | **live auf prod bewiesen** — Lauf B las danach „wir regeln alles **für** Sie" (vorher „fuer"). `noch_kaputt: 0` |
| **F6** | „SA unterzeichnen" → „Beauftragung unterschreiben" (alle 6 Locales; en/pl/tr/ru/ar trugen dasselbe Kürzel) | JSON validiert; Regel-4-Smoke **offen bis Deploy** |
| **F3b** | Doppelter Satz auf dem Abschluss-Screen (nur `de`) | JSON validiert; Regel-4 offen |

⚠ **Beim Umlaut-Fix bewusst ausgelassen:** `unfall_zeitfenster` → `"value": "ueber_monat"`.
Das ist ein **DB-Schlüssel**, kein sichtbarer Text — ihn zu „korrigieren" hätte den
gespeicherten Wert von der Anzeige entkoppelt. Der sichtbare Teil („> 1 Monat") war korrekt.

### Offen — nach Wirkung sortiert

| # | Befund | Warum es hier liegen bleibt |
|---|---|---|
| **F1** | Keine Bestätigung nach der Beauftragung | ⚠ sendet echte Kunden-Comms → **Aaron-Go nötig** |
| **F16** | Konto entsteht nur, wenn der Tab offen bleibt | Server-seitig nachziehen oder Nachholpfad — Eingriff in die Abschluss-Action |
| **F2** | Abschluss ohne Fallnummer / ohne Weg weiter | `onSigned` reicht nur die `fallId` durch; die Fallnummer bräuchte eine erweiterte Action-Rückgabe. ⚠ Nachbar-Session arbeitet am Claim-Stepper — nicht parallel anfassen |
| **F4** | Abrechnungsfrage zweimal | Fachentscheidung: welche der beiden Stellen entfällt |
| **F5** | „Komplettservice" vorausgewählt | Produktentscheidung Aaron |
| **F8** | Anrede du/Sie gemischt | gehört in die laufende Anrede-Lane (fremde PR-Kette offen) |
| **F9** | 5 Testwerkstätten im Pool | fremde Smokes hängen daran (s. o.) |
| **F10–F14** | Fortschrittszahl, Skip-Wildwuchs, überfrachteter Screen, vier Auswege, Termine nur heute | UX-Sammelposten |
| **F15** | `e2e_test_fixtures` leer | ⚠ Befüllen macht einen echten SV für echte Kunden unbuchbar → **Aaron-Entscheidung** |
