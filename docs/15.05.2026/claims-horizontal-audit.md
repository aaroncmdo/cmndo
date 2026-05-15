# Horizontaler claims-DB-Audit — 15.05.2026

> **Komplementär:** das **vertikale Audit** (`docs/14.05.2026/leads-konsolidierung-audit/CLAIMS-VERTIKAL-AUDIT.md` von der `kitta/aar-cluster-fg-gutachten`-Session) bleibt die maßgebliche Quelle für Cluster-Daten-Flüsse. Dieses Doc fokussiert horizontal — Spalten-Sanity, Indexes, Constraints, Trigger, RLS-Policies. Befund A1 (Gutachten-OCR) ist in der F+G-Spec deutlich tiefer ausgearbeitet (38 statt 30 Spalten, plus Werte-Cluster G) — siehe `docs/superpowers/specs/2026-05-14-cluster-fg-gutachten-subtable-design.md`.

**Datenstand:** 16 Rows (14× `dispatch_done`/`2_in_bearbeitung`, 2× `in_bearbeitung`/`0_lead`).
**Tabellenbreite:** 119 Spalten · 8 FKs out · 17 FKs in · 11 CHECK · 1 UNIQUE · 14 Indexes · 5 Trigger · 2 RLS-Policies.

## Zusammenfassung

claims ist die zentrale Schaden-Tabelle, sehr breit aus dem CMM-Migrations-Erbe — viele Felder die in Sub-Tabellen gehören (Gutachten-OCR-Cluster, Kanzlei-Ansprechpartner, Finanzierung) sind direkt auf claims gelandet. Bidirektionaler Sync zu `faelle` ist live (40 Spalten faelle→claims, 38 claims→faelle, mit 2-Spalten-Asymmetrie). Triggers/Policies/Helper-Grants sind sauber. Hauptbedarf: **Schema-Konsolidierung** (3 Cluster) + **Index-Lücken** für späte Phasen.

## A · Befunde mit Handlungsempfehlung

### A1 — HIGH · Gutachten-OCR-Cluster gehört in `gutachten` (Sub-Tabelle existiert bereits)

**Befund:** ~30 Spalten `gutachten_*` direkt auf claims (datum, ocr_processed_at, ocr_raw jsonb, fin, kennzeichen, erstzulassung, laufleistung, tuv_bis, fahrzeug_typ, farbe, farbcode, kraftstoff, vorschaeden_text, lackmesswert_max_my, karosseriezustand, zeit_ak/kar/lack_std, lohnsatz_*, materialkosten, lackmaterial, verbringung, mietwagen_klasse, mietwagen_tagessatz, nutzungsausfall_tagessatz, sv_honorar_netto/brutto, kalkulationssystem, seitenzahl, ocr_manuell_ueberschrieben).

FK `gutachten.claim_id → claims.id` existiert bereits — d.h. Sub-Tabelle ist live, aber claims hält parallel die OCR-Felder. Datenmodell-Drift.

Fill-Rate: `gutachten_fin` 1/16 — fast leer. Bestätigt: gehört in Sub-Tabelle, 1:0..1 Beziehung.

**Empfehlung:** OCR-Cluster nach `gutachten` migrieren, claims-Spalten droppen. Eigene Migration + Code-Sweep der Reader. Größenordnung: 30 Spalten × ~15 Reader = mittlerer Refactor.

### A2 — HIGH · Finanzierung/Leasing-Modell ist redundant

**Befund:** 6 Spalten für ein Konzept:
- `finanzierung_leasing` text-enum (`keine|leasing|finanzierung`)
- `leasinggeber_name` text
- `finanzierungsgeber_name` text
- `finanzierungsgeber_adresse` text
- `finanzierungsgeber_vertragsnr` text
- `finanzierung_bank` text

Bei `finanzierung_leasing='leasing'` welche Spalten gelten? `leasinggeber_name` ODER `finanzierungsgeber_name`? Bei `finanzierung_bank` was ist das vs `finanzierungsgeber_name`?

**Empfehlung:** EIN Spalten-Set für Geber-Daten, `finanzierung_leasing`-Enum bestimmt die Semantik. `leasinggeber_name` + `finanzierung_bank` als Legacy-Felder droppen oder klar dokumentieren wenn sie semantisch unterschiedlich sind (z.B. Bank = Hausbank für Sondereffekte vs Geber = Vertragspartner).

### A3 — MEDIUM · Sync-Asymmetrie faelle/claims

**Befund:** `trg_sync_faelle_to_claims` syncronisiert 40 Spalten **von faelle nach claims**, darunter zwei die in claims **nicht existieren** würden:
- `bkat_unfallart` (in faelle ja, in claims nein — sonst Trigger würde nichts tun)
- `firma_name` (in faelle ja, in claims nein)

`trg_sync_claims_to_faelle` watcht entsprechend **38** Spalten ohne diese zwei.

**Empfehlung:** Verifizieren ob `bkat_unfallart` + `firma_name` in claims nachgezogen werden sollen (CMM-Phase-2-Hygiene-Backlog laut Memory `cmm_phase_15_done`) oder ob es Legacy-Spalten in faelle sind die droppable sind.

### A4 — MEDIUM · Kanzlei-Ansprechpartner direkt auf claims

**Befund:** `kanzlei_ansprechpartner_name/email/telefon` direkt auf claims. Es gibt aber FK `kanzlei_pakete.claim_id → claims.id` und `kanzlei_faelle.claim_id → claims.id` — Sub-Tabellen für Kanzlei-Beziehung existieren.

**Empfehlung:** Wenn ein Claim immer max. 1 Kanzlei hat (1:0..1) → Status quo akzeptabel, aber dann sollte `kanzlei_pakete`/`kanzlei_faelle` keinen separaten Kontakt-State führen. Sonst (1:n) → Spalten droppen, alles via `kanzlei_pakete`. Cross-Tabellen-Audit erforderlich.

### A5 — MEDIUM · `created_by_user_id` ohne with_check-Schutz

**Befund:** RLS-Policy `claims_staff_all_consolidated` ist `FOR ALL` mit `qual = is_admin() OR (is_kundenbetreuer() AND (kundenbetreuer_id = auth.uid() OR kundenbetreuer_id IS NULL))`. Kein separates `WITH CHECK` für INSERT — heißt Kundenbetreuer kann INSERT mit beliebiger `created_by_user_id` (z.B. fremde Admin-UUID) machen.

Code schreibt vermutlich via `createAdminClient()` (service_role bypassed), aber RLS-Layer ist nicht dicht.

**Empfehlung:** Trigger analog `guard_*_privilegien` der bei INSERT/UPDATE prüft: wenn nicht privileged → `NEW.created_by_user_id = auth.uid()`. Niedrige Prio weil aktueller Caller-Pfad service_role ist.

### A6 — MEDIUM · `zeugen_kontakte` als jsonb ohne Schema

**Befund:** `zeugen_kontakte jsonb`. Kein CHECK-Constraint, kein JSON-Schema-Guard. Daten-Drift-Risiko (Felder werden im Code-Lese-Pfad geraten).

`claim_parties` existiert bereits als Sub-Tabelle für Beteiligten — Zeugen sind eine Variante.

**Empfehlung:** Migration zu `claim_parties` mit `party_typ='zeuge'` ODER mindestens JSON-Schema-Validation per CHECK-Constraint. Aktuell fill-rate vermutlich 0/16, daher unkritisch.

### A7 — LOW · Fehlende Indexes für späte Phasen

**Befund:** vorhandene Indexes decken `lead_konvertierung`-Pfad gut ab. Späte Phasen schlechter:
- `verjaehrt_am` — Cron-Verjährungs-Check muss Full-Table-Scan machen
- `gutachten_fin` — OCR-Duplikat-Check sucht hier (wenn aktiv genutzt)
- `kanzlei_uebergeben_am` — Kanzlei-Übergabe-Reports

**Empfehlung:** Partial-Indexes wo möglich (`WHERE verjaehrt_am IS NOT NULL` etc.). Wert ergibt sich mit Production-Volumen — aktuell 16 Rows daher Index-Add deferral OK.

### A8 — LOW · `schadenort_lat/lng numeric` statt PostGIS

**Befund:** Geo-Spalten als `numeric`. Wenn jemals Radius-Queries kommen (z.B. Cluster-Karte) → langsam.

**Empfehlung:** Spätere Migration zu `geography(Point, 4326)` mit GIST-Index, wenn ein Bedarf entsteht. Keine sofortige Aktion.

### A9 — LOW · Doppelte State-Dimensionen (status + phase)

**Befund:** 7 Status-Werte + 11 Phase-Werte. Trigger `trg_claims_set_phase` syncronisiert status→phase. Logik korrekt, aber zwei State-Felder erhöhen Komplexität für jeden Reader.

**Empfehlung:** Akzeptiert (Memory `state_machine_pattern` dokumentiert). Folge-Audit ob Reader/UI immer beide Felder konsistent prüfen — wenn nicht, eines droppen.

### A10 — LOW · `vorschaden_mit_vs_abgerechnet` text statt boolean

**Befund:** Enum-Werte `ja|nein|teilweise|unbekannt`. Wäre sauber als `boolean NULL` (null = unbekannt) + `teilweise_anteil numeric` falls letzteres relevant ist.

**Empfehlung:** Niedrige Prio, aktueller Stand funktioniert. Falls Migration: separater PR.

## B · Was sauber ist

- **CHECK-Constraints** sind umfassend (10 Stück) auf allen enum-artigen Spalten — Datenintegrität gegeben
- **CHECK chk_claims_abgeschlossen_nach_schadentag** + **chk_claims_verjaehrt_nach_schadentag** — Datum-Logik gehärtet
- **`claim_nummer`** UNIQUE + Trigger `set_claim_nummer` BEFORE INSERT → kollisionsfrei
- **`updated_at`** via Trigger → konsistent
- **`verjaehrt_am`** automatisch berechnet via `set_claims_verjaehrung` bei INSERT/UPDATE OF schadentag/schadenart
- **`set_phase`** Trigger leitet phase aus status ab → 1 Source-of-Truth
- **RLS-Helper-Functions** alle granted (`is_dispatcher`, `dispatcher_owns_lead`, `is_claim_user_party`, `is_sv_for_claim`) — Memory `feedback_rls_function_grants` Falle hier nicht aktiv
- **Bidirektionaler Sync** zu `faelle` (CMM-Phase-1.5) live
- **17 FK-Tabellen** referenzieren claims — gute Domain-Modellierung (gutachten/auftraege/repairs/parties/payments/mietwagen/vehicle_involvements/korrespondenz/dokumente/kanzlei_pakete/sv_organisation_laeufer_reports/...)

## C · Empfehlungs-Roadmap

| Prio | Item | Aufwand | Followup-Ticket |
|---|---|---|---|
| HIGH | A1 Gutachten-OCR → `gutachten`-Sub-Tabelle | 1-2 Tage | Folge AAR |
| HIGH | A2 Finanzierungs-Cluster konsolidieren | 0.5 Tag | Folge AAR |
| MEDIUM | A3 Sync-Asymmetrie klären | 0.5 Tag | passt zu CMM-Phase-2 |
| MEDIUM | A4 Kanzlei-Ansprechpartner Audit | 0.5 Tag | Folge AAR |
| MEDIUM | A5 `created_by_user_id` Trigger-Guard | 0.25 Tag | passt zu AAR-913-Followup |
| MEDIUM | A6 `zeugen_kontakte` jsonb-Schema | 0.25 Tag | Folge AAR |
| LOW | A7 Index-Backlog (verjährung, OCR-FIN, kanzlei) | 0.25 Tag | deferral mit Volumen |
| LOW | A8 PostGIS-Migration | 0.5 Tag | deferral, wenn Geo-Queries kommen |
| LOW | A9 status/phase Reader-Consistency-Audit | 0.5 Tag | Folge AAR |
| LOW | A10 `vorschaden_mit_vs_abgerechnet` boolean | 0.1 Tag | nice-to-have |

**Naheliegende erste Welle:** A1 + A2 (Schema-Hygiene, klare Domain-Modellierung, Code wird kürzer).

## D · Vollständige Spalten-Klassifikation

### Identität (4)
`id`, `claim_nummer`, `vehicle_id`, `lead_id`

### Schadensdaten (12)
`schadentag`, `schadenzeit`, `entdeckt_am`, `schadenort_adresse`, `schadenort_plz`, `schadenort_ort`, `schadenort_land`, `schadenort_lat`, `schadenort_lng`, `schadenort_kategorie`, `schadenart`, `fall_typ`, `unfall_konstellation`, `fahrerflucht`, `auslandskennzeichen`

### Hergang (2)
`hergang_kunde_text`, `hergang_sv_text`

### Polizei (4)
`polizei_aktenzeichen`, `polizei_bericht_vorhanden`, `polizei_vor_ort`, `polizeibericht_status`

### Geschädigter/Gegner (6)
`geschaedigter_user_id`, `gegnerisches_vehicle_id`, `gegner_versicherung_id`, `gegner_versicherungsnummer`, `gegner_aktenzeichen`, `gegner_bekannt`

### Beteiligten-Profil (7)
`anzahl_beteiligte_total`, `hat_personenschaden`, `hat_mietwagen`, `hat_nutzungsausfall`, `hat_sachschaden`, `hat_abschleppung`, `sachschaden_beschreibung`

### Halter/Konstellation (2)
`halter_ungleich_fahrer`, `kunden_konstellation`

### Unfallskizze (5)
`unfallskizze_url`, `unfallskizze_svg`, `unfallskizze_bestaetigt`, `unfallskizze_ablehnung_grund`, `unfallskizze_generiert_am`

### State (8)
`status`, `phase`, `abgeschlossen_am`, `verjaehrt_am`, `endzustand_gesetzt_durch_user_id`, `endzustand_gesetzt_am`, `endzustand_grund`, `vs_ablehnungs_grund`

### Audit (4)
`created_at`, `updated_at`, `created_by_user_id`, `created_via`

### Personen (1)
`kundenbetreuer_id`

### Kanzlei (7)
`kanzlei_wunsch`, `kanzlei_wunsch_gefragt_am`, `kanzlei_wunsch_gefragt_in_phase`, `kanzlei_uebergeben_am`, `kanzlei_ansprechpartner_name`, `kanzlei_ansprechpartner_email`, `kanzlei_ansprechpartner_telefon`

### No-Show-Tracking (4)
`kunde_no_show_count`, `letzter_no_show_am`, `sv_no_show_count`, `letzter_sv_no_show_am`

### Schadenwerte (8)
`reparaturkosten_netto`, `reparaturkosten_brutto`, `minderwert`, `restwert`, `wiederbeschaffungswert`, `wiederbeschaffungsdauer_tage`, `nutzungsausfall_tage`, `totalschaden`, `regulierungs_betrag`

### Gutachten-OCR (30) ← **A1 Refactor-Kandidat**
`gutachten_datum`, `gutachten_ocr_processed_at`, `gutachten_ocr_raw`, `gutachten_ocr_error`, `gutachten_fin`, `gutachten_kennzeichen`, `gutachten_erstzulassung`, `gutachten_laufleistung_km`, `gutachten_tuv_bis`, `gutachten_fahrzeug_typ`, `gutachten_farbe`, `gutachten_farbcode`, `gutachten_kraftstoff`, `gutachten_vorschaeden_text`, `gutachten_lackmesswert_max_my`, `gutachten_karosseriezustand`, `gutachten_zeit_ak_std`, `gutachten_zeit_kar_std`, `gutachten_zeit_lack_std`, `gutachten_lohnsatz_ak_eur`, `gutachten_lohnsatz_kar_eur`, `gutachten_lohnsatz_lack_eur`, `gutachten_materialkosten_eur`, `gutachten_lackmaterial_eur`, `gutachten_verbringung_eur`, `gutachten_mietwagen_klasse`, `gutachten_mietwagen_tagessatz_eur`, `gutachten_nutzungsausfall_tagessatz_eur`, `gutachten_sv_honorar_netto`, `gutachten_sv_honorar_brutto`, `gutachten_kalkulationssystem`, `gutachten_seitenzahl`, `gutachten_ocr_manuell_ueberschrieben`

### Kunde-Snapshot (1)
`kunde_email`

### Finanzierung/Leasing (6) ← **A2 Konsolidierungs-Kandidat**
`gewerbe_flag`, `vorsteuerabzugsberechtigt`, `finanzierung_leasing`, `leasinggeber_name`, `finanzierungsgeber_name`, `finanzierungsgeber_adresse`, `finanzierungsgeber_vertragsnr`, `finanzierung_bank`

### Sonstiges (5)
`brn`, `zeugen_kontakte`, `spezifikation`, `vorschaden_mit_vs_abgerechnet`

## Verwandte Memorys

`project_cmm_strecke_status`, `project_cmm_phase_15_done`, `project_state_machine`, `feedback_rls_function_grants`.
