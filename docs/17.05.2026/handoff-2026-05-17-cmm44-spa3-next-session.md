# Handoff — Nächste Session (CMM-44 Claim-as-SSoT, Stand 2026-05-17 nach SP-A2)

**Master:** CMM-44 (`faelle`-Tabelle wird abgeschafft, `claims` ist SSoT)
**Memory zuerst lesen:** [[project_cmm44_spa2_status]], [[project_cmm44_faelle_dekomposition]],
[[feedback_information_schema_check]], [[feedback_migration_repair_twin_drift]]

---

## 1 · Was diese Session erledigt hat

**SP-A2 vollständig abgeschlossen** — 28 semantik-gleiche Duplikat-Spalten von `faelle`
entfernt, `claims` ist für diese Felder jetzt alleinige Quelle.

| PR | Inhalt | Stand |
|---|---|---|
| #1417/#1418/#1419 | PR1a/b/c — Reader-Rename der 28 Spalten | auf `main`/prod |
| **#1426** | **PR2 — Backfill + View-Repoint + `DROP COLUMN ×28`** | **gemergt auf `staging`** |

PR2 = Migration `20260517141457_cmm44_spa2_drop_28_semantik_dup_columns.sql`:
23 Gap-Backfill-UPDATEs (claims gewinnt, COALESCE-Kollisionsgruppen) → 4 View-Repoints
→ `DROP TRIGGER faelle_phase_transition_trigger` → `DROP COLUMN ×28`. Appliziert via
`db query --linked` + `migration repair --status applied`. `information_schema`-Verify:
0 der 28 Spalten auf `faelle`. Portal-Smoke 5 Portale: 25 OK / 3 WARN / 0 HARD-FAIL
(`docs/17.05.2026/cmm44-spa2-smoke-pr2.md`).

**Bewährtes Vorgehen für die DB-Drops** (lief in SP-A2 sauber, für SP-B..J wiederverwenden):
1. Live-DB messen (`information_schema` + `format_type` für exakte Typen).
2. Dependency-Audit: `pg_depend` (Views) + `pg_trigger` (DB-weit, nicht nur auf `faelle`!)
   + `pg_proc.prosrc`-Textscan. View-Repoints deterministisch generieren — siehe
   `scripts/_build-spa2-views.mjs` als Vorlage (liest `pg_get_viewdef`, casted jede
   repointete Spalte auf den Quell-Typ, sonst scheitert `CREATE OR REPLACE VIEW`).
3. Migration in `BEGIN/COMMIT`; vor dem Apply Dry-Run `BEGIN; … ROLLBACK;`.
4. Apply via `db query --linked` + `migration repair`, **kein** `db push`.
5. Types-Regen (`src/lib/supabase/database.types.ts`) + Build + Portal-Smoke.

---

## 2 · Direkt-Anschluss: SP-A3 — `fall_nummer` → `claims.claim_nummer`

In der SP-A2-Plan-Inventur aus SP-A2 ausgegliedert: **kein** simpler Reader-Rename.

- ~198 Files referenzieren `fall_nummer`.
- Nummern-Generator: `admin/faelle/anlegen/actions.ts` baut `CLM-${datum}-${seq}`;
  zusätzlich DB-Trigger `set_fall_nummer` (BEFORE INSERT, `WHEN new.fall_nummer IS NULL`,
  → Funktion `generate_fall_nummer()`).
- `fall_nummer` ist teilmigriert (Backfill-Stand in der Live-DB prüfen).
- `claims.claim_nummer` existiert bereits, divergiert aber von `fall_nummer` (Probe
  2026-05-17: `diverge=30`) — vor jeder Migration Semantik klären: ist `claim_nummer`
  schon kanonisch, oder muss `fall_nummer` der SSoT-Wert sein?

→ **Eigener Brainstorm→Spec→Plan-Zyklus.** Es ist „Legacy-Fallnummern-Schema abschaffen +
Generator umziehen", nicht ein Spalten-Drop. brainstorming-Skill nutzen.

---

## 3 · Danach: die restliche CMM-44-Strecke

Aus `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` §4:

- **SP-B** — 64 CLAIMS-Spalten (claim-globale Eigenschaften, ADD auf claims).
- **SP-C** — 33 Parteien-Snapshots → `claim_parties`. Enthält `gegner_anzahl_beteiligte`
  (in SP-A2 als kein echtes DUP erkannt → Count über `claim_parties`, voraussichtlich
  ersatzlos droppen).
- **SP-G** — 19 Gutachten-Rest-Spalten → `gutachten`. **SP-G2** — `gutachter_termine.claim_id`-FK.
- **SP-H** — 18 Auftrag-LC-Spalten → `auftraege`. **SP-J** — 12 Abrechnungs-Spalten.

---

## 4 · Lose Enden (klein, kein CMM-44-Scope)

- **Admin-Stammdaten-Schadensdatum-Feld leer** — `claimStammdatenFallback` in
  `src/app/faelle/[id]/page.tsx` selektiert kein `schadentag`. Vorbestehender Bug, Mini-Fix.
- **Verwaiste Funktions-Stubs** (CMM-44-Cleanup-Backlog): `log_phase_transition`,
  `trg_fn_sync_claims_to_faelle`, `trg_fn_sync_kanzlei_paket_to_faelle`,
  `map_claim_phase_to_faelle_phase` — referenzieren teils gedroppte `faelle`-Spalten,
  aber von KEINEM Trigger gerufen (verifiziert) → harmlos, irgendwann `DROP FUNCTION`.
- **View-Alias-Tech-Debt** — die 4 in SP-A2 repointeten Views (`faelle_kunde_view`,
  `faelle_sv_view`, `v_claim_full`, `v_faelle_mit_aktuellem_termin`) führen die alten
  faelle-Spaltennamen noch als interne Aliase. Auflösen im View-Cleanup SP-K/SP-L.

---

## 5 · Worktree / Branch dieser Session

Branch `kitta/cmm-44-spa2-pr2` ist gemergt (PR #1426). Worktree unter
`.claude/worktrees/cmm-44-spa2-pr2/` kann mit `git worktree remove` aufgeräumt werden.
SP-A2-Artefakte: `scripts/_build-spa2-views.mjs`, `scripts/probe-cmm44-spa2-deps.sql`,
`scripts/smoke-cmm44-spa2-pr2.mjs`, `docs/17.05.2026/cmm44-spa2-*`.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
