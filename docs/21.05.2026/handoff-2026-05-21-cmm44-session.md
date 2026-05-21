# Handoff — CMM-44 Session 2026-05-21 (SP-G2 + SP-D geliefert, SP-C1 startklar)

**Für die nächste Session.** Master: CMM-44 = `faelle`-Vollmigration / `DROP TABLE faelle` (Phase 6). Strategie: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`; Spalten-Mapping + Sub-Projekt-Strecke: `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` §4.

---

## 1 · Was diese Session geliefert hat

### SP-G2 — `gutachter_termine.claim_id` faelle-entkoppelt — **KOMPLETT, auf main**
PR1 #1521 (Writer setzen claim_id) + PR2 #1525 (DROP CMM-58-Ableitungs-Trigger, RAISE-Validierungs-Trigger `OF fall_id, claim_id`, Re-Key `v_faelle_mit_aktuellem_termin` + `v_claim_timeline`). Invertiertes Gating (PR1 prod-live VOR PR2-Migration). Memory: `project_cmm44_spg2_status`.

### SP-D — 25 Termin-Spalten faelle→`gutachter_termine` (1:N aktuellster Termin) — **KOMPLETT, auf main**
PR1 #1526 (23 ADD + Backfill) · View-Repoint #1528 (4 Views auf gt, +Block-0-ALTER 3 Numeric-Precisions) · Code-Sweep #1529 (56 Sites: 37 A + 7 B Reads, 12 C Writes) · Abschluss #1531 (Smoke) · PR3 #1533 (COALESCE-Catch-up). 2 DUP (`geschaetzte_fahrzeit_min`→`geschaetzte_fahrtzeit_min`, `gcal_event_id`→`google_event_id`) via View. besichtigungsort claim-level → gt mit gt-else-faelle-Write-Fallback. Memory: `project_cmm44_spd_status`.

### SP-C — gestartet, **SP-C1 startklar (Spec + Plan committed + gepusht)**
SP-C (33 Parteien-Snapshots → `claim_parties`) **nach Rolle gesplittet** (Aaron):
- **SP-C1** = 7 `kunde_*`-Snapshot-Felder → `claim_parties` rolle=`geschaedigter` (45 Zeilen + Zielspalten existieren → **Reader/Writer-Switch + COALESCE-Backfill, KEIN ADD**, 1:1). **← als nächstes ausführen.**
- **SP-C2** (offen) = `gegner_*` (10) → rolle=`verursacher` (**0 Zeilen — müssen erzeugt werden**, Row-Creation im Backfill).
- **SP-C3** (offen) = `halter_*` (9) → Partei mit `ist_halter=true` (kein `halter`-Rolle-Enum; cov 0 → evtl. keine Daten).

Branch `kitta/cmm-44-spc1-kunde-geschaedigter` (gepusht):
- Spec: `docs/superpowers/specs/2026-05-21-cmm44-spc1-kunde-geschaedigter-design.md`
- Plan: `docs/superpowers/plans/2026-05-21-cmm44-spc1-kunde-geschaedigter.md` (7 Tasks, subagent-driven)

---

## 2 · SP-C1 — so geht's weiter (nächste Session)

**Status:** Brainstorm + Spec + Plan **fertig & von Aaron approved**. Nächster Schritt = **Ausführung** (subagent-driven, wie SP-D/SP-G2).

1. **Worktree:** in `.claude/worktrees/cmm-44-spd` auf Branch `kitta/cmm-44-spc1-kunde-geschaedigter` (oder frischen Worktree off `origin/staging`). `.env.local` + `supabase/.temp/` müssen drin sein (gitignored — kopieren falls neuer Worktree).
2. **Task 0** (Plan): `scripts/cmm44-spc1-measure.sql` schreiben + fahren (erwartet faelle_kunde_cols=7, cp_target_cols=6, geschaedigter_rows≈45, claims_ohne_geschaedigter notieren).
3. **PR1** (Task 1-2): Backfill-Migration (COALESCE `faelle.kunde_*`→cp geschaedigter, **kein ADD**) + View-Repoint falls Audit-Treffer. Apply + repair. **Keine Types-Regen** (kein Schema-Change).
4. **PR2** (Task 3-5): Reader/Writer-Sweep (`scripts/cmm44-spc1-grep.mjs`, 7 Cols) → cp geschaedigter, Property-Rename `kunde_X`→cp-Spalte, **bestehende profile/lead-Fallbacks erhalten**. Smoke.
5. **PR3** (Task 6): COALESCE-Catch-up. **Abschluss** (Task 7): Phase-1-Mapping + Handoff + Memory `project_cmm44_spc_status`.

**Bestehendes Muster nutzen:** `src/lib/claims/kunde-ownership.ts` + `get-kunde-faelle.ts` lesen schon die geschaedigter-Partei (`.eq('rolle','geschaedigter')`).

---

## 3 · Branch/PR-Stand (Git)
- `origin/main` + `origin/staging`: enthalten SP-G2 (#1521/#1525) + SP-D (#1526/#1528/#1529/#1531/#1533) — alle gemergt.
- `kitta/cmm-44-spc1-kunde-geschaedigter` (gepusht): SP-C1 Spec + Plan, **noch kein Code/Migration**.
- Worktrees: `.claude/worktrees/cmm-44-spd` (aktuell auf SP-C1-Branch), `.claude/worktrees/cmm-44-spg2-pr1` (SP-G2, fertig). Alte persistente Stashes (lp-geocoding etc.) sind **fremd** (andere Sessions), nicht anfassen.
- **Offene PRs:** keine von dieser Session (alle SP-G2/SP-D gemergt; SP-C1 hat noch keinen Code-PR).

## 4 · Wiederkehrende Lessons (für die nächste Session)
1. **Subagent-Output IMMER empirisch prüfen** — nie dem Report trauen. Diese Session: ein Subagent brach per Socket-Error ab (Migration uncommitted + dry-run-failing); einer confabulierte „prior sessions"; einer überzählte „remaining" grep-Hits (False Positives: Spaltenname im NEUEN cp/gt-Query nahe der bereinigten faelle-Query). Prüfe: `git status`/untracked, `tsc`, präziser `.select/.update`-Payload-Check, Spot-Checks.
2. **ADD-COLUMN: Quell-Precision messen** (`numeric_precision/scale`, nicht nur `udt_name`) — sonst 42P16 beim View-Repoint (SP-D PR1 hatte plain `numeric` statt `numeric(10,7)`).
3. **Specs/Pläne PUSHEN** für Aaron-Review ([[feedback_push_specs_for_review]]) — im Worktree committet ≠ für ihn sichtbar.
4. **db query** gibt bei Multi-Statement nur das letzte Resultset → Measure/Verify als ein UNION-ALL.
5. **Invertiertes Gating bei destruktiven Migrationen** (Trigger-Drop): Code zuerst prod-live, DANN Migration (geteilte DB, AAR-599-Klasse). Additive ADDs brauchen kein Gating.
6. **React #418 auf Fallakte `/faelle/[id]`** ist ein pre-existing, harmloser Hydration-Recovery (Seite rendert voll) — taucht in jedem Smoke auf, NICHT als neuer Fehler werten.
7. **Aaron mergt selbst** ([[feedback_kein_auto_merge]]); PR erst nach Review öffnen; `--base staging`; Smoke gegen `app.staging.claimondo.de` nach Merge.

## 5 · CMM-44 Reststrecke (nach SP-C1)
SP-C2 (gegner→verursacher, Row-Create) · SP-C3 (halter→ist_halter) · `kunde_id`→`claims.geschaedigter_user_id` (FK-Sweep, separat) · SP-E (Fahrzeug→vehicles) · SP-F (Vorschäden/Cardentity) · SP-I (Kanzleifall-LC) · SP-J (Abrechnung) · SP-K/L · dann **Phase 6 `DROP TABLE faelle`**. Reihenfolge/Abhängigkeiten: Phase-1-Doc §4.

---
🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
