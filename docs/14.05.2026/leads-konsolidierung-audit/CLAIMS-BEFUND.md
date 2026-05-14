# CLAIMS-BEFUND — Horizontaler Audit `claims`-Tabelle

**Datum:** 2026-05-14
**Methode:** Schema-Dump + Coverage über 11 Live-Claims + FK-Beziehungs-Check
**Kontext:** claims ist CMM-SSoT (siehe Memory `project_cmm_strecke_status`).

## Schema-Stand

- **Tabelle**: `public.claims`
- **Spalten**: 133
- **Live-Rows**: 11 (test-claims)
- **Related**: `claim_parties` (54 Spalten, separate Tabelle für Parteien im Claim)

## Coverage-Snapshot über 11 Claims

**Genutzt:**
- `schadenart` (NOT NULL): 11/11
- `schadenort_land` (NOT NULL default 'DE'): 11/11
- `finanzierung_leasing` (NOT NULL default 'keine'): 11/11
- `geschaedigter_user_id`: 9/11
- `totalschaden`: 2/11
- `kunde_email`: 2/11

**Nicht gepflegt (Coverage 0/11) — alle anderen 127 Spalten.**

Das ist nicht zwangsläufig „tot" wie bei leads: claims wird über Lifecycle gefüllt (Phase = Onboarding → SV-Termin → Gutachten → Kanzlei → VS → Abschluss). Coverage 0 heißt: die 11 Test-Claims sind alle in frühen Phasen.

## Cluster-Identifikation

### Cluster A — Schadensort (7 Felder, Geo-redundant?)
- `schadenort_adresse, _plz, _ort, _land, _lat, _lng, _kategorie`
- **Alle FREI bis auf `_land`** (default 'DE').
- Analyse: Standard-Address-Cluster. PLZ + Ort + Adresse redundant zu lat/lng wenn Geocoding-Service?
- Aber: Address-String braucht man für Anzeige/PDF — Geo nur für SV-Dispatch. Beides legit.

### Cluster B — Schadens-Klassifikation (5 Felder, Doppelung?)
- `schadenart` (NOT NULL — 11/11): Haupt-Klassifikation
- `fall_typ` (0/11): SF-Codes (sf-01, sf-02 etc.)
- `ursache` (0/11): Freitext
- `unfall_konstellation` (0/11): UK-Codes
- `bkat_unfallart` (0/11): Bußgeld-Kategorie

→ **3+ überlappende Klassifikationen.** Welche ist SSoT? `schadenart` ist NOT NULL also kanonisch. Andere 4 könnten alt/spezifisch sein.

### Cluster C — Parties-Doppelung (FK-Inkonsistenz)
- `geschaedigter_user_id` (uuid → auth.users) — 9/11
- `geschaedigter_party_id` (uuid → claim_parties) — 0/11
- `verursacher_user_id` (uuid → auth.users) — 0/11
- `verursacher_party_id` (uuid → claim_parties) — 0/11

→ **Zwei FK-Pfade zum selben Konzept "wer ist beteiligt".**
- Der `claim_parties`-Pfad ist die "richtige" Lösung (Party kann auch Nicht-User sein, z.B. Gegner ohne Account)
- Der `_user_id`-Pfad ist Cache/Convenience für eingeloggte User

Frage: SSoT klären. Wenn `claim_parties.user_id`-Spalte existiert, ist `claims._user_id` redundant.

### Cluster D — Gegner-Versicherung (FK + Text-Duplikat)
- `gegner_versicherung_id` (uuid FK → versicherungen-Tabelle?) — 0/11
- `gegner_versicherungsnummer` (text) — 0/11
- `gegner_aktenzeichen` (text) — 0/11

→ FK + Text-Name nebeneinander. Wenn FK existiert, Versicherungsnummer im FK-Target lookupbar — Spalte hier ist Cache.

### Cluster E — Eigene Versicherung (kein FK, nur Text)
- `eigene_versicherung` (text) — 0/11
- `eigene_policennr` (text) — 0/11

→ Asymmetrie zu Gegner: Gegner hat FK, eigene nur Text. Inkonsistent.

### Cluster F — Gutachten-OCR (30 Felder!) — Sub-Table-Kandidat
30 Spalten beginnen mit `gutachten_`:
- Metadaten: datum, ocr_processed_at, ocr_raw (jsonb), ocr_error, ocr_manuell_ueberschrieben, seitenzahl
- Fahrzeug: fin, kennzeichen, erstzulassung, laufleistung_km, tuv_bis, fahrzeug_typ, farbe, farbcode, kraftstoff, vorschaeden_text
- Zustand: lackmesswert_max_my, karosseriezustand
- Arbeitszeiten (3): zeit_ak/kar/lack_std
- Lohnsätze (3): lohnsatz_ak/kar/lack_eur
- Materialkosten (3): materialkosten_eur, lackmaterial_eur, verbringung_eur
- Mietwagen (2): mietwagen_klasse, mietwagen_tagessatz_eur
- nutzungsausfall_tagessatz_eur
- SV-Honorar (2): sv_honorar_netto, brutto
- kalkulationssystem

**Coverage: alle 30 = 0/11.**

Analyse: Das ist eindeutig ein **Domain-Sub-Object „Gutachten"**. Eigene Tabelle `gutachten` würde:
- 30 Felder von claims weg → schlanker
- 1:1-Beziehung claim→gutachten (oder 1:N falls mehrere Gutachten/Revisionen)
- Klarer Lifecycle (Gutachten erst nach Phase „besichtigung-abgeschlossen")

### Cluster G — Reparaturkosten + Wertgutachten (8 Felder) — Sub-Table-Kandidat
- `reparaturkosten_netto/brutto`, `minderwert`, `restwert`
- `wiederbeschaffungswert`, `wiederbeschaffungsdauer_tage`
- `nutzungsausfall_tage`
- `totalschaden`

Coverage: 1-2/11 (totalschaden=2).

Analyse: Berechnungs-Output aus Gutachten. Könnte auch in `gutachten`-Sub-Table oder eigene `claim_calculations`-Tabelle.

### Cluster H — Finanzierung (8 Felder) — Vehicle-Eigenschaft?
- `finanzierung_leasing` (NOT NULL default 'keine')
- `leasinggeber_name`, `finanzierungsgeber_name/adresse/vertragsnr`
- `finanzierung_bank`, `brn`

Analyse: Finanzierungs-Daten gehören eigentlich zum Fahrzeug (`vehicles.finanzierung_*`), nicht zum Claim. Wenn dasselbe Auto in 2 Claims involved → redundant.

→ **Migration zu vehicles** wäre logisch — passt zu AAR-810-Plan.

### Cluster I — Kanzlei-Übergabe (5 Felder)
- `kanzlei_uebergeben_am`, `_ansprechpartner_name/email/telefon`
- `kanzlei_wunsch` (NOT NULL), `kanzlei_wunsch_gefragt_am`, `kanzlei_wunsch_gefragt_in_phase`

Coverage: 0/11 (Test-Claims sind vor Kanzlei-Phase).

Analyse: Sinnvoll gruppiert, könnte auch in `claim_kanzlei`-Tabelle (1:1). Aber 5 Felder ist überschaubar — Inline auf claims OK.

### Cluster J — No-Show-Tracking (4 Felder)
- `kunde_no_show_count` (NOT NULL) + `letzter_no_show_am`
- `sv_no_show_count` (NOT NULL) + `letzter_sv_no_show_am`

Sinnvoll inline (Kanban-Filter „häufig no-show"). Keine Konsolidierung nötig.

### Cluster K — Unfallskizze (5 Felder)
- `unfallskizze_url`, `_svg`, `_bestaetigt`, `_ablehnung_grund`, `_generiert_am`

Coverage 0/11. Inline auf claims OK, aber eigenständige Sub-Domain.

### Cluster L — Firma (2 Felder, exakt wie leads + faelle)
- `firma_name`, `firma_ustid`

**Coverage 0/11.** Exakte Duplikate der gerade gedroppten leads-Spalten + identisch zu faelle.

→ Frage: Wenn `gewerbe_flag=true`, wo lebt die Firma kanonisch? `claims.firma_*`? `vehicles.firma_*` (vehicle gehört zur Firma)? `profiles.firma_*`?

## Coverage-leere Felder (0/11 — bedeutet was?)

Anders als leads-BEFUND wo 0-Coverage = tot war, ist hier 0-Coverage = "Lifecycle-Phase noch nicht erreicht". Drops auf basis Coverage allein sind unsicher.

Vertikaler Audit nötig (write-pfade + Schemas) um zu unterscheiden:
- A. **Reine Lifecycle-Lücke** (Feld wird in späterer Phase gefüllt) → BEHALTEN
- B. **Konzeptueller Duplikat** (anderswo schon vorhanden) → DROP
- C. **Sub-Table-Kandidat** (Gutachten, Reparaturkosten) → MIGRATE
- D. **Inkonsistenz** (FK + Text-Cache nebeneinander) → KONSOLIDIEREN

## Quantifizierung (vorläufig, vor Vertikal-Audit)

Mögliche Bewegungen:
- **30 Gutachten-Felder** → eigene `gutachten`-Tabelle (Sub-Table)
- **8 Reparatur/Wert-Felder** → `gutachten` oder `claim_calculations`
- **8 Finanzierungs-Felder** → `vehicles` (passt zu AAR-810)
- **2 Firma-Felder** → entweder `vehicles.firma_*` oder `profiles.firma_*` (SSoT entscheiden)
- **Parties-Doppelung** → `_user_id`-Spalten droppen wenn party_id reicht (4 Spalten)
- **Schadens-Klassifikation** → 2-3 von 5 droppen wenn ungenutzt
- **Gegner-VS-Cache** → 1-2 Spalten konsolidieren

**Schätzung:** Bei sauberer Strukturierung könnte claims von 133 auf ~80 Spalten schrumpfen, plus 1-2 Sub-Tables erzeugen.

## Limitierungen

- 11 Live-Claims = sehr wenig (alle in frühen Phasen). Coverage-Aussagen unzuverlässig.
- Schema-Comments + Migration-History sollten gelesen werden, um AAR-810-/CMM-Plan zu verstehen.
- Vertikaler Audit klärt:
  - Welche Write-Pfade befüllen `gutachten_*`?
  - Existiert ein `gutachten`-Plan in der Codebase (TS-Types, Sub-Components)?
  - Welche Read-Pfade nutzen `claims.firma_*` vs `vehicles.firma_*`?
  - Wie funktioniert die Beziehung `claims ↔ claim_parties` heute? user_id-Cache nötig?

→ **Vertikaler Audit nächster Schritt.**
