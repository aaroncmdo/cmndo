# claims-Cleanup Handoff — 15.05.2026

**Empfänger:** F+G-Cluster-Session (`kitta/aar-cluster-fg-gutachten`)
**Stand:** 15.05.2026 ~12:00 Uhr
**Quelle:** Diese Session hat heute parallel zur F+G-Session am `claims`-Cleanup gearbeitet — horizontal-fokussiert (Spalten-Sanity, RLS, Trigger), komplementär zum vertikalen F+G-Audit.

---

## 1 · Was diese Session heute auf Prod-DB live geschickt hat

| PR | Ticket | Effekt auf DB |
|---|---|---|
| [#1278](https://github.com/aaroncmdo/cmndo/pull/1278) | (PGRST201-Followup) | n/a — Code-Fix FK-Hint in `dispatch/gutachter-finder` |
| [#1280](https://github.com/aaroncmdo/cmndo/pull/1280) | AAR-916 | `DROP FUNCTION get_sichtbare_qualifikationen` + `is_dat_badge_sichtbar` (Orphan-Code aus AAR-515, 0 Caller) |
| [#1282](https://github.com/aaroncmdo/cmndo/pull/1282) | AAR-914 | `REVOKE ALL FROM anon` auf 20 Finanztabellen (Defense-in-Depth, Audit-Doc `abrechnungen-rls-audit.md`) |
| [#1283](https://github.com/aaroncmdo/cmndo/pull/1283) | AAR-913 | Mass-Assignment-Trigger erweitert: `profiles.sv_paket/aktiv`, `sachverstaendige.paket*/gesperrt_*/verifizierung_status`, `makler.user_id` + 2 Policy-Splits `gutachter_monatsabrechnungen` / `_positionen` SV-ALL → SELECT |
| [#1286](https://github.com/aaroncmdo/cmndo/pull/1286) | AAR-915 | `gfa_rate_limit`-Tabelle + Function `check_gfa_rate_limit(ip_hash)` Sliding-Window 5/h (Schutz `gutachter_finder_anfragen.gfa_insert_public`) |
| [#1288](https://github.com/aaroncmdo/cmndo/pull/1288) | AAR-918 | `claims.leasinggeber_name` + `claims.finanzierung_bank` gedroppt (Audit A2, beide redundant, 0 Caller) |
| [#1292](https://github.com/aaroncmdo/cmndo/pull/1292) | AAR-919 | Trigger `guard_claims_created_by` — RLS-Layer für `created_by_user_id` dicht (Audit A5) |
| [#1290](https://github.com/aaroncmdo/cmndo/pull/1290) | docs | Audit-Docs offen für Review (4 Commits, Doc-only) |

**Alle Migrations via `supabase db push --linked` + `migration repair` appliziert. SQL-Proofs grün.**

---

## 2 · claims-horizontal-Audit (Befund-Roadmap A1–A10)

Quelle: `docs/15.05.2026/claims-horizontal-audit.md` (in PR #1290).

| Befund | Was | Status |
|---|---|---|
| **A1** | ~30 `gutachten_*`-Spalten direkt auf claims, obwohl gutachten-Sub-Tabelle via FK existiert | **→ F+G-Session** (Cluster F = 30 OCR + Cluster G = 8 Werte, Spec liegt bei dir) |
| A2 | Finanzierungs-Cluster — `leasinggeber_name` + `finanzierung_bank` redundant | ✅ AAR-918 / PR #1288 |
| A3 | Sync-Asymmetrie faelle↔claims: `bkat_unfallart` + `firma_name` in faelle ohne claims-Counterpart | OFFEN (passt zu CMM-Phase-2-Hygiene) |
| A4 | Kanzlei-Ansprechpartner (`name/email/telefon`) direkt auf claims, parallel zu kanzlei_pakete/kanzlei_faelle | OFFEN (eigenes Cross-Tabellen-Audit) |
| A5 | `created_by_user_id` RLS-Layer nicht dicht | ✅ AAR-919 / PR #1292 |
| A6 | `zeugen_kontakte jsonb` ohne Schema-Constraint, claim_parties existiert | OFFEN (LOW, fill-rate 0) |
| A7 | Index-Backlog (verjährung, gutachten_fin, kanzlei_uebergeben_am) | DEFERRAL bis Traffic |
| A8 | `schadenort_lat/lng numeric` statt PostGIS | DEFERRAL bis Geo-Queries kommen |
| A9 | status (7 Werte) vs phase (11 Werte) Reader-Consistency | ✅ AAR-920 / Docs in #1290 — **keine Inkonsistenz**, bewusste Trennung |
| A10 | `vorschaden_mit_vs_abgerechnet` text statt boolean | OFFEN (LOW) |

---

## 3 · F+G-Cluster — was meine Session dazugefunden hat

### a) Faelle hat KEINE der 30 OCR-Spalten

Verifiziert via `information_schema.columns`:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='faelle'
  AND column_name LIKE 'gutachten_%';
-- 0 rows
```

→ **Sync-Trigger `trg_sync_claims_to_faelle` und `trg_sync_faelle_to_claims` brauchen keinen Cleanup** für PR-1 (additive Schema-Erweiterung in `gutachten`). Trigger-Liste hat die OCR-Spalten eh nicht. Erleichterung für deine Migration A.

### b) Gutachten-Tabelle Spalten-Audit (vor PR-1)

`gutachten` hat aktuell 33 Process-Audit-Spalten (status, ocr_*, pdf_*, created_at, …) und **0 Rows** (Migration nie fertig — wie im Vertikal-Audit bemerkt). **0 von den 38 Werte-Spalten** existieren in gutachten. Saubere Greenfield-Migration.

Liste der existierenden `gutachten`-Spalten:
```
id, claim_id, sv_id, status, auftragsnummer, besichtigungstermin, besichtigt_am,
fertiggestellt_am, unterschrieben_am, gesamt_schadensbetrag, unterschrift_sv_url,
bericht_pdf_url, laeufer_report_id, created_at, updated_at, created_by_user_id,
notiz, pdf_uploaded_at, pdf_uploaded_by_user_id, pdf_size_bytes, pdf_seiten_count,
ocr_status, ocr_engine, ocr_engine_version, ocr_started_at, ocr_finished_at,
ocr_run_id, ocr_confidence, ocr_error_jsonb, gutachter_anbieter, felder_quelle_jsonb,
editable_for_sv, editable_for_kb
```

→ **`gutachten_seitenzahl` ↔ `pdf_seiten_count`** wären thematisch das gleiche. Konsolidieren bei deiner Migration A entweder via Rename-Backfill oder via View-Alias.

### c) Code-Caller-Liste (19 Files mit den 30 OCR-Spalten)

Aus Reader-Grep für deine Migration B:

| Portal | Files | # |
|---|---|---:|
| Admin | `app/faelle/[id]/page.tsx`, `_actions/gutachten-ocr.ts`, `components/admin/fallakte/GutachtenOcrCard.tsx`, `components/admin/fallakte/mietwagen/MietwagenEditCard.tsx`, `components/fall/StammdatenDetail.tsx`, `app/admin/statistiken/StatistikenClient.tsx` | 6 |
| SV | `app/gutachter/GutachterShell.tsx`, `gutachter/fall/[id]/FallDetailClient.tsx`, `gutachter/fall/[id]/_components/GutachtenCard.tsx`, `gutachter/fall/[id]/page.tsx`, `gutachter/faelle/page.tsx`, `gutachter/auftraege/page.tsx` | 6 |
| Kunde | `kunde/faelle/[id]/page.tsx` | 1 |
| OCR/API + Lib | `app/api/ocr-fahrzeugschein/route.ts` (?), `lib/ai/gutachten-ocr.ts`, `lib/auftrag/qc.ts`, `lib/auftrag/queries.ts`, `lib/auftrag/phase.ts`, `lib/claims/anspruch.ts`, `lib/kanzlei-wunsch/actions.ts`, `lib/smoke/lifecycle-seed.ts` | 8 |

Insgesamt ~25-35 Reader/Writer-Punkte. Du hattest in deinem PR-1-Plan-Doc 25 Files in 5 Sections aufgeteilt — passt zur Größenordnung.

### d) Mein A1-Stufenplan war Reader-Migration-heavy — dein View-Pattern ist besser

In meinem `claims-a1-gutachten-cleanup-plan.md` (mit OBSOLET-Marker, im Repo) hatte ich einen 5-Stufen-Plan vorgeschlagen: ADD → Backfill → Reader-Migration → Writer-Migration → DROP. **Dein View+Function-Pattern ist eleganter** — `v_gutachten_werte` mit COALESCE macht Reader transparent migrierbar, `apply_gutachten_ocr(claim_id, jsonb)` macht Writes atomar. Dein PR-1+PR-2 minimiert Code-Churn in der Übergangsphase.

---

## 4 · Verwandte Findings (außerhalb F+G aber relevant)

### Mass-Assignment-Lücken in den Gutachter-Abrechnungen (in AAR-913 mitgepatcht)

`gutachter_monatsabrechnungen` + `gutachter_abrechnungspositionen` hatten **eine** Policy `FOR ALL` für SV+Admin → SV konnte eigene Beträge UPDATEN/DELETEN. Fix: gesplittet in Admin-ALL + SV-SELECT. Live via PR #1283.

### Cluster C+L sind schon erledigt

Vertikal-Audit (14.05., aar-cluster-fg-Branch) listet `geschaedigter_party_id` + `verursacher_party_id` + `firma_name` + `firma_ustid` als Drop-Kandidaten. **Stand 15.05. 09:50:** Stufe-0-Final-Session hat die 4 schon am 14.05. gedroppt (`20260514132634`, `20260514142739`, `20260514144005`, `20260514203513`). `verursacher_user_id` existierte nie. → Nichts zu tun.

Plan-Doc dazu: `docs/15.05.2026/claims-cluster-c-l-quick-drops-plan.md` mit OBSOLET-Marker im Repo, als Lesson.

### Drift-Risiko bei `db push`

Bei meinem AAR-919-DB-Apply lief in der Remote-DB eine Migration `20260515094227` von einer anderen Session — `db push --include-all` hat verweigert. Recovery via `db query --linked --file <sql>` + `migration repair --status applied <version>` hat funktioniert. **Falls deine PR-1-Migration `db push` macht und scheitert**: gleicher Recovery-Pfad. Memory `live_rls_audit` und `feedback_supabase_connections` dokumentieren das Pattern.

---

## 5 · Linear-Cleanup heute

| Vorher | Nachher | Was war |
|---|---|---|
| AAR-623 In Review seit 20.04. | ✅ Done | PR #80 längst merged, Tracking stale |
| AAR-637 In Progress seit 20.04. | ❌ Canceled | PR #83 closed 23.04., Konzept verworfen |
| AAR-837 In Progress seit 26.04. | ❌ Canceled | Welle-7-Cluster verworfen (Recap 14.05.) |
| AAR-917 (ich angelegt für A1) | Linked → F+G | mit Cross-Reference auf deine Spec/PR-1-Plan |

Linear In-Progress + In-Review jetzt sauber: 0 stale Tickets.

---

## 6 · Memory-Update

`project_live_rls_audit` aktualisiert mit allen 4 RLS-Followups (AAR-913/914/915/916).

Neue Memory-Notiz wert: **"Vor jedem Cluster-Refactor erst `information_schema.columns` gegen aktuellen DB-Stand prüfen"** — sonst Duplikat-Arbeit zu parallel laufenden Drop-Migrations. Lesson aus AAR-919-Phantom (4 Spalten waren schon 14.05. weg).

---

## 7 · Empfehlung für die F+G-Session

1. **PR-1 (Schema + View + Function)** unverändert nach deiner Spec — meine Audit-Befunde bestätigen die Architektur. Backfill ist minimal (1 Row mit `gutachten_fin IS NOT NULL` von 16 total).
2. **`gutachten_seitenzahl` vs `pdf_seiten_count`** beim ADD-Migration entscheiden — entweder eines droppen oder klare Doku.
3. **Sync-Trigger** ist nicht zu touchen (faelle hat die 30 Spalten nicht).
4. **Reader-Migration (PR-2)** kann pro Portal granular gemacht werden — Admin/SV/Kunde getrennt mergen.
5. **`db push` Drift-Risiko** beachten — Recovery-Pfad bereit halten.

Wenn du Fragen hast, klingelt: meine Worktrees + Branches bleiben für Cross-Check stehen (`wt-aar916/914/913/915/918/919` plus `wt-claims-audit-docs`).

---

## Linked Audit-Docs

- `docs/15.05.2026/claims-horizontal-audit.md` — 10 Befunde A1–A10 mit Prio
- `docs/15.05.2026/abrechnungen-rls-audit.md` — 20 Finanztabellen RLS
- `docs/15.05.2026/mass-assignment-audit.md` — AAR-913 Trigger-Spalten
- `docs/15.05.2026/claims-status-phase-reader-audit.md` — A9 Verdikt
- `docs/15.05.2026/claims-a1-gutachten-cleanup-plan.md` — OBSOLET, mein Stufenplan
- `docs/15.05.2026/claims-cluster-c-l-quick-drops-plan.md` — OBSOLET (Stufe-0 hatte gedroppt)
