# CMM-44 MP-6 — System-A-Drop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Steps `- [ ]`. **DDL nur via Supabase-Plugin** (`apply_migration` → `list_migrations` → File `<V>_<name>.sql` benennen; Regel 2 / PR #1896). Spec + Inventur + Entscheidungen: `cmm44-mp6-system-a-drop-plan.md` (gleiche Branch).

**Goal:** `claims.phase` (System-A, 10-Code) + sein Trigger-/Funktions-Geflecht entfernen; alle Phasen kommen aus `v_claim_phase` (`main_phase`/`sub_phase`).

**Architecture:** Strangler in 3 PRs — **6b** Views additiv um `main_phase`/`sub_phase` erweitern (alter Alias bleibt) → **6a** ~10 Reader einzeln auf `main/sub` umstellen → **6c** Alias + Spalte + Trigger-Geflecht droppen. A+B vor C; C irreversibel.

**Tech Stack:** Postgres (Plugin-DDL), Next.js/TS. Jede Stufe eigener Branch off `staging`, PR `--base staging`, Smoke vor der nächsten Stufe.

---

## Sub-Projekt 6b — Views additiv erweitern (zuerst; entkoppelt 6a)

**Ziel:** Die 5 Views (`v_claim_listing`, `v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`) liefern `main_phase` + `sub_phase` aus `v_claim_phase`, **zusätzlich** zum noch vorhandenen `aktuelle_phase` (= `c.phase`). Additiv → kein Reader bricht.

- [ ] **Step 1:** je View `pg_get_viewdef('public.<view>', true)` lesen (Plugin `execute_sql`, READ).
- [ ] **Step 2:** CREATE OR REPLACE je View mit zusätzlichem `LEFT JOIN public.v_claim_phase vcp ON vcp.claim_id = <claim-id-col>` und `vcp.main_phase`, `vcp.sub_phase` in der SELECT-Liste. `aktuelle_phase = c.phase` **bleibt** vorerst. Precision-Casts der bestehenden Spalten 1:1 erhalten (SP-G-Lesson: CREATE OR REPLACE darf Spaltentypen nicht ändern).
- [ ] **Step 3:** als **eine** Plugin-Migration `cmm44_mp6b_views_add_main_sub_phase` anwenden → `list_migrations` → File `<V>_cmm44_mp6b_views_add_main_sub_phase.sql` benennen + committen.
- [ ] **Step 4:** verify `execute_sql` (READ): `SELECT main_phase, sub_phase FROM v_claim_listing LIMIT 1` je View liefert Werte.
- [ ] **Step 5:** PR `--base staging`; nach Merge+Deploy kurzer Smoke (Listen/Kanban rendern unverändert, da Reader noch `aktuelle_phase` nutzen).

---

## Sub-Projekt 6a — Reader migrieren (einzeln, subagent-driven)

Pro Reader ein Task: von `aktuelle_phase`/`claims.phase` auf `v_claim_phase` `main_phase`/`sub_phase`. Guards `toClaimMainPhase`/`toClaimSubPhase` aus `src/lib/claims/lifecycle.ts` nutzen (casten rohen string sicher). Reihenfolge: erst die **Logik-Rewrites** (höchstes Risiko), dann die Read-Swaps. Jeder Task: Edit → voller `npm run build` (Route betroffen) → Route-Smoke → Re-Grep → Commit. Eigener PR (oder gebündelt nach Review).

**Reader-Liste (aus Spec §1c):**
1. `src/app/kanzlei/kanban/page.tsx` + `mandate/page.tsx` — **Logik-Rewrite:** gruppiert heute nach erster Ziffer von `aktuelle_phase` (`"3_…"`); neu nach `main_phase` (4 Werte) von `v_claim_phase`.
2. `src/app/api/cron/pflichtdokumente-reminder/route.ts:33-46` — **Logik-Rewrite:** selektiert/filtert `aktuelle_phase` als `Phase`-Enum; neu: Substate aus `v_claim_phase.sub_phase` (Mapping der Pflichtdok-Regeln auf die 9 Substates; falls die Cron-Regeln noch System-A-Phasen erwarten → eigenes Mini-Mapping, im Task dokumentieren).
3. `src/app/admin/faelle/(hub)/page.tsx:282` — `aktuelle_phase: suppClaim?.phase` → `sub_phase` aus `v_claim_phase`-Embed; `FaelleKanban` rendert eh über `buildClaimPhasePipeline` (4-Phasen), nur den Feed kappen.
4. `src/lib/claims/get-kunde-faelle.ts:583` — `aktuelle_phase: c.phase` → `sub_phase`.
5. `src/lib/fall/queries.ts:39` — Select `aktuelle_phase` → `main_phase, sub_phase`.
6. `src/lib/makler/queries.ts` (263/336/505/576/613) + `src/lib/makler/copilot-prompt.ts:199` — View-Read → `sub_phase`.
7. `src/app/gutachter/fall/[id]/FallDetailClient.tsx:237` — Passthrough; Quelle auf `sub_phase` umstellen (Panel nutzt eh `lifecycle`).
8. `src/lib/faelle/claim-duplicate-columns.ts:246` — Dup-Map-Eintrag `aktuelle_phase: 'phase'` entfernen (erst in 6c, wenn die Spalte weg ist).

- [ ] Pro Reader: implementieren, `npm run build` grün, Route-Smoke, `git grep -n "aktuelle_phase" -- <datei>` leer, commit.
- [ ] Nach allen: `git grep -n "aktuelle_phase|claims.*\.phase" -- src/` → nur noch die bewusst in 6c zu droppenden Stellen (claim-duplicate-columns Map + ggf. dev/phases) übrig.

---

## Sub-Projekt 6c — Drop (gated: erst nach 6a+6b live + Reader-Re-Grep leer)

- [ ] **Step 1:** `pg_depend`-Check auf `claims.phase` + Re-Grep `aktuelle_phase`/`claims.phase` (DB-Objekte + Code) → muss leer sein (außer den Views, die in dieser Migration mit-repointed werden).
- [ ] **Step 2:** Views final repointen: `aktuelle_phase`-Spalte aus den 5 Views entfernen (CREATE OR REPLACE; `main_phase`/`sub_phase` bleiben aus 6b).
- [ ] **Step 3:** Plugin-Migration `cmm44_mp6c_drop_claims_phase` mit der DROP-DDL aus Spec §3:
```sql
drop trigger if exists trg_claims_set_phase on public.claims;
drop trigger if exists trg_gutachten_refresh_phase on public.gutachten;
drop trigger if exists trg_repairs_refresh_phase on public.repairs;
drop function if exists public.trg_fn_set_claims_phase();
drop function if exists public.trg_fn_refresh_claim_phase_from_gutachten();
drop function if exists public.trg_fn_refresh_claim_phase_from_repairs();
drop function if exists public.trg_fn_refresh_claim_phase_from_payments();
drop function if exists public.map_claim_phase_to_faelle_phase();
drop function if exists public.calc_claims_phase(uuid, text, uuid);
alter table public.claims drop column phase;
```
- [ ] **Step 4:** `list_migrations` → File `<V>_cmm44_mp6c_drop_claims_phase.sql` benennen + committen. `claim-duplicate-columns.ts:246`-Map-Eintrag entfernen. Types via `generate_typescript_types` regenerieren (claims-Row hat `phase` nicht mehr).
- [ ] **Step 5:** voller `npm run build` grün; **Post-Drop-Smoke ALLER Portale** (Public+Admin+Kunde+SV+Makler+Kanzlei) mit Screenshots (Post-Drop-Smoke-Pflicht).
- [ ] **Step 6:** PR `--base staging`.

---

## Gates / Risiken (aus Spec §6)
- A+B (6a+6b) **müssen** live sein, bevor 6c. C = irreversibler Prod-DROP → erst `pg_depend` + Re-Grep sauber.
- Twin-Drift: Plugin-recorded Version ablesen + File danach benennen.
- ManualPhaseOverride-Stub: separat in **6a** entfernen (Spec §5.1, Decision B) — kein Blocker, Neubau = MP-7.
- `pflichtdokumente`-Cron + Kanzlei-Kanban sind echte Logik-Rewrites → eigene Verifikation, nicht nur Rename.

## Self-Review
- Spec-Coverage: Writer-Drop (6c §3), 5 Views (6b add + 6c repoint), alle §1c-Reader (6a), beide Decisions (§5.1 Stub-Drop in 6a, §5.2 Hard-Cut-Sequenz 6b→6a→6c). ✓
- Placeholder: Drop-DDL exakt; per-Reader-Code wird vom Implementer-Subagent beim Ausführen aus der jeweiligen Datei codifiziert (Sweep-Granularität). View-DDL aus `pg_get_viewdef` zur Laufzeit (additiv, Pattern fix). ✓
- Reihenfolge-Konsistenz: 6b add → 6a migrate → 6c drop; `aktuelle_phase` lebt bis 6c. ✓
