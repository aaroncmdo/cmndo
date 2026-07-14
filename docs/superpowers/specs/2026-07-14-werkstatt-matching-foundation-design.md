# Werkstatt-Matching-Foundation (Design/Planung)

**Datum:** 2026-07-14
**Status:** Planung. Folge-Spec **B** aus `2026-07-14-flowlink-szenario-matrix-design.md` (§10).
**Lane:** `kitta/flowlink-szenario-matrix` (off staging).
**Zweck:** Bei Kasko/Selbstzahler (kein Gutachter) muss der Kunde **genau die passende Werkstatt** vorgeschlagen bekommen — mit echtem, sichtbarem Grund.

## 0. Aaron-Vorgaben (verbindlich)

* **Bis zu 5 Vorschläge**, im FlowLink auswählbar — **kein** Auto-Assign.
* Jeder Vorschlag trägt einen **wirklichen Grund, warum er passt**.
* Ranking-Kriterien: **Marke** („BMW markengebunden schlägt freie Werkstatt"), **Schaden** (kann sie das reparieren), **Fahrzeugklasse** (kann sie das Fahrzeug), **Entfernung** (Anker = Fahrzeugstandort).
* Der **Werkstatt-Finder wird analog zum Gutachter-Finder** gebaut.
* **Zwei Werkstatt-Finder** (s. §5): der **Embed** ist ein *Einstieg*; der **FlowLink-Finder** greift, *falls im FlowLink keine Werkstatt gesetzt ist*.
* Alles **DB-driven**.

## 1. Ist-Stand (live verifiziert)

**Existiert produktiv — die schwerste Achse ist schon gebaut:**

| Baustein | Wo |
|---|---|
| Schaden-Kategorie-Enum (`karosserie/lackierung/mechanik/glas/smart_repair`) | `leads.schadenskategorie` + `claims.schadenskategorie` |
| Werkstatt-Fähigkeiten (dasselbe Vokabular; NULL/leer = Vollservice) | `werkstaetten.faehigkeiten text[]` |
| **KI-Schadensklassifikation** (Fotos → Gewerke + Confidence) | `src/lib/werkstatt/bedarf/schadenbild-gewerke.ts` (Claude Haiku 4.5 Vision) |
| Deterministische Gewerke-Ableitung aus dem Gutachten (Stunden > 0) | `src/lib/werkstatt/bedarf/gutachten-gewerke.ts` |
| **Evidenz-Eskalation** Gutachten (100) > Foto-KI > manuell (40) > unbekannt | `ermittle-bedarf.ts` → `bedarf_kategorien/_quelle/_confidence` (leads+claims) |
| Fit + Confidence-Gate (ab 60 hart filtern) | `bedarf/fit.ts` `computeFit`, `bedarf/qualifiziere.ts` |
| Geo-Ranking (Haversine, 5 nächste) + `verifiziert`-Sekundärsort | `src/lib/werkstatt/finder.ts`, `vermittlung-server.ts` |
| Daten | **16 Werkstätten** auf prod, 14 mit `faehigkeiten` |

**Fehlt komplett:** **Marke** (keine Spalte auf `werkstaetten`, Matching filtert nie danach) und **Fahrzeugklasse** (nirgends persistiert).

## 2. Fahrzeugklasse = EU-Fahrzeugklasse (Fahrzeugschein, Feld J) — deterministisch

**Nicht** die Schwacke-Nutzungsausfall-Klassen (A–L, die gibt es separat für Tagessätze). Gemeint sind die **EU-/KBA-Fahrzeugklassen**, die **in jedem Fahrzeugschein stehen**: `L1e–L7e` (Krafträder/Quads), `M1` (PKW/Wohnmobil ≤8 Sitze), `M2/M3` (Busse), `N1` (Transporter ≤3,5 t), `N2/N3` (LKW), `O1–O4` (Anhänger), `T/C` (Traktoren), `R/S` (Land-/Forst-Arbeitsgeräte).

⇒ **Kein KI-Mapping, keine Schwacke-Lizenz.** Die Klasse wird **erfasst**, nicht geschätzt.

### Der Hebel: der ZB1-OCR wirft heute Daten weg

`src/lib/ocr/zb1-fields.ts` liest **HSN (2.1) + TSN (2.2) bereits aus** — und verwirft sie: `dbField: null`. Die Spalten `hsn`/`tsn` **existieren auf `leads` UND `vehicles`**. Und **Feld J (Fahrzeugklasse) wird gar nicht gelesen**.

⇒ **HSN/TSN = reiner Mapper-Fix, kein DDL.** **Feld J = ein neues OCR-Feld** + eine neue Spalte.

### Reparatur-Fahrzeuggruppen (Werkstatt denkt nicht in „M1")

Deterministische Mapping-Tabelle EU-Klasse → **Reparatur-Gruppe**; die Werkstatt gibt ihre Fähigkeit auf Gruppen-Ebene an:

| Reparatur-Gruppe | EU-Klassen |
|---|---|
| `pkw` | M1 |
| `transporter` | N1 |
| `lkw` | N2, N3 |
| `bus` | M2, M3 |
| `motorrad` | L3e, L4e |
| `leichtfahrzeug` | L1e, L2e, L5e, L6e, L7e |
| `anhaenger` | O1–O4 |
| `land_forst` | T, C, R, S |

**Fallback**, wenn kein Schein vorliegt: der Anspruchsrechner leitet bereits per Claude Vision ein `segment` aus dem Fahrzeugfoto ab (`embed/anspruch-pruefen/actions.ts`) — heute nur in einer Session-Tabelle geparkt. Taugt als *Vorbefüllung*, nie als SSoT.

## 3. DDL (additiv)

**Werkstatt** (`werkstaetten`):
```
marken               text[]    -- {BMW, MINI} — welche Marken sie fuehrt
ist_freie_werkstatt  boolean   -- markenoffen (repariert alle Marken)
fahrzeug_gruppen     text[]    -- {pkw, transporter} — welche Reparatur-Gruppen
```

**Fahrzeug** (`vehicles` = SSoT) **und** `leads` (der Flow läuft vor dem Convert auf `leads`):
```
fahrzeugklasse       text      -- EU-Klasse aus Schein Feld J: 'M1' | 'N1' | 'L3e' | ...
```
`hsn`/`tsn`: **kein DDL** — existieren bereits auf beiden. Lead→Claim/Vehicle-Kopierliste um `fahrzeugklasse` erweitern.

**OCR** (`zb1-fields.ts`): Feld **`J`** ergänzen (`dbField: 'fahrzeugklasse'`), `2.1`/`2.2` von `dbField: null` auf `'hsn'`/`'tsn'` setzen.

## 4. Die Matching-Engine (eine, geteilt)

**Input:** Fahrzeug-Gruppe (aus `fahrzeugklasse`), Marke (`hersteller`), Gewerke-Bedarf (`bedarf_kategorien` + `bedarf_confidence`), Geo-Anker = **Fahrzeugstandort** (`fahrzeug_standort_*` → Besichtigungsort → PLZ).

**Harte Filter (Ausschluss):**
1. `status = 'aktiv'`
2. **Fahrzeug-Gruppe** muss in `werkstaetten.fahrzeug_gruppen` liegen (PKW-Werkstatt ≠ LKW). Leer = unbekannt → nicht ausschließen, aber schlechter ranken.
3. **Gewerke:** `bedarf ⊆ faehigkeiten` — hart filtern **ab `bedarf_confidence >= 60`** (bestehendes Gate). Darunter: nicht ausschließen, als `unbekannt` ranken.

**Ranking (Sortierung der Top 5):**
1. **Marken-Match** — Werkstatt führt die Marke > freie Werkstatt > unbekannt. *(„BMW markengebunden schlägt freie Werkstatt")*
2. **Gewerke-Fit** — `passt` > `unbekannt` > `passt_nicht`
3. **`verifiziert`**
4. **Entfernung** (Haversine zum Fahrzeugstandort), aufsteigend

**Output:** bis zu **5** Werkstätten, jede mit **strukturierten Begründungen** (nicht Prosa — Chips, die die UI rendert):
```
gruende: [
  { typ: 'marke',    text: 'BMW-Vertragswerkstatt' },
  { typ: 'gewerk',   text: 'Repariert Karosserie + Lackierung' },
  { typ: 'klasse',   text: 'Kann PKW (M1)' },
  { typ: 'distanz',  text: '3,2 km vom Fahrzeugstandort' },
  { typ: 'trust',    text: 'Verifizierter Partner' },
]
```
**Kein Auto-Assign** — der Kunde wählt.

## 5. Zwei Werkstatt-Finder (Aaron), symmetrisch zum Gutachter

| | **Embed = Einstieg** (anonym, kein Lead) | **FlowLink** (Lead existiert) |
|---|---|---|
| **Gutachter** | `embed/gutachter-finder` (FinderMap + FinderWizard) → **legt Lead an** → FlowLink | `FlowSlotStep` — nur wenn **`sv_id` leer** |
| **Werkstatt** | `embed/werkstatt-finder` → **legt Lead an** → FlowLink | `FlowWerkstattStep` — nur wenn **`reparatur_werkstatt_id` leer** |

* **Gleiche Engine** (§4), gleiche Begründungs-Chips, gleiche UI-Sprache. Unterschied ist **nur die Persistenz**: Embed = Lead **anlegen**; FlowLink = bestehendem Lead **zuordnen** (`waehleWerkstattFlow`).
* **Anzeige-Regel (durchgängig):** Werkstatt gesetzt → **anzeigen**, kein Finder. Analog `sv_id`.
* ⚠️ **Doppel-Lead-Falle** (aus dem Makler-Audit, beim Gutachter-Finder real): Ein Embed-Finder, der `INSERT`t, während schon ein Lead existiert, erzeugt einen zweiten Lead. Der Embed-Finder muss einen optionalen `leadId`/Token annehmen und dann **UPDATE statt INSERT** fahren.
* Im Embed werden Fahrzeug-/Schadendaten **im Wizard erfasst** (analog `FinderWizard`); im FlowLink kommen sie **aus der Feststellung** (Kasko/Selbstzahler-Zweig: was ist kaputt + Fahrzeug + Fotos).

## 6. Wo KI bleibt (und wo nicht)

* **Schaden → Gewerke:** KI **bleibt** (`klassifiziereSchadenbild`, Confidence-gated) — steht produktiv, wird nicht angefasst.
* **Fahrzeugklasse:** **kein** KI — Feld J aus dem Schein. KI-`segment` nur als Vorbefüllung, wenn kein Schein da ist.
* **Marke:** **kein** KI — steht im Schein (D.1) und auf `vehicles.hersteller`.
* **Ranking:** **kein** KI — deterministische Sortierung (§4). Die Begründung muss nachvollziehbar sein; ein LLM-Ranking wäre weder erklärbar noch stabil.

## 7. Auftrags-Steuerung (folgt aus dem Weg — Spec E)

* **Selbstzahler / Kasko** → Werkstatt bekommt einen **KVA-Auftrag mit Reparatur**.
* **Haftpflicht** → **nur Reparatur** + die Werkstatt muss sehen, **wann der Gutachter kommt / wann die Besichtigung ist** (Normalfall: Besichtigung vorher — außer der Kunde bucht den Gutachter aus der Werkstatt heraus).

## 8. Offene Punkte

* Marken-Vokabular: freie Liste (`text[]`) vs. Referenztabelle. Vorschlag: `text[]` + normalisiert (uppercase), Referenz später.
* Datenpflege der 16 Werkstätten (Marken/Gruppen) — Admin-UI oder einmaliges Seeding?
* `fahrzeug_gruppen` leer = „kann alles" (wie `faehigkeiten` heute) oder „unbekannt"? Vorschlag: **unbekannt** (nicht ausschließen, aber schlechter ranken) — sonst matcht eine ungepflegte Werkstatt auf LKW.
