# AAR-917 Stufenplan — Gutachten-OCR-Cluster claims → gutachten

> **⚠️ Hinweis:** Eine **parallele Session** (Branch `kitta/aar-cluster-fg-gutachten`) hat am 14.05.2026 ein vertikales Cluster-F+G-Audit gemacht + eine elegantere Architektur designed. Maßgebliche Spec:
> - `docs/superpowers/specs/2026-05-14-cluster-fg-gutachten-subtable-design.md` (F+G-Cluster-Design, 38 Spalten = 30 OCR + 8 Werte, View+Function statt Stufen-Sweep)
> - `docs/superpowers/plans/2026-05-14-cluster-fg-gutachten-pr1.md` (13-Task-PR-1-Plan)
>
> Dieses Doc bleibt als **Stufenplan-Alternative** im Repo. Soll-Weg ist die F+G-Spec (View `v_gutachten_werte` + Function `apply_gutachten_ocr` für Dual-Write — minimaler Code-Churn in der Übergangsphase). Mein Plan war funktional aber Reader-Migration-heavy, F+G-Spec mit View ist Reader-transparent.

**Datum:** 15.05.2026 (Plan, keine Code-Änderung)
**Ticket:** [AAR-917](https://linear.app/aaroncmndo/issue/AAR-917) (verlinkt mit F+G-Cluster)
**Vorarbeit:** [claims-horizontal-audit.md](./claims-horizontal-audit.md) Abschnitt A1
**Vorgänger:** PR #1288 AAR-918 (claims-A2 Finanz-Cleanup)

## Ziel

30 OCR-Inhalts-Spalten von `claims` zur bereits existierenden `gutachten`-Sub-Tabelle verschieben. Aktuell liegen die Process-Audit-Felder (status, ocr_*, pdf_uploaded_*) auf `gutachten`, die OCR-Inhalte (FIN, Kennzeichen, Beträge, Lohnsätze) auf `claims` — zwei Orte für zusammenhängende Daten.

## Voruntersuchung

### A · faelle hat KEINE der 30 OCR-Spalten

Verifiziert via `information_schema.columns`:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='faelle'
  AND column_name LIKE 'gutachten_%';
-- 0 rows
```

→ **Sync-Trigger `trg_sync_*_claims_*_faelle` braucht keinen Cleanup.** Migration nur claims↔gutachten.

### B · gutachten hat 33 Spalten (Process-Audit)

Vorhanden in gutachten: `id`, `claim_id`, `sv_id`, `status`, `auftragsnummer`, `besichtigungstermin`, `besichtigt_am`, `fertiggestellt_am`, `unterschrieben_am`, `gesamt_schadensbetrag`, `unterschrift_sv_url`, `bericht_pdf_url`, `laeufer_report_id`, `created_at`, `updated_at`, `created_by_user_id`, `notiz`, `pdf_uploaded_at`, `pdf_uploaded_by_user_id`, `pdf_size_bytes`, `pdf_seiten_count`, `ocr_status`, `ocr_engine`, `ocr_engine_version`, `ocr_started_at`, `ocr_finished_at`, `ocr_run_id`, `ocr_confidence`, `ocr_error_jsonb`, `gutachter_anbieter`, `felder_quelle_jsonb`, `editable_for_sv`, `editable_for_kb`.

Es **fehlen** die 30 OCR-Inhalts-Spalten:

`gutachten_datum`, `gutachten_ocr_processed_at`, `gutachten_ocr_raw`, `gutachten_ocr_error`, `gutachten_fin`, `gutachten_kennzeichen`, `gutachten_erstzulassung`, `gutachten_laufleistung_km`, `gutachten_tuv_bis`, `gutachten_fahrzeug_typ`, `gutachten_farbe`, `gutachten_farbcode`, `gutachten_kraftstoff`, `gutachten_vorschaeden_text`, `gutachten_lackmesswert_max_my`, `gutachten_karosseriezustand`, `gutachten_zeit_ak_std`, `gutachten_zeit_kar_std`, `gutachten_zeit_lack_std`, `gutachten_lohnsatz_ak_eur`, `gutachten_lohnsatz_kar_eur`, `gutachten_lohnsatz_lack_eur`, `gutachten_materialkosten_eur`, `gutachten_lackmaterial_eur`, `gutachten_verbringung_eur`, `gutachten_mietwagen_klasse`, `gutachten_mietwagen_tagessatz_eur`, `gutachten_nutzungsausfall_tagessatz_eur`, `gutachten_sv_honorar_netto`, `gutachten_sv_honorar_brutto`, `gutachten_kalkulationssystem`, `gutachten_seitenzahl`, `gutachten_ocr_manuell_ueberschrieben`.

Anmerkung: viele dieser Namen haben den `gutachten_`-Prefix nur historisch — beim Verschieben zu `gutachten`-Tabelle kann der Prefix entfallen (z.B. `fin`, `kennzeichen`, `lohnsatz_ak_eur`). **Empfehlung:** Prefix beim Verschieben weglassen für sauberes Schema in gutachten. Doppel-Naming `gutachten.gutachten_fin` ist ugly.

### C · Daten-Stand (16 claims Rows)

Fill-Rate aus claims-Audit:
- `gutachten_fin IS NOT NULL`: 1/16

→ **Backfill für Migration: minimal** (1 Row). Bei nicht-existierendem `gutachten`-Record zur Claim-Id muss ein Insert in `gutachten` gemacht werden, dann die 30 Felder befüllt werden.

### D · 19 Code-Stellen

Files die mindestens eine der 30 Spalten referenzieren (außer `database.types.ts`):

| File | Wahrscheinlicher Mode |
|---|---|
| `src/app/admin/statistiken/StatistikenClient.tsx` | Reader (Stats-Aggregate) |
| `src/app/faelle/[id]/_actions/gutachten-ocr.ts` | Writer (OCR-Apply) |
| `src/app/faelle/[id]/page.tsx` | Reader (Admin-Fallakte) |
| `src/app/gutachter/auftraege/page.tsx` | Reader (SV-Auftragsliste) |
| `src/app/gutachter/faelle/page.tsx` | Reader (SV-Fall-Liste) |
| `src/app/gutachter/fall/[id]/_components/GutachtenCard.tsx` | Reader (SV-Detail) |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx` | Reader |
| `src/app/gutachter/fall/[id]/page.tsx` | Reader |
| `src/app/gutachter/GutachterShell.tsx` | Reader (Shell-Aggregate) |
| `src/app/kunde/faelle/[id]/page.tsx` | Reader (Kunde-Fallakte) |
| `src/components/admin/fallakte/GutachtenOcrCard.tsx` | Reader+Writer (UI-Editor) |
| `src/lib/ai/gutachten-ocr.ts` | Writer (OCR-Apply) |
| `src/lib/auftrag/phase.ts` | Reader |
| `src/lib/auftrag/qc.ts` | Reader (QC-Check) |
| `src/lib/auftrag/queries.ts` | Reader (Query-Layer) |
| `src/lib/claims/anspruch.ts` | Reader (Anspruchs-Berechnung) |
| `src/lib/kanzlei-wunsch/actions.ts` | Reader/Writer |
| `src/lib/smoke/lifecycle-seed.ts` | Writer (Test-Seed) |
| `src/app/gutachter/fall/[id]/page.tsx` | Reader (Detail) |

Größenordnung: ~25-35 Reader/Writer-Punkte über die 19 Files. Geschätzter Code-Sweep: 6-8h.

## Stufenplan (sicher reviewbar)

### Stufe 1 — Plan (DIESES DOC) ✅

Audit-Doc + Spalten-Mapping + Caller-Liste. **Heute fertig.**

### Stufe 2 — ADD: gutachten kriegt 30 Spalten (additive Migration)

Eine Migration die alle 30 Spalten in `gutachten` mit der jeweils passenden Typ-Definition addet. **Niemand bricht**, weil claims-Spalten nicht angefasst werden. Reader/Writer können wahlweise alt (claims) oder neu (gutachten) lesen/schreiben.

Empfohlene Namens-Reduktion beim Verschieben:
- `gutachten_fin` → `fin` (auf gutachten)
- `gutachten_kennzeichen` → `kennzeichen`
- `gutachten_lohnsatz_ak_eur` → `lohnsatz_ak_eur`
- usw.

Risiko: minimal. Reversibel via DROP.

### Stufe 3 — Backfill-Migration (claims → gutachten)

Für jede claim_id mit OCR-Daten:
- Wenn `gutachten`-Record existiert → UPDATE mit den 30 Werten
- Wenn nicht → INSERT minimalen Record + 30 Werte

Aktuell 1 Row betroffen → minimaler Backfill.

```sql
INSERT INTO gutachten (claim_id, fin, kennzeichen, ...)
SELECT c.id, c.gutachten_fin, c.gutachten_kennzeichen, ...
FROM claims c
WHERE c.gutachten_fin IS NOT NULL  -- oder beliebige andere OCR-Spalte
  AND NOT EXISTS (SELECT 1 FROM gutachten g WHERE g.claim_id = c.id)
ON CONFLICT DO NOTHING;

UPDATE gutachten g SET
  fin = c.gutachten_fin,
  kennzeichen = c.gutachten_kennzeichen,
  ...
FROM claims c
WHERE g.claim_id = c.id
  AND c.gutachten_fin IS NOT NULL;
```

### Stufe 4 — Reader-Migration

Alle 19 Files auf gutachten-JOIN umstellen. Pro File:
- `claims!inner(...gutachten_fin,gutachten_kennzeichen,...)` → `gutachten(fin,kennzeichen,...)` als nested embed via FK `gutachten.claim_id → claims.id`
- TypeScript-Cast auf Single via `Array.isArray(x) ? x[0] : x`-Pattern (Memory `feedback_completion_checklist`)

Reihenfolge nach Risiko:
1. Stats-/Smoke-/QC-Reader (geringe UI-Wirkung)
2. SV-Portal-Reader
3. Admin-Fallakte
4. Kunde-Fallakte

### Stufe 5 — Writer-Migration

Writer (vor allem `gutachten-ocr.ts` + `GutachtenOcrCard.tsx`) schreiben jetzt nach `gutachten`. Dual-Write-Phase kann übersprungen werden weil Backfill in Stufe 3 die Konsistenz garantiert + Reader sind in Stufe 4 schon umgestellt.

### Stufe 6 — DROP claims-Spalten

Wenn alle Reader/Writer auf gutachten umgestellt + Smoke gegen Prod-DB lief:

```sql
ALTER TABLE claims DROP COLUMN gutachten_fin;
ALTER TABLE claims DROP COLUMN gutachten_kennzeichen;
... (28 weitere)
```

Memory `feedback_post_drop_smoke` — Pflicht-Smoke vor PR-Merge: Admin-Fallakte / SV-Auftragsliste / Kunde-Portal alle laden ohne 5xx.

### Stufe 7 — Cleanup

- `database.types.ts` regeneriert
- claims-horizontal-audit Memo + `live_rls_audit`-Memory aktualisieren
- AAR-917 Linear-Status auf Done

## Geschätzter Aufwand pro Stufe

| Stufe | Aufwand | Risiko | Reviewbar |
|---|---|---|---|
| 1 Plan | done | — | ✓ |
| 2 ADD | 30 min | min | ja, sehr klein |
| 3 Backfill | 30 min | low | ja, 1 Row betroffen |
| 4 Reader | 4-5h | mid | ja, viele Files aber Pattern wiederholt |
| 5 Writer | 1-2h | mid | ja |
| 6 DROP | 1h + Smoke | mid | ja |
| 7 Cleanup | 30 min | min | ✓ |

**Gesamt:** 8-10h sauberer Arbeit + Smoke + Reviews. Geht über 1-2 Sessions.

## Anti-Patterns die wir vermeiden

- **Big-Bang-Migration** (alle Stufen in einer PR): unreviewbar, Rollback bei Fail unmöglich
- **Dual-Write** mit Code-Sync: erzeugt Race-Conditions zwischen claims-Write und gutachten-Write
- **Sync-Trigger als Brücke**: Trigger-Drift-Risiko (Memory `live_rls_audit` Lessons)
- **claims-Spalten als deprecated lassen statt droppen**: führt zu zweitem Schema-Smell wenn jemand wieder darauf schreibt

## Memorys

`project_cmm_phase_15_done`, `feedback_post_drop_smoke`, `feedback_supabase_connections` (parallele DB-Ops).
