# CLAIMS-VERTIKAL-AUDIT — Daten-Fluss pro Cluster

**Datum:** 2026-05-14
**Methode:** Sub-Table-Existenz prüfen, Writer/Reader pro Cluster, Row-Counts.
**Vorlage:** CLAIMS-BEFUND.md

## Sub-Tabellen-Realität

| Tabelle | Spalten | Rows | Status |
|---|---:|---:|---|
| `claims` | 133 | 11 | Haupt-SSoT (CMM) |
| **`claim_parties`** | **54** | **9** | **AKTIV** — 9/11 Claims haben Parties |
| `gutachten` | 33 | **0** | Schema existiert, **0 Writes** — Migration nie fertig |
| `gutachten_positionen` | 13 | 0 | Sub-Sub-Table, ungenutzt |
| `gutachten_fotos` | ? | 0 | Sub-Sub-Table, ungenutzt |

## Cluster-Verdikte

### Cluster F — Gutachten-OCR (30 claims-Spalten)

**Sub-Table-Test:** Es gibt eine `gutachten`-Tabelle mit 33 Lifecycle-Spalten (claim_id, sv_id, status, ocr_pipeline-Metadata).

**Aber:** `gutachten` ist 0 Rows. Die 30 Daten-Felder (lohnsatz, materialkosten etc.) leben aktuell auf `claims.gutachten_*`.

**Schema-Drift:** `gutachten` hat Lifecycle-Wrapper aber KEINE Daten-Felder. `claims.gutachten_*` hat Daten-Felder aber kein Lifecycle. Beides nebeneinander = halb-fertige Sub-Table-Migration.

**Writer:** `src/app/faelle/[id]/_actions/gutachten-ocr.ts` schreibt direkt auf claims.gutachten_*. **2 Writer auf gutachten-Tabelle** (`lib/gutachten/ocr-actions.ts`, `lib/kanzlei/actions.ts`) — keine Daten, nur Lifecycle.

**Empfehlung:** Sub-Table-Migration fertigstellen:
1. Daten-Felder von claims → gutachten (oder gutachten_positionen)
2. claims.gutachten_* droppen
3. OCR-Pipeline auf gutachten-Tabelle umstellen

**Risiko:** 30 Spalten + UI-Reader (Stammdaten-Tab, Fallakte). ~3 Tage Refactor.

### Cluster C — Parties Doppel-FK

**Realität:**
- `claim_parties` Tabelle existiert + ist aktiv (9/11 Claims)
- Pattern: 1:N (Claim hat mehrere Parties — Geschädigter, Verursacher, Zeugen, etc.)
- Rolle via `claim_parties.rolle`-Spalte unterschieden
- Person-Daten (Vorname, Adresse, Telefon, Email, Versicherung) leben dort

**`claims.geschaedigter_user_id` (9/11):**
- AKTIV. Writer in `flow/[token]/actions.ts:402` mit Kommentar: „CMM-19: claims.geschaedigter_user_id auch nachziehen — beim Initial-Insert ist claims.geschaedigter_user_id null und die RLS-Policy lässt den Kunden nicht ran"
- **Use-Case: RLS-Policy braucht direkten Cache.** JOIN über claim_parties wäre langsamer + RLS-rekursiv.
- → **BEHALTEN als bewusster RLS-Cache.**

**`claims.geschaedigter_party_id` (0/11):**
- KEIN Writer im Code-gefunden
- Theoretisches FK auf claim_parties — nie implementiert
- → **DROP-Kandidat.**

**`claims.verursacher_user_id` (0/11):**
- KEIN Writer
- Symmetrisch zu geschaedigter, aber nicht gepflegt
- Use-Case (RLS für Verursacher) unklar
- → Drop-Kandidat, aber **prüfen ob RLS-Policy darauf zugreift.**

**`claims.verursacher_party_id` (0/11):**
- Wie geschaedigter_party_id → Drop.

→ **Quick-Win**: 3 Drops (geschaedigter_party_id, verursacher_user_id, verursacher_party_id). 1 behalten (geschaedigter_user_id RLS-Cache).

### Cluster L — Firma (2 Felder)

**`claims.firma_name` + `claims.firma_ustid`:**
- KEINE Writer im Code (analog zu leads vor Stufe 0)
- Coverage 0/11
- Schreib-Mapping in `lead-fall-mapping.ts` existiert, aber leads-Source ist null seit Stufe 0
- Read: `dispatch-fall-actions.ts` schreibt sie nach faelle (aber mit Source = null)

**Wo lebt Firma kanonisch?** → `claim_parties.firma` + `claim_parties.ist_gewerbe` + `claim_parties.ust_id`. **DAS** ist SSoT.

→ **DROP-Kandidat.** Beide Felder weg, Firma-Pfad geht über claim_parties.

### Cluster D — Gegner-Versicherung

- `gegner_versicherung_id` (FK, 0/11) — Writer in Phase4Stammdaten, create-for-fall
- `gegner_versicherungsnummer` (text, 0/11) — Writer in create-test-fall, create-for-fall
- `gegner_aktenzeichen` (0/11) — VS-Schadensnummer

**Analyse:** FK + Versicherungsnummer-Text + Aktenzeichen sind **drei verschiedene Datenpunkte**:
- FK = "welche Versicherung" (lookup `versicherungen`-Tabelle)
- Nummer = "Policennummer des Gegners" (gegnerische Versicherten-Nr)
- Aktenzeichen = "Schadensnummer dieser Schadensmeldung"

Nicht redundant. **Behalten.**

**ABER:** `claim_parties.versicherung_id` + `claim_parties.versicherungsnummer` + `claim_parties.versicherungs_aktenzeichen` existieren AUCH! Für Verursacher-Party.

→ **Doppelt-modelliert:** Gegner-VS lebt sowohl auf `claims.gegner_*` als auch auf `claim_parties` mit rolle='verursacher'.

Konsolidierung: Wenn Verursacher als claim_party existiert, sind die 3 claims.gegner_*-Felder redundant. Reading via JOIN. **Komplex** weil Verursacher oft kein User-Account → claim_parties.user_id = null aber andere Felder da.

### Cluster E — Eigene-VS (asymmetric)

- `eigene_versicherung` (text, 0/11)
- `eigene_policennr` (text, 0/11)

Asymmetrie: Gegner hat FK, eigene nur Text.

**Realität:** Eigene VS lebt im `claim_parties` mit `rolle='geschaedigter'` und Feldern `versicherung_id`, `versicherungsnummer`. → Auf claims direkt redundant.

→ **DROP-Kandidat.** 2 Felder weg, eigene VS via claim_parties.

### Cluster B — Schadens-Klassifikation (5 Felder)

- `schadenart` (NOT NULL, 11/11) — kanonisch
- `fall_typ` (0/11) — sf-codes
- `ursache` (0/11) — freitext
- `unfall_konstellation` (0/11) — uk-codes
- `bkat_unfallart` (0/11) — Bußgeld-Kategorie

**Writer-Analyse:**
- `fall_typ`: Writer in get-kunde-faelle (Read!) + smoke-seed only. Kein UI-Write-Pfad.
- `ursache`: Writer = `lib/leads/convert-lead-to-claim.ts:145` setzt jetzt explizit `null` (Stufe 0)
- `unfall_konstellation`: nicht geprüft
- `bkat_unfallart`: nicht geprüft

→ Mindestens `fall_typ` ist Drop-Kandidat. `ursache` ist 100% drop-fähig (kein Writer). Andere 2 brauchen Vertical-Check.

### Cluster H — Finanzierung (8 Felder)

- `finanzierung_leasing` (NOT NULL, 11/11 default 'keine')
- `leasinggeber_name`, `finanzierungsgeber_name/adresse/vertragsnr`
- `finanzierung_bank`, `brn`

**Writer:** `dispatch-fall-actions.ts` Mapping (von lead). Coverage 0 auf Leads-Source → claims-Side ist auch leer.

**Analyse:** Finanzierungs-Daten sind **fahrzeug-bezogen**, nicht claim-bezogen. Gehört auf `vehicles`-Tabelle (AAR-810-Plan).

→ **MIGRATE zu vehicles** — passt zu der Hauptlinie der DB-Konsolidierung.

### Cluster G — Reparaturkosten + Wert (8 Felder)

- `reparaturkosten_netto/brutto`, `minderwert`, `restwert`
- `wiederbeschaffungswert`, `wiederbeschaffungsdauer_tage`
- `nutzungsausfall_tage`, `totalschaden`

Coverage: nur `totalschaden` 2/11.

**Analyse:** Output aus Gutachten-Bewertung. Wenn Cluster F (Gutachten-Daten → gutachten-Tabelle) durchgezogen wird, sollten diese 8 Werte auch dorthin.

→ **MIGRATE zu gutachten** zusammen mit Cluster F.

### Cluster A — Schadensort (7 Felder)

`schadenort_adresse/_plz/_ort/_land/_lat/_lng/_kategorie`. Nur _land (NOT NULL default 'DE') gefüllt.

→ **BEHALTEN**. Pure Lifecycle-Lücke (Test-Claims haben keinen erfassten Schadensort).

### Cluster K — Unfallskizze (5 Felder)

Standard inline-Sub-Domain. → **BEHALTEN**.

### Cluster I — Kanzlei-Übergabe (5 Felder), Cluster J — No-Show (4 Felder)

→ **BEHALTEN** (klein, sinnvoll inline).

## Konsolidierte Empfehlung — Stufe 0+1

### Stufe 0 (sicher, Drop ohne Funktionsverlust):

| Spalte | Begründung |
|---|---|
| `claims.geschaedigter_party_id` | Kein Writer, FK-Pfad nie implementiert |
| `claims.verursacher_party_id` | Symmetrisch |
| `claims.verursacher_user_id` | Kein Writer, RLS-Use-Case unklar |
| `claims.firma_name` | Kein Writer, lebt in claim_parties.firma |
| `claims.firma_ustid` | Kein Writer, lebt in claim_parties.ust_id |
| `claims.eigene_versicherung` | Lebt in claim_parties (geschaedigter-Party) |
| `claims.eigene_policennr` | Lebt in claim_parties.versicherungsnummer |
| `claims.ursache` | Kein Writer (nach Stufe 0 leads) |

**8 Spalten droppable** ohne Code-Migration-Aufwand.

### Stufe 1 (mittelfristig, mit Refactor):

- `claims.fall_typ`, `unfall_konstellation`, `bkat_unfallart` — Vertikal-Check, dann drop
- Finanzierung-Cluster (8 Felder) → vehicles-Migration (AAR-810)

### Stufe 2 (groß, eigene Sub-Tables):

- 30 `claims.gutachten_*` → `gutachten` Sub-Table (Migration finalisieren)
- 8 Reparaturkosten/Wert-Felder → `gutachten` zusammen

## Sub-Table-Fertigstellungs-Plan (separates Ticket)

`gutachten`-Tabelle existiert seit längerem aber wurde nie zum Live-Pfad. Reason für Fertigstellung:
1. Klarer Lifecycle ohne 30 Spalten auf claims
2. 1:N Revisionen möglich (Erstgutachten + Nachbesichtigung etc.)
3. RLS-Policies pro gutachten-Row, nicht nur claim

## Risiko-Hinweis

`claims.geschaedigter_user_id` (Cluster C) NICHT droppen — Live-RLS-Cache. Würde kunde-RLS brechen.
