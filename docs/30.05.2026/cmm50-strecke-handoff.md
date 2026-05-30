# Handoff — CMM-50 (vehicles-Migration) Strecke 50.0 → 50.3a — 30.05.2026

**Master:** CMM-44 (faelle-Drop / Claim-SSoT-Vollmigration) · **Ticket:** [CMM-50](https://linear.app/aaroncmndo/issue/CMM-50) (SP-E vehicles)
**Session-Ergebnis:** Write-Path verdrahtet (vehicles war nie befüllt) + Schema-Lücke geschlossen + business→claims + 3 von 4 Views repointet. End-to-end live verifiziert. Eine PR (50.3b) bewusst gescopt + validiert offen.

---

## TL;DR

CMM-50 war als „Reader auf vehicles umlenken" gedacht — der Audit zeigte: die `vehicles`-SSoT war **leer**, weil der **Write-Path nie verdrahtet** wurde (`upsert_vehicle_by_fin` = 0 Caller). Diese Session hat den Strang **re-sequenziert + zu großen Teilen gebaut**:

| Sub-Phase | Inhalt | PR | Stand |
|---|---|---|---|
| **50.0** | Write-Path: Helper `ensureVehicleFromFin` an 5 FIN-Punkten | [#2066](https://github.com/aaroncmdo/cmndo/pull/2066) | ✅ MERGED |
| **50.1** | Schema-Lücke: 4 ADD + Casts + Snapshot-Secondary-UPDATE | [#2068](https://github.com/aaroncmdo/cmndo/pull/2068) | ✅ MERGED |
| **50.2** | business→claims: leasinggeber_name + finanzierung_bank | [#2071](https://github.com/aaroncmdo/cmndo/pull/2071) | 🟡 OFFEN (gegen staging) |
| **50.3a** | View-Repoint (3 Views, COALESCE-Fallback) | [#2073](https://github.com/aaroncmdo/cmndo/pull/2073) | 🟡 OFFEN (gegen staging) |
| **50.3b** | `v_faelle_mit_aktuellem_termin` (17k) + 4 direkte Reader | — | ⏳ VERBLEIBT (Approach validiert) |
| Scoping-Docs | Spec/Plan FINAL | [#2060](https://github.com/aaroncmdo/cmndo/pull/2060) | ✅ MERGED |
| Halter (AK 2.3) | → delegiert | [CMM-67](https://linear.app/aaroncmndo/issue/CMM-67) | Backlog (blockt CMM-49) |
| 50.0 Produkt-Gap | Tracking-Issue | [CMM-68](https://linear.app/aaroncmndo/issue/CMM-68) | In Progress |

**E2E-Smoke (`scripts/probe-cmm50-e2e-smoke.mjs`): PASS** — vehicle anlegen (50.0) → Snapshot+Casts (50.1) → an Claim hängen → alle 3 Views surfacen die Daten (50.3a) → revert+cleanup. Beweist die ganze Kette live.

---

## 1 · Was gebaut wurde (Details)

### 50.0 — Write-Path (#2066, merged)
Helper `src/lib/vehicles/ensure-vehicle.ts` (wraps `upsert_vehicle_by_fin`, idempotent, non-critical) an **5** FIN-Punkten: ZB1-OCR (`upload/zb1/[token]/actions.ts`), Cardentity-Enrich (`enrich-fahrzeug.ts`, lead→leads.vehicle_id / fall→claim_id→claims.vehicle_id), `saveFinVin`, `saveFinVinGutachter`, Lead-Konversion (`convert-lead-to-claim.ts`, 3-Surface: claims+claim_parties+cvi). **Adversarial-Review (`wf_c70d64e6`) fing 1 Blocker:** cvi-Insert nutzte `rolle='geschaedigt'` (verstößt live CHECK; war toter Code, 50.0 aktiviert ihn) → `geschaedigter` + cvi non-fatal.

### 50.1 — Schema-Lücke (#2068, merged)
Migration `20260530185227`: ADD `vehicles.{kennzeichen_buchstaben, fahrzeug_ausstattung jsonb, fin_quelle, fin_extrahiert_am}` (`lackfarbe_code`→bestehendes `farbcode`). Helper um **Secondary-UPDATE** erweitert (RPC schreibt nur 8 Felder) + Casts (baujahr int→date, **erstzulassung text→date mit Kalender-Validierung**). 5 Call-Sites übergeben den richeren Snapshot. **Review (`wf_72bb465a`) 2 Majors:** (1) convert-lead las 3 nicht-existente leads-Spalten (Record-Cast versteckte es vor tsc) → bauart gedroppt + FIN-Literale; (2) `textToDateStr` Tag-vs-Monat ungeprüft (31.02→PG-22008→killt Batch-UPDATE) → Kalender-Round-Trip-Check.

### 50.2 — business→claims (#2071, offen)
Migration `20260530192122`: ADD `claims.{leasinggeber_name, finanzierung_bank}` + claim_id-Backfill. Writer: `convert-lead-to-claim` post-insert (Admin-Client untyped — Type-Regen aufgeschoben, AGENTS.md §6). Audit: `leasinggeber_name` distinkt von `claims.finanzierungsgeber_name`; beide Felder + Lead-Quellen live leer; einziger Reader = StammdatenReadSection (→50.3), kein Edit-Allowlist-Writer.

### 50.3a — View-Repoint 3 Views (#2073, offen)
Migration `20260530194624`: `CREATE OR REPLACE VIEW` `faelle_kunde_view` / `faelle_sv_view` / `v_claim_full` — Fahrzeug-Spalten aus `vehicles` via `LEFT JOIN vehicles veh ON veh.id = c.vehicle_id` + **COALESCE-Fallback auf `f.fahrzeug_*`**. **Precision-Casts Pflicht:** `kennzeichen_aktuell::text`, `EXTRACT(YEAR FROM baujahr_monat)::integer`, `bauart`. **Verifikation:** EXCEPT-Diff gegen Live-View **vor** Apply = 0/0 byte-identisch (vehicles leer); E2E-Smoke beweist Vehicle-Surfacing wenn befüllt. `reloptions=null` + Grants via CREATE OR REPLACE erhalten.

---

## 2 · Was verbleibt — 50.3b (Approach validiert, bewusst deferred)

- **`v_faelle_mit_aktuellem_termin`** (17k Zeichen, **15 Fahrzeug-Domänen-Spalten**: kennzeichen, fahrzeug_typ/hersteller/modell/baujahr/farbe, erstzulassung, kilometerstand, fin_vin, fahrzeug_ausstattung, hsn, tsn, lackfarbe_code, fin_quelle, fin_extrahiert_am). Mapping + Casts identisch zum 50.3a-Pattern (s. Migration `20260530194624` als Vorlage + Spec §4). Live-Def via `pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true)`. **Verifikation: gleiche EXCEPT-Diff-Technik** (`(view EXCEPT newselect) UNION (newselect EXCEPT view)` = 0/0 vor Apply).
- **4 direkte Reader** → vehicles via vehicle_id (COALESCE-in-code): `lib/email/google/flows.ts` (liest auch `lackfarbe_code`), `lib/kanzlei/push-mandat.ts` (firma_name/kennzeichen), `lib/makler/copilot-prompt.ts` (`from('faelle').select('*')` :86, fahrzeug_* :167/:202). **`lib/claims/get-kunde-faelle.ts` ist bereits vehicles-first** (cvi+vehicles, faelle-Fallback) — braucht ggf. keine Änderung.
- **Warum deferred:** 17k-Hand-Transkript einer Prod-View + COALESCE-Reader-Umbau wollen Adversarial-Review (Workflow-Limit bis **2026-06-02**). Approach für alle 4 Views ist validiert (3/4 parity 0/0).

---

## 3 · Wichtiger Kontext: „funktional No-Op bis vehicles befüllt"

`vehicles` ist **leer** (kein FIN-Traffic seit 50.0-Deploy). Solange leer, ist 50.3 funktional ein **No-Op** (COALESCE fällt auf faelle zurück → Views unverändert). Der **Nutzen** entsteht, sobald der 50.0-Write-Path `vehicles` füllt (neue FIN-Leads/Konversionen). Der **harte Cutover** (COALESCE→faelle entfernen → `faelle.fahrzeug_*` auf 0 Reader → **entsperrt CMM-49** faelle-Drop) kommt erst, wenn `vehicles` **verlässlich** befüllt ist — separate, spätere Stufe.

**Backfill (deferred, CMM-68/50.0-Reststrecke):** bestehende Records mit FIN aber ohne vehicle_id (live ~1) → vehicles-Row. Eigene Folge-Migration; kein Prod-DML in den bisherigen PRs.

---

## 4 · Querverweise

| Achse | Referenz |
|---|---|
| Linear | [CMM-50](https://linear.app/aaroncmndo/issue/CMM-50) (Strang, In Progress) · [CMM-67](https://linear.app/aaroncmndo/issue/CMM-67) (SP-C3 Halter, blockt CMM-49) · [CMM-68](https://linear.app/aaroncmndo/issue/CMM-68) (50.0 Produkt-Gap) · [CMM-49](https://linear.app/aaroncmndo/issue/CMM-49) (faelle-Drop, blockedBy CMM-50) |
| PRs | #2060 (Spec/Plan, merged) · #2066 (50.0, merged) · #2068 (50.1, merged) · #2071 (50.2, offen) · #2073 (50.3a, offen) |
| Spec/Plan | `docs/superpowers/specs/2026-05-30-cmm50-vehicles-migration.md` · `docs/superpowers/plans/2026-05-30-cmm50-vehicles.md` |
| Migrationen | `20260530185227` (50.1) · `20260530192122` (50.2) · `20260530194624` (50.3a) · RPC `20260425120400_aar773_upsert_vehicle_by_fin_rpc.sql` |
| Probes/Smokes | `scripts/probe-cmm50-vehicles.mjs` (Grounding) · `scripts/probe-cmm50-0-writepath.mjs` (50.0) · `scripts/probe-cmm50-1-schema.mjs` (50.1 Casts) · `scripts/probe-cmm50-e2e-smoke.mjs` (E2E 50.0→50.3a) |
| Review-Workflows | `wf_82364751-2a5` (Audit) · `wf_093f7c2e-763` (Spec-Verify) · `wf_c70d64e6` (50.0-Review) · `wf_72bb465a` (50.1-Review) |
| Memory | `project_cmm50_vehicles_scoping` · Lessons: `feedback_dead_code_activation`, `feedback_information_schema_check`, `feedback_write_tool_content_artifact` |
| Worktrees | `.claude/worktrees/cmm-50-{0-write-path,1-vehicles-schema,2-business-claims,3-reader-view-repoint}` |

---

## 5 · Lessons (Lesson-fest)

1. **Audit-first schlägt jede Spec-Schätzung** — drei Mal in diesem Strang: vehicles-SSoT leer (nicht „Reader relocaten"); lackfarbe→bestehendes farbcode (nicht ADD); leasinggeber_name/bank_name leer + bank_name fast-redundant.
2. **Tote Pfade aktivieren latente Bugs** — der cvi `rolle='geschaedigt'`-Blocker war toter Code, den 50.0 scharf schaltete. Vor Aktivierung: gegen Live-Constraints prüfen. ([[feedback_dead_code_activation]])
3. **`select('*')` + `Record<string,unknown>`-Cast versteckt nicht-existente Spalten-Reads vor tsc** — convert-lead las 3 nicht-existente leads-Spalten. Quell-Spalten live verifizieren. ([[feedback_information_schema_check]])
4. **View-Repoint sicher ohne Review-Workflow:** EXCEPT-Diff (`(view EXCEPT newselect) UNION (newselect EXCEPT view)` = 0/0) gegen die Live-View **vor** dem Apply — beweist Byte-Identität ohne apply-then-rollback. Precision-Casts (date↔int↔text) sind Pflicht, sonst scheitert `CREATE OR REPLACE` an Typ-Mismatch.
5. **E2E-DB-Smoke (Test-Vehicle kurz an Claim + finally-revert)** zeigt das, was Parity bei leerer SSoT nicht kann: dass die Daten end-to-end durch die Views fließen.
6. **Write-Tool-Artefakt:** `</content>` wird ans Dateiende gehängt (bricht tsc, kontaminiert PRs) — nach jedem Write scannen + via Edit strippen. ([[feedback_write_tool_content_artifact]])

---

## 6 · Nächste Schritte für die nächste Session

1. **#2071 (50.2) + #2073 (50.3a) reviewen/mergen** (Aaron / Merge-Session).
2. **50.3b** umsetzen (ideal mit Review-Workflow ab 2.6.): `v_faelle_mit_aktuellem_termin` repointen (EXCEPT-Diff-Technik, 15 Spalten + Casts) + 4 direkte Reader. Vorlage: Migration `20260530194624`.
3. **Backfill** der ~1 Bestands-FIN-Row (CMM-68-Reststrecke) sobald gewünscht.
4. **Harter Cutover** (COALESCE→faelle raus) erst wenn `vehicles` verlässlich befüllt → meldet an CMM-49.
5. Offene Aaron-Entscheidung (optional): braucht 50.0/CMM-68 ein eigenes Produkt-Feature-Ticket außerhalb CMM (aktuell unter Claimondo Migration getrackt)?
