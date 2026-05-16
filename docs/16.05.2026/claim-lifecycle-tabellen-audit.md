# Claim-SSoT — Lifecycle-Tabellen-Audit (`auftraege` / `kanzlei_faelle` / `gutachter_termine`)

**Datum:** 2026-05-16
**Zweck:** Spaltengenaues Writer-/Reader-Audit der 3 Lifecycle-Tabellen + welche `faelle`-Spalten dorthin gehören. Teil-Audit 2 von `claim-ssot-vollmigration-audit-strategie.md` (§3.2).

**Übergeordneter Befund:** Alle 3 Tabellen sind heute strukturell „dünn" — der eigentliche Lifecycle-Zustand (~90 Spalten: Eskalation, VS-Reaktion, Mandat, Termin-Adresse, Reminder-Flags, Honorar) lebt auf `faelle`. `auftraege`/`kanzlei_faelle` haben `claim_id` (NOT NULL, Trigger-Backfill); **`gutachter_termine` hat KEIN `claim_id`**.

---

## 1 · `auftraege` (17 Spalten) — Auftrag-Lifecycle

- **claim_id:** vorhanden, NOT NULL, FK — aber von App-Code **nie explizit geschrieben** (Trigger `trg_auftraege_sync_claim_id` backfillt aus `faelle.claim_id`) und **nur 1× gelesen** (`lib/ai/gutachten-ocr.ts`). `AUFTRAG_SELECT` ignoriert es.
- **Writer:** `lib/auftrag/create.ts` (insert), `api/sv/upload-gutachten`, `lib/auftrag/qc.ts` (QC-Pipeline). `grundhonorar_*` nur im Smoke-Seed geschrieben — kein Prod-Writer.
- **Reader:** zentraler Loader `lib/auftrag/queries.ts` (`AUFTRAG_SELECT`); SV-Portal breit, Admin-Fallakte.
- **Latenter Bug:** `createSideQuestAuftrag` (`create.ts:79`) schreibt `status='geplant'` — CHECK erlaubt nur `termin|besichtigung|gutachten|abgeschlossen`. Vor Refactor verifizieren.

**faelle-Spalten die hierher gehören** (SV-Auftrags-Lifecycle): Nachbesichtigung (`nachbesichtigung_*`, 9), Technische Stellungnahme (`technische_stellungnahme_*`, 5), `sv_briefing_*` (5), `filmcheck_*` (3), `gutachten_vorhanden/_hochgeladen_am/_eingegangen_am/_nummer`, `gutachter_honorar`, `sv_nachzahlung_netto`.
→ Nachbesichtigung + Stellungnahme sind per `typ` schon eigene `auftraege`-Records — ihre Status-Felder gehören an genau diese Row.
→ **Aber:** reine Gutachten-*Werte* (`gutachten_betrag`, `reparaturkosten`, `ocr_*`, `ki_*`) gehören NICHT nach `auftraege` sondern in die `gutachten`-Sub-Table (Cluster F+G, claim-eigen — CMM-32a-Migration sagt das explizit).

---

## 2 · `kanzlei_faelle` (8 Spalten) — Kanzleifall-Lifecycle

- **claim_id:** NOT NULL, **UNIQUE**, FK ON DELETE CASCADE — sauberste claim-Verankerung der 3. Bidir-Trigger `trg_kanzlei_faelle_sync` (`claim_id`↔`fall_id`).
- **Writer:** `lib/auftrag/qc.ts` (insert bei QC-Freigabe), `lib/kanzlei-wunsch/actions.ts`, `lib/kanzlei-fall/actions.ts` (update `vs_kontakt_am`/`ausgezahlt_am`).
- **Reader:** zentraler Loader `lib/kanzlei-fall/queries.ts`; dünnste Reader-Oberfläche (~5 Stellen).
- Tabelle hat heute nur `status` (`versicherungskontakt|auszahlung`) + 2 Timestamps.

**faelle-Spalten die hierher gehören** — der **größte Migrations-Block** (~70 Spalten):
- Kanzlei-Übergabe: `kanzlei_id`, `kanzlei_uebergeben_am`, `kanzlei_ansprechpartner_*` (4), `mandatsnummer`, `klage_uebergeben_am`, `lexdrive_*` (3)
- Kanzlei-Honorar: `kanzlei_honorar`, `kanzlei_abrechnung_id`, `kanzlei_provision_status`, `kanzlei_provision_ausgezahlt_am`
- Anschlussschreiben: `as_*` (5), `anschlussschreiben_*` (5)
- VS-Regulierung: `regulierung_*` (4), `vs_reaktion_*`, `vs_ablehnungsgrund`, `vs_eskalationsstufe`, `vs_frist_bis`, `vs_kuerzung*`, `vs_quote_*` (5), `kuerzungs_betrag`, `unfallmitteilung_status`
- Eskalations-Kaskade: `eskaliert_*` (3), `eskalation_tag_14/21/28_*` (12), `re_termin_eskalation_an_kb_am`
- Auszahlung: `auszahlung_*` (5), `zahlung_*` (4), `schlussabrechnung_am`, `guthaben_verrechnet_netto`
- Rüge: `ruege_*` (6)

→ `kanzlei_faelle` braucht eine **breite Spalten-Erweiterung** oder eine separate `regulierung`-Sub-Table — `status` allein reicht nicht.

---

## 3 · `gutachter_termine` (84 Spalten) — Besichtigungstermin

- **KEIN `claim_id`** — nur `fall_id`/`lead_id`/`auftrag_id`/`sv_lead_id` (alle nullable). Claim-Anbindung nur indirekt. **Größte strukturelle Lücke der 3.**
- **Kein zentraler Loader** — ~40 ad-hoc-SELECTs über alle Portale, jedes mit eigenem Spalten-Set.
- **Writer:** Slot-/Dispatch-Strecke (insert), Verlegungs-Flow, KB-Booking; viele Single-Column-Tracking-Updates (`lib/termine/*`).
- **Latenter Bug:** `lib/termine/actions.ts:440` schreibt `sv_notizen` — Spalte **existiert nicht** (richtig: `notizen_vor_ort`), Cast umgeht TS.

**faelle-Spalten die hierher gehören** (viele bereits dupliziert → aktive Drift):
- Besichtigungsort: `besichtigungsort_*` (5)
- **Drift:** `besichtigung_gestartet_am` existiert auf **beiden** Tabellen; `wunschtermin`, `gcal_event_id`
- Reminder-Flags: `termin_erinnerung_5min_gesendet`, `losfahren_erinnerung_gesendet`, `dokumente_reminder_whatsapp_letzte_sendung`, `sv_termin_dokument_reminder_gesendet_am` — `gutachter_termine` hat dafür schon `reminder_*`/`erinnerung_*`/`notification_*`
- Re-Termin: `re_termin_token`, `re_termin_token_eingelaufen_am`
- `sv_notizen_vor_ort` → `gutachter_termine.notizen_vor_ort`
- No-Show: `no_show_count`, `no_show_gemeldet_am`

---

## 4 · Gesamtempfehlung

| Ziel-Tabelle | faelle-Cluster | Priorität / Aufwand |
|---|---|---|
| `gutachter_termine` | besichtigungsort_* + Termin-Drift-Spalten + Reminder-Flags + Re-Termin + no_show | **Hoch** — aktive Drift (`besichtigung_gestartet_am` doppelt), kein neues Schema nötig |
| `kanzlei_faelle` | Kanzlei/AS/VS/Eskalation/Auszahlung/Rüge (~70 Spalten) | **Mittel** — größter Block, braucht Spalten-Erweiterung oder `regulierung`-Sub-Table |
| `auftraege` | Nachbesichtigung/Stellungnahme/Briefing/Filmcheck-Status | **Mittel** — Status-Felder an die `typ`-Records |
| `gutachten` (Sub-Table, NICHT auftraege) | Gutachten-Werte (`gutachten_betrag`, `reparaturkosten`, `ocr_*`, `ki_*`) | claim-eigen, Cluster F+G |

**Strukturelle Voraussetzungen:**
1. **`gutachter_termine.claim_id`** anlegen (FK + Backfill-Trigger aus `fall_id`/`auftrag_id`) — Pflicht vor jeder Termin-Migration (auch RLS, siehe `claim-rls-audit.md` R1).
2. **`lib/termine/queries.ts`** als zentralen Loader extrahieren (analog `auftrag/queries.ts`) — sonst müssen ~40 ad-hoc-SELECTs einzeln nachgezogen werden.
3. Latente Bugs vor Refactor fixen: `createSideQuestAuftrag` `status='geplant'`, `termine/actions.ts:440` `sv_notizen`.

## 5 · Quellen

Code-Audit 16.05.2026 (`database.types.ts`, `lib/auftrag/*`, `lib/kanzlei-fall/*`, `lib/termine/*`, Migrations cmm32a/cmm-1-5c/aar). Ergänzt `claim-ssot-vollmigration-audit-strategie.md` §3.2.
