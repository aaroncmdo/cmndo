# FlowLink — DB-getriebene Szenario-Matrix (Design/Planung)

**Datum:** 2026-07-14
**Status:** Reine Planungs-/Matrix-Phase (Aaron: „erst nur die Matrix als Spec"). KEIN Implementierungs-Schnitt — die Bau-Reihenfolge entscheiden wir nach diesem Doc.
**Lane:** `kitta/flowlink-szenario-matrix` (off staging).
**Koordination:** `00fa466c` (Makler-Einstieg) — siehe §9.

## 0. Leitsatz (Aaron)

> „Es hängt alles an der `schuldfrage`. Je nachdem muss der Gutachter-Finder gezeigt werden — oder, wenn ein Gutachter vorhanden ist, eben der Gutachter. Genauso bei der Werkstatt. Und alles komplett DB-driven."

Eine Matrix, viele Türen: derselbe kanonische FlowLink wird über **verschiedene Einstiege** (Makler-QR, Web-Formular `/schaden-melden`, WhatsApp, MCP, Dispatch) gefüttert. Der Weg des Kunden ergibt sich **allein aus DB-Feldern**, nie aus dem Einstieg.

## 1. Die eine Weiche: `leads.schuldfrage`

Kanonisches Vokabular (`QualiOptionen.tsx` — Server-/State-Vertrag): **`'gegner' | 'unklar' | 'eigenverantwortung'`**. Kein neuer Wert (Aaron: „unklar ist ok, der Fall läuft dann Haftpflicht").

```
schuldfrage
  ├─ 'gegner'            → HAFTPFLICHT-Weg          (unverschuldet)
  ├─ 'unklar'            → RÜCKRUF beim Dispatch     (Teilschuld — Schuld erst klären)
  │                         └─ nach Klärung: läuft als HAFTPFLICHT weiter
  └─ 'eigenverantwortung'→ Folgefrage Kasko/Selbstzahler (PFLICHT!)
                            ├─ Kasko      → Werkstattbindung? → gebunden: HARTER ABBRUCH
                            │                                    frei:    KASKO-Weg
                            └─ Selbstzahler → SELBSTZAHLER-Weg
```

**⚠️ Die scharfe Kante (aus dem Makler-Audit):** `schuldfrage='eigenverantwortung'` **ohne** `eigene_versicherung` → `resolveAbrechnungsweg`=null → Lead wird **still disqualifiziert**. Deshalb ist die Kasko/Selbstzahler-Folgefrage **Pflicht**, nicht Kür — an jeder Tür.

## 2. Der abgeleitete `abrechnungsweg` (SSoT: `derive_abrechnungsweg`)

DB-Funktion `derive_abrechnungsweg(service_typ, schuldfrage, eigene_versicherung, schadenart)` (IMMUTABLE, Mig `20260711160327`):

| service_typ | schuldfrage | eigene_versicherung | schadenart | → `abrechnungsweg` |
|---|---|---|---|---|
| `nur_gutachter` | — | — | — | `nicht_zutreffend` |
| komplett | `gegner` | — | — | `haftpflicht` |
| komplett | `eigenverantwortung` | `ja` | — | `kasko` |
| komplett | `eigenverantwortung` | `nein` | — | `selbstzahler` |
| komplett | ∅ | — | `haftpflicht` | `haftpflicht` |
| — | sonst | — | — | `null` |

Der `abrechnungsweg` ist die **kanonische, DB-abgeleitete** Weiche für „SV-Gutachten-Route vs. Werkstatt-Route". `istWerkstattReparaturWeg(abrechnungsweg, freie_werkstattwahl)`: `selbstzahler → true`; `kasko → freie_werkstattwahl!==false`; `haftpflicht → false`.

## 3. Die vollständige Szenario-Matrix

| # | Szenario | `schuldfrage` | `service_typ` | `eigene_vers.` | `freie_wsw` | → `abrechnungsweg` | FlowLink-Ablauf | Gutachter-Finder | Werkstatt | Feststellung |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Haftpflicht-voll** | `gegner` | komplett | — | — | `haftpflicht` | Feststellung → **Gutachter** → **Werkstatt** → SA → Login | **JA** (`sv_id`∅) / Anzeige (`sv_id`✓) | nach GA | **voll** (Unfall) |
| 2 | **nur_gutachter** (HP-Variante) | `gegner`/∅ | `nur_gutachter` | — | — | `nicht_zutreffend` | Feststellung → **Gutachter** → SA → Login | **JA** / Anzeige | nein | voll (Unfall), reduziert |
| 3 | **Teilschuld** | `unklar` | komplett | — | — | (offen) | **Rückruf-Termin beim Dispatch** → nach Klärung Weg 1 | nein (erst nach Klärung) | nein | minimal |
| 4 | **Kasko-Reparatur** | `eigenverantwortung` | komplett | `ja` | true/∅ | `kasko` | Feststellung (Schaden) → **Werkstatt anbieten** → (KVA) | **NEIN** | **JA** (`repwsk_id`∅) / Anzeige (✓) | **nur Schaden+Fahrzeug** |
| 5 | **Kasko-werkstattgebunden** | `eigenverantwortung` | komplett | `ja` | **false** | `kasko` | **Harter Abbruch** (`KaskoEndansicht`) | — | — | — |
| 6 | **Selbstzahler-Reparatur** | `eigenverantwortung` | komplett | `nein` | — | `selbstzahler` | Feststellung (Schaden) → **Werkstatt anbieten** → (KVA) | **NEIN** | **JA** (`repwsk_id`∅) / Anzeige (✓) | **nur Schaden+Fahrzeug** |
| 7 | **Reine Werkstatt-Vermittlung** | egal | — | — | — | (werkstatt gesetzt) | Werkstatt anzeigen, ggf. KVA | **NEIN** | **Anzeige** (schon vermittelt) | minimal |

## 4. Die Anzeige-Regel (durchgängig, Aarons Kern)

Für **beide** Vermittlungen — Gutachter UND Werkstatt — dieselbe DB-getriebene Regel:

```
Gutachter:  sv_id IS NULL                → Gutachter-Finder zeigen
            sv_id IS NOT NULL            → zugeordneten SV ANZEIGEN (kein Finder)
Werkstatt:  reparatur_werkstatt_id NULL  → Werkstatt-Finder zeigen (Follow-up-Komponente)
            reparatur_werkstatt_id gesetzt → zugeordnete Werkstatt ANZEIGEN
```

Kein Doppel, kein „loses Ende". Diese Regel ersetzt das heutige rein terminzustands-gegatete `needsBooking`.

### Je Vermittlung existieren ZWEI Finder (Aaron) — symmetrisch

| | **Embed = Einstieg** (anonym, noch kein Lead) | **Im FlowLink** (Lead existiert) |
|---|---|---|
| **Gutachter** | `embed/gutachter-finder` (FinderMap + Wizard) → **legt Lead an** → FlowLink | `FlowSlotStep` — nur wenn **`sv_id` leer** |
| **Werkstatt** | `embed/werkstatt-finder` → **legt Lead an** → FlowLink | `FlowWerkstattStep` — nur wenn **`reparatur_werkstatt_id` leer** |

Gleiche Matching-Engine, gleiche Begründungen — Unterschied ist **nur die Persistenz** (Embed legt einen Lead **an**, der FlowLink-Finder ordnet dem **bestehenden** Lead zu).
⚠️ **Doppel-Lead-Falle** (im Makler-Audit beim Gutachter-Finder real): Ein Embed-Finder, der `INSERT`t, obwohl schon ein Lead existiert, erzeugt einen zweiten. Der Embed muss einen optionalen `leadId`/Token annehmen → **UPDATE statt INSERT**.

## 5. Die Feststellung wird zweigeteilt

Die Feststellungs-Felder existieren bereits; sie werden **zweig-abhängig** gezeigt:

| Feld-Gruppe | Haftpflicht / Teilschuld | Kasko / Selbstzahler |
|---|---|---|
| **Unfall** (Gegner, Gegner-Versicherung, Polizei, Zeugen, Hergang, Personenschaden) | **JA** | **NEIN** (irrelevant, bläht auf) |
| **Schaden** (was ist kaputt, Schaden-Umfang) | JA | **JA** (Kern fürs Werkstatt-Matching) |
| **Fahrzeug** (Marke, Fahrzeugklasse [Schwacke], FIN/Kennzeichen) | JA | **JA** (Kern fürs Werkstatt-Matching) |
| **Schadenfotos** | JA | **JA** (im besten Fall) |

Kasko/Selbstzahler-Feststellung fokussiert also auf **„was ist kaputt + welches Auto"** — genau die Signale, die die passende Werkstatt bestimmen.

## 6. Werkstatt-Matching (DB-driven) → eigener Spec B

**→ `2026-07-14-werkstatt-matching-foundation-design.md`** (Ranking, DDL, OCR, zwei Finder-Surfaces).

Kurzfassung: **bis zu 5 Vorschläge**, gerankt, jeder mit **sichtbarem Grund**, im FlowLink auswählbar (kein Auto-Assign).
* **Harte Filter:** Fahrzeug-Gruppe (kann die Werkstatt das Fahrzeug?) + Gewerke (kann sie den Schaden? — confidence-gated).
* **Ranking:** Marken-Match („BMW markengebunden schlägt freie Werkstatt") > Gewerke-Fit > verifiziert > **Entfernung zum Fahrzeugstandort**.
* **Fahrzeugklasse = EU-/KBA-Klasse aus dem Fahrzeugschein (Feld J)** — NICHT die Schwacke-Nutzungsausfall-Klassen (die gibt es separat für Tagessätze). ⇒ **deterministisch, kein KI**: der ZB1-OCR liest HSN/TSN heute schon aus und **wirft sie weg** (`dbField: null`), und Feld J liest er gar nicht.
* Die **Schaden→Gewerke-KI** (`klassifiziereSchadenbild`, Confidence-gated) **existiert bereits produktiv** und bleibt.

## 7. Werkstatt-Auftrags-Steuerung (ergibt sich aus dem Weg)

| Weg | Werkstatt-Auftrag |
|---|---|
| **Selbstzahler / Kasko** | **KVA-Auftrag mit Reparatur** (Werkstatt kalkuliert + repariert; kein SV dazwischen) |
| **Haftpflicht** | **nur Reparatur** + die Werkstatt muss sehen: **wann kommt der Gutachter / wann ist die Besichtigung**. Normalfall: Besichtigung **vor** der Werkstatt — außer der Kunde bucht den Gutachter aus der Werkstatt heraus. |

## 8. Einstiegspunkte (dieselbe Matrix, viele Türen)

Jede Tür setzt `schuldfrage` (+ ggf. `eigene_versicherung`, `service_typ`) und übergibt an denselben kanonischen FlowLink:

| Tür | wer setzt schuldfrage | Status |
|---|---|---|
| Makler-QR `/m/<code>` → Finder → FlowLink | Kunde im Finder/Quali | ✅ läuft (Makler-Audit) |
| Makler-Anfrage-Drawer | **Makler** (00fa466c baut das) | 🔧 `00fa466c` |
| Web `/schaden-melden?p=<code>` | Kunde im Mini-Wizard | ⚠ Promo-Regex-Bug (00fa466c) |
| WhatsApp / MCP (`melde_schaden`) | KI-Dialog | prüfen |
| Dispatch (manuelle Anlage) | Dispatcher | prüfen |

**Follow-up (Aaron):** alle Einstiegspunkte klar/eindeutig/operativ-logisch machen — eigener Spec.

## 9. DB-Ist-Zustand + die Lücke (der eigentliche Fix)

Die Weichen-Logik **existiert und ist getestet**, wird aber **nur spät gefüttert** (im `/flow`-Quali-Step) und **nicht** an `needsBooking` gekoppelt:

* `needsBooking` (`flow/[token]/page.tsx:273`) ist **rein terminzustands-gegatet** (`!terminMitSv && !terminPending && FLAG`) — **nicht** `abrechnungsweg`-gegatet.
* Selbstzahler/Kasko werden heute nur **zufällig** ausgeschlossen (Quali-Short-Circuit → `account`). **Bricht**, wenn ein Lead `schuldfrage` **schon gesetzt** mitbringt (`qualiPending=false`, kein Quali-Step) → sieht fälschlich den Gutachter-Finder. **= Aarons „loses Ende".**
* Das **Kunde-Portal** macht die Weiche bereits sauber DB-getrieben (`GeldZone`/`StatusZone` via `istWerkstattReparaturWeg`) — **nur der /flow ist inkonsistent.**

**Der Kern-Fix:** `needsBooking`/`needsWerkstatt`/den Feststellungs-Zweig **DB-getrieben** an `derive_abrechnungsweg`/`istWerkstattReparaturWeg` koppeln — konsistent mit dem Portal, unabhängig vom Einstieg. Config-getrieben statt der heutigen hardcodierten STEPS-Zweige.

## 10. Scope-Dekomposition (Vorschlag — nach diesem Doc entscheiden)

1. **Spec A — FlowLink-Weichenlogik DB-driven** (der Kern-Fix): `needsBooking`/`needsWerkstatt`/Feststellungs-Zweig an `abrechnungsweg` koppeln; Teilschuld→Rückruf; Kasko/Selbstzahler→kein GA + Werkstatt-Angebot; Feststellung zweigeteilt; Gutachter/Werkstatt anzeigen-wenn-vorhanden. Config-getrieben.
2. **Spec B — Werkstatt-Matching-Foundation** (DDL): Werkstatt-Attribute (Marke/Schwacke-Klasse/frei) + Feststellungs-Schaden-Felder + Matching-Logik.
3. **Spec C — Werkstatt-Finder-Komponente** (UI, parallel zum Gutachter-Finder).
4. **Spec D — Einstiegspunkte** vereinheitlichen (alle Türen → kanonischer FlowLink, inkl. Promo-Regex-Fix falls nicht von 00fa466c).
5. **Spec E — Werkstatt-Auftrags-Steuerung** (KVA vs. Reparatur + Gutachter-/Besichtigungs-Timing).

## 11. Koordination

* **`00fa466c`** (`kitta/makler-finder-flowlink`): Makler-Einstieg — `schuldfrage`+Kasko-Folgefrage+Kennzeichen+`polizei_vor_ort` im `NeueAnfrageDrawer` → `erstelle-anfrage.ts` → `createLead`. **Geteilte Dateien `erstelle-anfrage.ts` + `NeueAnfrageDrawer.tsx` fasse ich NICHT an.** Meine Lane = was der FlowLink mit dem Wert macht (§9).
* **Ort-Zwilling** (aus dem Makler-Audit): `besichtigungsort_*` (Kopierliste Lead→Fall) vs. `fahrzeug_standort_*` (nur convert-Fallback) — gehört konsolidiert; relevant für Feststellung/Werkstatt-Geo. Nicht in Spec A.

## 12. Offene Punkte (für die Bau-Specs, nicht für die Matrix)

* Rückruf beim Dispatch: eigener Slot-Typ oder offene Dispatch-Anfrage? (AAR-956-Reservierung als Baustein prüfen.)
* Werkstattbindung-Abbruch: aktive Meldung an Dispatch/Makler via `emitEvent` (Infra existiert) — Follow-up, Aaron bestätigt „kommt noch".
* Schwacke-Klassen-Taxonomie: konkrete Liste in Spec B.
