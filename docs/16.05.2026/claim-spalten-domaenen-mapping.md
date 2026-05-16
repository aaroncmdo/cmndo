# Claim-SSoT — 341-Spalten-Domänen-Mapping (`faelle`)

**Datum:** 2026-05-16
**Zweck:** Jede `faelle`-Spalte einer Ziel-Heimat zuordnen. Teil-Audit 1 von `claim-ssot-vollmigration-audit-strategie.md` (§3.1a / Phase 1).
**Datenstand:** Live-Coverage via Management-API gegen **30 `faelle`-Rows** (`jsonb_each`-Unpivot).

---

## 1 · Coverage-Befund + Daten-Caveat

| | Anzahl |
|---|---:|
| `faelle`-Spalten gesamt | 341 |
| **0-Coverage** (nie gefüllt auf 30 Rows) | **265** |
| **>0-Coverage** (tragen Daten) | **76** |

**KRITISCHER CAVEAT — Coverage allein klassifiziert NICHT.** Unter den 265 0-Coverage-Spalten stehen Kern-Felder wie `kennzeichen`, `fahrzeug_hersteller`, `fahrzeug_modell`, `schadens_art`, `unfalldatum`, `unfallhergang`, `kanzlei_uebergeben_am`, `abgeschlossen_am`, `regulierung_betrag` — die offensichtlich **nicht tot** sind. Heißt: die 30 `faelle`-Rows sind **kein repräsentativer Live-Datensatz** (früh-Lifecycle / Test-Rows, oder die Daten leben längst in `claims`/`vehicles`/`leads` und der `faelle`-Spiegel wurde nie befüllt).

→ Die Klassifikation muss **drei Signale** kombinieren:
1. **Coverage** (dieses Doc) — „wird auf echten Rows befüllt?"
2. **Writer-Audit** (`cmm-48-writer-stellen-audit.md`, 101 Writer) — „schreibt Code die Spalte?"
3. **Rendering-Audit** (`claim-rendering-vertikal-audit.md`) — „liest/rendert ein Portal sie?"

Eine Spalte ist erst dann sicher **DROP**, wenn alle drei = nein. 0-Coverage + kein Writer + kein Reader.

---

## 2 · Die 76 Live-Spalten — Domänen-Mapping

Diese Spalten tragen nachweislich Daten → sicherer Migrations-Scope. Klassifiziert nach Ziel-Heimat:

### → `claims` (claim-globale Stammdaten / Status / Workflow)
`id`, `claim_id` (Bridge), `lead_id`, `fall_nummer` → `claim_nummer`, `created_at`, `updated_at`, `status`, `status_changed_at`, `aktuelle_phase`, `szenario`, `prioritaet`, `ist_aktiv`, `betreuungspaket`, `service_typ`, `konvertiert_am`, `konvertiert_von_lead`, `source_channel`, `sprache`, `unfall_konstellation`, `schadens_datum`, `schadens_ort`, `interne_notizen`, `notizen`, `ist_fahrzeughalter`

### → `claims` (Assignment — RLS-kritisch)
`kundenbetreuer_id`, `sv_id`, `sv_zugewiesen_am` — **`sv_id` ist der RLS-Schlüssel** (§3 RLS-Audit: `claims` hat heute kein natives `sv_id`).

### → `claims` (SA / Vollmacht / Dokumente)
`abtretung_pdf`, `abtretung_signiert_am`, `sa_unterschrieben`, `sa_unterschrieben_am`, `vollmacht_status`

### → `claim_parties` (rolle = geschaedigter)
`kunde_email`, `kunde_vorname`, `kunde_nachname`, `kunde_telefon`, `kunde_id`, `kunde_plz`, `kunde_stadt`, `kunde_strasse`, `kunde_adresse`, `kunde_lat`, `kunde_lng`

### → `claim_parties` (rolle = verursacher)
`gegner_anzahl_beteiligte`, `gegner_bekannt`, `gegner_versicherungsnummer`

### → `gutachter_termine` / Auftrag-LC
`wunschtermin`, `besichtigung_gestartet_am`, `besichtigungsort_adresse`, `besichtigungsort_lat`, `besichtigungsort_lng`, `losfahren_erinnerung_gesendet`, `termin_erinnerung_5min_gesendet`, `re_termin_token`, `gutachten_eingegangen_am`, `fallakte_angelegt_am`

### → `gutachten` / Auftrag-LC (SV-Briefing)
`sv_briefing_text`, `sv_briefing_model`, `sv_briefing_generated_at`, `sv_briefing_version`

### → `kanzlei_faelle` / Kanzleifall-LC
`mandatsnummer`, `vs_eskalationsstufe`, `nachbesichtigung_status`, `technische_stellungnahme_status`, `unfallmitteilung_status`, `ruege_frist_tage`

### → `abrechnungen` / Finanz-Sub
`kanzlei_provision_status`, `guthaben_verrechnet_netto`, `mietwagen_argumentations_puffer`

### → `vehicles` (Cluster H — Finanzierung)
`finanzierung_leasing`, `finanzierungsgeber_adresse`, `finanzierungsgeber_name`, `finanzierungsgeber_vertragsnr`

### → `claims` (Polizei)
`polizei_aktenzeichen`, `polizei_bericht_vorhanden`, `polizei_vor_ort`

---

## 3 · Die 265 0-Coverage-Spalten — Vorgehen

Nicht pauschal droppen. Vorgehen pro Spalte (Detailarbeit, mit den 3 Signalen):

| Befund | Aktion |
|---|---|
| 0-Coverage + **kein** Writer (CMM-48) + **kein** Reader | **DROP** — echt tot |
| 0-Coverage + Writer vorhanden | rare-Lifecycle-Spalte → in die passende Domäne migrieren (siehe §2-Schema) |
| 0-Coverage + Reader vorhanden, kein Writer | **Bug** — Reader liest tote Spalte (vgl. CMM-48-§0-Befund) → fixen |

**Domänen-Cluster der 265** (für die Detailarbeit gruppiert): Fahrzeug (`fahrzeug_*`, `kennzeichen*`, `fin_*`, `hsn`, `tsn`, `erstzulassung`, `kilometerstand`, `lackfarbe_code` → `vehicles`); Gutachten/OCR (`gutachten_*`, `ocr_*`, `gutachter_honorar` → `gutachten`); VS/Regulierung (`vs_*`, `regulierung_*`, `as_*`, `eskalation_tag_*` → `kanzlei_faelle`); Abrechnung (`abrechnung_*`, `auszahlung_*`, `*_honorar`, `lead_preis_*`, `iban`/`bic`/`kontoinhaber` → `abrechnungen`); Mietwagen (`mietwagen_*`, `nutzungsausfall*`); Halter (`halter_*` → `claim_parties`); Vorschäden (`vorschaden*`, `cardentity_*` → Cardentity-Audit §3.1c); Schaden-Stammdaten (`schadens_*`, `unfall*` → `claims`); Filmcheck/Nachbesichtigung/Stellungnahme (→ `kanzlei_faelle`/`auftraege`); tote Legacy (`gcal_event_id`, `kunde_match_via`, `marketing_*`, `makler_id`, `dispatch_id` — Writer-Check).

---

## 4 · Nächste Schritte

1. **Per-Spalten-Writer-Match:** Die 265 gegen die 101 Writer aus `cmm-48-writer-stellen-audit.md` + einen Reader-Grep abgleichen → endgültige DROP-Liste vs. Migrations-Liste. *(Detailarbeit, ~341 Zeilen Tabelle)*
2. **Coverage auf claims gegenprüfen:** Für jede „→ claims"-Spalte aus §2 — existiert sie schon auf `claims` (eine der 34 Duplikate) oder muss sie via `ALTER TABLE claims ADD COLUMN` neu?
3. Lifecycle-Tabellen-Coverage (`auftraege`/`kanzlei_faelle`/`gutachter_termine`) — Teil-Audit 2.
4. Cardentity-Audit — Teil-Audit 4.

---

## 5 · Quellen

Live-Coverage Management-API 16.05.2026 (`.faelle-coverage.json`, 30 Rows). Kombiniert mit `cmm-48-writer-stellen-audit.md` + `claim-rendering-vertikal-audit.md`. Ergänzt `claim-ssot-vollmigration-audit-strategie.md` §3.1a.
