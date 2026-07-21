# FlowLink — operative Vollständigkeit + saubere Szenario-Struktur

**Datum:** 2026-07-21
**Status:** Design (Review offen)
**Betrifft:** self-service FlowLink (`src/app/flow/[token]/`), die DB-getriebene Szenario-Matrix (`flow_szenarien` / `flow_szenario_steps`), die pure Weichenlogik (`src/lib/self-service/`).

---

## 1 · Problem

Die Szenario-Matrix ist bewusst **Daten**, nicht Code: Jeder Step in `flow_szenario_steps` trägt eine `bedingung jsonb`, die gegen den abgeleiteten `FlowKontext` ausgewertet wird (`erfuelltBedingung`, `src/lib/self-service/flow-szenarien.ts:55`). Diese Bedingungen sind heute **Ein-Feld-Stellvertreter** (`{"feld": null}` = „zeige den Step, solange dieses eine Feld leer ist"). Das Stellvertreter-Modell kippt auf drei belegten Wegen — jeweils so, dass ein Step **still übersprungen** wird, obwohl seine Daten fehlen.

### Belegte Symptome (Live-DB `paizkjajbuxxksdoycev`, 2026-07-20)

**(1) Feststellung Kasko/Selbstzahler — strukturell tot.**
Die Bedingung ist `{"hat_vorschaeden": null}` (Mig `20260716155354`, #4430). Aber `leads.hat_vorschaeden` hat `column_default = 'false'` (Mig `20260708…`), und `istLeer(false) === false` ist **bewusst** so (`flow-szenarien.ts:41` — „false und 0 sind WERTE, sonst würde `freie_werkstattwahl=false` fälschlich als unbeantwortet gelten"). Die Bedingung ist damit **nie erfüllbar**. Live: **19/19 Leads `false`, 0 `true`, 0 `NULL`** → die Feststellung wird bei jedem Kasko/Selbstzahler-Lead übersprungen.

**(2) Ort-Steps entfallen — echter Standort nie erhoben.**
Die Steps `ort_fahrzeug` / `ort_besichtigung` hängen an den **abgeleiteten** Feldern `{"fahrzeug_standort_effektiv": null}` bzw. `{"besichtigungsort_effektiv": null}`. Die Ableitung ist eine Fallback-Kette (`flow-kontext.ts:53-55`): `fahrzeug_standort_effektiv = fahrzeug_standort_adresse ?? unfallort`, `besichtigungsort_effektiv = besichtigungsort_adresse ?? fahrzeug_standort_adresse ?? unfallort`. Da praktisch jede Eingangstür `unfallort` setzt, ist das abgeleitete Feld non-null → der Step entfällt → der **echte** Fahrzeugstandort/Besichtigungsort wird nie erfragt. Live: **8/19** Leads mit Fahrzeug-Koordinaten, **0/19** mit Besichtigungs-Koordinaten, **1/19** mit Werkstatt. Folge: Der Werkstatt-Finder ankert auf dem Fahrzeugstandort — ohne Koordinaten findet er nichts.

**(3) Ein Feld als Stellvertreter für einen ganzen Erhebungs-Block.**
Die Feststellung ist ein Multi-Micro-Step-Wizard (`feststellung-steps.ts`, `FESTSTELLUNG_STEPS`) mit ~15 Feldern (Kennzeichen, Halter, Vorschäden, Hergang, Gegner-Daten …). Ein einziges Feld (`hat_vorschaeden`) steht stellvertretend für den ganzen Block. Fällt der Stellvertreter, fällt die gesamte Erhebung.

### Zwei strukturelle Altlasten

**(4) Werkstatt wird nicht angezeigt, wenn gesetzt.**
`werkstatt`-Step hängt an `{"reparatur_werkstatt_id": null}` → sichtbar nur, solange **keine** Werkstatt gewählt ist. Ist eine gesetzt, **verschwindet** der Step, statt sie anzuzeigen. Die Regel „leer → Finder, gesetzt → anzeigen" ist nur zur Hälfte umgesetzt. Der Gutachter macht es richtig — als **zwei** Steps: `termin {sv_id: null}` (Picker) + `gutachter` (ohne Bedingung, Anzeige). Der Werkstatt fehlt der Anzeige-Gegenpart.

**(5) `nur_gutachter` ist ein Phantom-Szenario.**
`flow_szenarien` hat zwei Szenarien für denselben Anspruch (unverschuldet, `schuldfrage=gegner`): `nur_gutachter` (Prio 20, verlangt `service_typ='nur_gutachter'`, 7 Steps ohne Werkstatt/ort_fahrzeug) und `haftpflicht` (Prio 10, `service_typ=null` Wildcard, 9 Steps). Aber **keine Eingangstür setzt `service_typ='nur_gutachter'`** — es startet NULL, gewählt wird es erst am SA-Step (`FlowWizardKfz.tsx:934`, „Service-/Kanzlei-Wahl am POS"). Konsequenz: Jeder unverschuldete Lead läuft durch das **volle** `haftpflicht`-Szenario inklusive Werkstatt; das `nur_gutachter`-Szenario aktiviert sich erst beim **Resume nach der Wahl** und lässt die Werkstatt rückwirkend verschwinden. Der Kunde wird nach einer Werkstatt gefragt, obwohl seine spätere Wahl das Gegenteil bedeutet. Zusätzlich ist `weichen.feststellungZweig` (`flow-weichen.ts:76`) **toter Wert** — repo-weit nie gelesen; die Kasko-Reduktion entsteht real nur über die äußere Step-Sequenz + `conditional_on`.

---

## 2 · Modell

Ein Prinzip: **Ein Step ist sichtbar, solange operativ nötige Daten fehlen** — statt „ist dieses eine Stellvertreterfeld gesetzt". Weil die Steps unterschiedlich gebaut sind, wird das Prinzip pro Step-Art gespeist.

### 2.1 · `erhebt_felder` — Erhebungs-Steps (feststellung, ort_fahrzeug, ort_besichtigung)

Neue Spalte **`flow_szenario_steps.erhebt_felder text[]`** = die operativen **Rohspalten**, die dieser Step in diesem Szenario einsammelt. Der Step ist sichtbar, solange **mindestens eine** gelistete Spalte leer ist (`istLeer`, unverändert).

`bedingung` **bleibt koexistent** — für echte Prädikate (`{"quali_offen": true}`) und Zuordnungs-Gates (`{"sv_id": null}`). Ein Step darf beides tragen (AND-verknüpft). Damit trennt sich sauber: `erhebt_felder` = Erhebungs-Vollständigkeit, `bedingung` = Zuständigkeit/Zuordnung. Heute vermischt eine Zeile beides — daran ist es zerbrochen.

**Rohspalten, nicht abgeleitete Felder.** `erhebt_felder` liest `fahrzeug_standort_adresse`, nicht `fahrzeug_standort_effektiv`. Die `*_effektiv`-Kette bleibt erhalten, wechselt aber die Rolle: von **Tor** zu **Vorbefüllung**. Der Ort-Step erscheint, wenn die Rohspalte leer ist, und schlägt den `*_effektiv`-Wert (i.d.R. `unfallort`) als vorbefüllten Vorschlag vor — der Kunde bestätigt mit einem Klick oder korrigiert. Komfort bleibt, die Lüge („Standort ist erhoben") verschwindet.

**Skip bleibt.** Der Feststellung-Skip („vorerst überspringen", `FlowFeststellungStep.tsx:180`) bleibt verfügbar — das Gate öffnet beim Resume wieder. Niemand wird eingesperrt; wir fragen so lange, bis die operativen Daten da sind.

### 2.2 · Feststellung wird wieder scharf

Kein Default-Feld mehr als Marker. Sobald der `erhebt_felder`-Gate offen ist, rendert der Feststellung-Wizard **alle** anwendbaren Micro-Steps (`computeActiveFeststellungSteps` + `conditional_on`, unverändert) — es wird nichts ausgeschlossen. Die Kasko/Selbstzahler-Feststellung reduziert sich **automatisch** auf ① Schaden + ③ Fahrzeug, weil die ②-Gegner-Felder `conditional_on schuldfrage=gegner` tragen und `eigenverantwortung` das nicht erfüllt. Das ersetzt den toten `feststellung_zweig`.

### 2.3 · Anzeige-Step `werkstatt_anzeige`

Neuer Step ohne Bedingung, analog zum bestehenden `gutachter`. Zeigt die gewählte Werkstatt an, statt dass der Step nach der Wahl verschwindet. Der `werkstatt`-Step behält seine `bedingung {"reparatur_werkstatt_id": null}` (Picker, solange keine Wahl) — sie ist korrekt (Rohspalte, kein Default). Nur der Anzeige-Gegenpart fehlte.

### 2.4 · Kasko-Werkstattbindung-Gate

Für Kasko/Selbstzahler muss der Kunde **aktiv bestätigen**, dass seine Police keine Werkstattbindung vorschreibt und er frei wählen darf. Das Feld `leads.freie_werkstattwahl` (boolean, nullable, **kein Default → startet NULL**) existiert bereits; die Quali-Phase `werkstattbindung` (`FlowQualiStep.tsx:156`) fragt es und bricht bei „gebunden" (`false`) korrekt mit `disqualifikationsGrundKey='werkstattbindung'` ab (`quali-flow-outcome.ts:46`).

**Die Lücke:** Ein Lead, der bereits als Kasko klassifiziert reinkommt (`schuldfrage=eigenverantwortung`, `eigene_versicherung=ja` von der Tür), überspringt die Quali → die Werkstattbindungs-Frage wird nie gestellt → `freie_werkstattwahl` bleibt NULL → der Werkstatt-Step läuft unter falscher Annahme.

**Fix:** Neuer Step `werkstattbindung_check` — **nur Kasko** (ein Selbstzahler hat keine Versicherung/Police, die eine Werkstatt vorschreiben könnte), `bedingung {"freie_werkstattwahl": null}` → sichtbar, solange unbeantwortet; rendert die Bestätigungs-UI (Wiederverwendung der Quali-`werkstattbindung`-Phase). „Frei" → `freie_werkstattwahl=true` → weiter. „Gebunden" → `freie_werkstattwahl=false` + Disqualifikation über den bestehenden Pfad. Steht **vor** dem `werkstatt`-Step.

### 2.5 · `nur_gutachter` geradeziehen — es geht nur um die Kanzlei

Der Gutachter gehört **immer** zum Haftpflichtanspruch — er ist nie die Weiche. Die einzige Weiche am Flow-Ende ist die **Kanzlei-Wahl**, und sie ändert **nichts** an der Flow-Ausführung:

* **unsere Partnerkanzlei** → Fall geht operativ an die Kanzlei + LexDrive-API wird getriggert → LexDrive schickt dem Kunden die Vollmacht.
* **eigene Kanzlei** / **keine Kanzlei** → nichts davon; der Kunde reguliert selbst bzw. über seinen eigenen Anwalt.

Der Code bestätigt dieses Modell bereits an der Wurzel — `convert-lead-to-claim.ts:428`:

```
// "Komplettservice = LexDrive IMMER (Aaron): komplett -> 'partnerkanzlei'"
kanzlei_wunsch: service_typ === 'komplett' ? 'partnerkanzlei' : 'nicht_gefragt'
```

`claims.kanzlei_wunsch` trägt schon das richtige Vokabular (`partnerkanzlei | eigene_kanzlei | keine_kanzlei | noch_unentschieden | nicht_gefragt`), und der Kunde kann im Portal (`KanzleiWunschModal`) nachträglich auf eine eigene Kanzlei wechseln.

**Fix:**
1. Das `nur_gutachter`-**Szenario löschen**. Ein `haftpflicht`-Szenario für alle `schuldfrage=gegner` — Gutachter **und** Werkstatt gehören dazu, der Flow läuft für alle identisch.
2. Die Wahl bleibt am SA-Ende (Aaron), aber **konzeptionell als Kanzlei-Weiche** (Partnerkanzlei → LexDrive/Vollmacht + Kanzlei-Send; sonst nichts). Ob die UI dafür 2-wegig (`komplett`/`nur_gutachter` wie heute) oder echt 3-wegig (Partnerkanzlei / eigene / keine) ausfällt, ist Reviewpunkt §8.2.
3. Diese Weiche berührt **keinen** Flow-Step — sie steuert ausschließlich Downstream (`convert` → `kanzlei_wunsch` + LexDrive-Trigger).

### 2.6 · CI-Wächter `check:flow-erhebt-felder`

Ein Ratchet (Muster wie `check:flag-drift`) prüft jeden `erhebt_felder`-Eintrag gegen einen Schema-Snapshot und blockt:

* Felder mit **DB-Default** (hätte Symptom 1 gefangen: `hat_vorschaeden`),
* **abgeleitete** `*_effektiv`-Felder (hätte Symptom 2 gefangen),
* Spalten, die es auf `leads` **nicht gibt** (Tippfehler).

Damit wird „operativ nötige Daten werden erhoben" von einer Hoffnung zu einer CI-erzwungenen Systemeigenschaft. Der Snapshot der `leads`-Column-Defaults wird analog zu `scripts/lib/status-check-constraints.json` per READ-SQL regeneriert.

---

## 3 · Datenmodell-Änderungen

Alle DDL/Daten-Änderungen laufen über das **Supabase-Plugin** (`apply_migration`, Regel 2). Reihenfolge in Wellen (jede für sich sicher):

| Welle | Änderung | Art |
|---|---|---|
| M1 | `ALTER TABLE flow_szenario_steps ADD COLUMN erhebt_felder text[]` (nullable, Default `'{}'`) | additiv |
| M2 | `erhebt_felder` je (Szenario, Step) befüllen (§4) | Daten |
| M3 | `werkstatt_anzeige`-Step-Zeilen einfügen (haftpflicht + kasko + selbstzahler) | Daten |
| M4 | `werkstattbindung_check`-Step-Zeile einfügen (**nur kasko**) | Daten |
| M5 | `nur_gutachter`-Szenario + seine Steps löschen (`DELETE FROM flow_szenario_steps WHERE szenario_id='nur_gutachter'; DELETE FROM flow_szenarien WHERE id='nur_gutachter'`) | Daten |
| M6 | *(optional, Follow-up)* `feststellung_zweig`-Spalte droppen (toter Wert) | Aufräumen |

M5 ist erst sicher, wenn der Code das `nur_gutachter`-Szenario nicht mehr referenziert (Fixtures, Tests). Types-Regen nach M1 (`generate_typescript_types`, Regel 2 Schritt 6).

---

## 4 · `erhebt_felder` je Szenario — VORSCHLAG (Aaron reviewt)

Konkreter operativer Kern je (Szenario, Step). Spaltennamen sind agent-verifiziert (persistieren wirklich auf `leads`). „Show if any empty" ist ein **harter** Gate mit Skip-Ausweg — nur der operative Kern gehört hinein; „nice-to-have"-Felder bleiben draußen (werden erhoben, wenn der Wizard läuft, blockieren aber nicht).

### haftpflicht (Steps: zusammenfassung → feststellung → ort_besichtigung → termin → gutachter → ort_fahrzeug → werkstatt → werkstatt_anzeige → sa → account)

| Step | `erhebt_felder` (Vorschlag) |
|---|---|
| `feststellung` | `kennzeichen` · `unfallhergang` · `unfallort` · `gegner_versicherung` |
| `ort_besichtigung` | `besichtigungsort_adresse` |
| `ort_fahrzeug` | `fahrzeug_standort_adresse` |

Anmerkung zu den Orten (Aaron): Haftpflicht nutzt **beide**, initial identisch → `besichtigungsort_adresse` wird aus `fahrzeug_standort_adresse` (bzw. `unfallort`) vorbefüllt, der Kunde bestätigt/ändert.

### kasko (Steps: zusammenfassung → feststellung → werkstattbindung_check → ort_fahrzeug → werkstatt → werkstatt_anzeige → account) · selbstzahler (identisch, **ohne** werkstattbindung_check)

| Step | `erhebt_felder` (Vorschlag) |
|---|---|
| `feststellung` | `kennzeichen` · `schadentyp` |
| `ort_fahrzeug` | `fahrzeug_standort_adresse` |

(`werkstattbindung_check` nutzt `bedingung {"freie_werkstattwahl": null}`, kein `erhebt_felder`.)

⚠ **`hat_vorschaeden` ist bewusst NICHT in `erhebt_felder`** — Live-DB (2026-07-21): `column_default='false'`, der `check:flow-erhebt-felder`-Ratchet (§2.6) lehnt Default-Spalten ab. Genau dieser Default machte es als Gate untauglich (Symptom 1). Es wird weiterhin im Feststellung-Wizard als Mikro-Step erhoben — es gatet nur nicht mehr.

### teilschuld / unqualifiziert
Kein `erhebt_felder` — `teilschuld` ist nur `zusammenfassung → rueckruf`, `unqualifiziert` behält `bedingung {"quali_offen": true}`.

**Reviewpunkt für Aaron:** Erweitern/verschlanken? `hat_vorschaeden` ist als Gate technisch ausgeschlossen (DB-Default, s.o.) — es wird im Wizard erhoben, gatet aber nicht. Gehört stattdessen `gegner_kennzeichen` / `halter_*` / `unfalldatum` in den Haftpflicht-Kern? (Alle drei sind default-frei und damit gate-fähig.)

---

## 5 · Kontext-Erweiterung

`bauFlowKontext` (`flow-kontext.ts`) trägt künftig die **Rohspalten** zusätzlich zu den `*_effektiv`-Feldern in den Kontext. `erhebt_felder` liest roh, `bedingung` liest weiter abgeleitet. `istLeer` unverändert. Der Kontext bleibt pure + client-safe (der Wizard baut ihn nach dem Quali-Step ohne Server-Roundtrip neu — die neuen Rohfelder liegen bereits in `LeadFuerKontext`).

`berechneAktiveSteps` bekommt die `erhebt_felder`-Auswertung: ein Step ist aktiv, wenn `erfuelltBedingung(bedingung, kontext)` **und** (`erhebt_felder` leer **oder** ≥1 gelistetes Feld `istLeer`). Pure, unit-testbar.

---

## 6 · Betroffene Dateien (Implementierung)

| Bereich | Datei |
|---|---|
| Weichenlogik | `src/lib/self-service/flow-szenarien.ts` (`berechneAktiveSteps` + `erhebt_felder`), `flow-kontext.ts` (Rohspalten), `flow-weichen.ts`, `lade-flow-szenarien.ts` (`erhebt_felder` mitladen) |
| Ort-Prefill | `src/app/flow/[token]/FlowOrtStep.tsx` (Vorbefüllung aus `*_effektiv`) |
| Werkstatt-Anzeige | `FlowWizardKfz.tsx` (Render-Block `werkstatt_anzeige`), ggf. neue `FlowWerkstattAnzeige.tsx` |
| Werkstattbindung-Gate | neuer `werkstattbindung_check`-Render-Block + Action (`freie_werkstattwahl` setzen / disqualifizieren) |
| Kanzlei-Weiche | SA-Step Service-/Kanzlei-Wahl (`FlowWizardKfz.tsx:934`), Downstream in `convert-lead-to-claim.ts` |
| Migrationen | `supabase/migrations/` (M1–M5) |
| Ratchet | `scripts/check-flow-erhebt-felder.mjs` + `scripts/lib/flow-erhebt-felder-scan.mjs` + Snapshot + CI-Step |
| Fixtures/Tests | `src/lib/self-service/__tests__/flow-config-fixture.ts`, `flow-szenarien.test.ts` |

---

## 7 · Test-Strategie

* **Unit (pure):** `berechneAktiveSteps` mit `erhebt_felder` — Kasko-Lead mit `hat_vorschaeden=false` + leerem `kennzeichen` → Feststellung **sichtbar** (Regression zu Symptom 1). Lead mit gesetztem `unfallort` aber leerem `fahrzeug_standort_adresse` → `ort_fahrzeug` **sichtbar** (Symptom 2). Werkstatt gesetzt → `werkstatt_anzeige` sichtbar, `werkstatt` nicht.
* **Ratchet:** `check:flow-erhebt-felder` gegen einen Fixture-Snapshot mit einem Default-Feld → blockt; sauberer Fall → grün.
* **Regel 4 (Prod-Smoke nach Deploy):** Test-Lead (`telefon=NULL`) je Szenario über den echten Flow — Kasko: Feststellung erscheint, Werkstattbindungs-Häkchen erscheint, Fahrzeugstandort wird erfragt, Werkstatt-Finder findet Treffer. Haftpflicht: beide Orte, Werkstatt wird angezeigt wenn gewählt. Kanzlei-Weiche: Partnerkanzlei → LexDrive/Vollmacht; nur Gutachten → nichts.

---

## 8 · Offene Reviewpunkte (Aaron entscheidet)

1. **Exakte `erhebt_felder`-Listen** je Szenario (§4) — operativer Kern bestätigen.
2. **Kanzlei-UI am SA-Step:** die heutige 2-Wege-Wahl (`komplett`/`nur_gutachter`) auf die echte **3-Wege-Kanzlei-Wahl** (Partnerkanzlei / eigene / keine) heben, oder minimal bei 2 Wegen bleiben?
3. **`service_typ` vs. `kanzlei_wunsch`:** `service_typ` künftig aus `kanzlei_wunsch` ableiten (eine Wahrheit) oder als eigener Mechanismus behalten? (Betrifft SA-Sync-Timing + Vollmacht-Wait, die heute an `service_typ` hängen.)

---

## 9 · Nicht in Scope

* Der Entry-Point-Audit (`#23`, PR #4473) ist separat — er sagt, **welche** Daten jede Tür liefert; dieses Design sagt, **wie** der Flow den Rest einsammelt. Sie komponieren, aber die Türen selbst werden hier nicht angefasst.
* OCR/ZB1-Mechanik unverändert.
* `v_faelle`/`v_claim_base`-Retire (separates Keystone).
