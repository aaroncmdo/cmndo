# Payment-Ledger — v_claim_base Centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline recommended for this delicate single-root-view work) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface all three payment parties (vs/kunde/sv) from the `claim_payments` ledger centrally at the root view `v_claim_base`, so every child view inherits the ledger-backed values instead of reading scattered caches / hardcoded NULL.

**Architecture:** `v_claim_base` is `SELECT <~300 cols> FROM ( <inner: FROM claims c + 18 joins> ) sub WHERE claim_sichtbar_fuer_aktuellen_user(id)`. We add **one** `LEFT JOIN v_claim_payments p ON p.claim_id = sub.id` at the OUTER layer (the pivot is 1-row-per-claim, so it can neither multiply nor drop rows), then (a) COALESCE the existing live money fields `regulierung_betrag` / `auszahlung_gutachter_*` onto the ledger (Ist-first) — children inherit automatically via their `base.<field>` passthroughs, zero child edits; and (b) append the previously-homeless `auszahlung_kunde_*` as new columns — children that expose it are then repointed to `base.auszahlung_kunde_*`.

**Tech Stack:** Postgres (Supabase), DDL exclusively via `apply_migration` (Regel 2). Verification via `execute_sql` (READ). Golden regression via `npx vitest`.

## Global Constraints

- **Regel 2:** ALL DDL via `mcp__plugin_supabase_supabase__apply_migration` — NEVER CLI `db push` / raw `execute_sql` DDL. After each apply: read the recorded version (`select version from supabase_migrations.schema_migrations where name='<name>' order by version desc limit 1`) and commit the migration file named EXACTLY `supabase/migrations/<recorded-version>_<name>.sql` (no Twin-Drift).
- **Regel 3:** One logical change = one PR against `staging`. No unaccompanied stash at session end.
- **CREATE OR REPLACE safety:** existing columns keep IDENTICAL name + type + ordinal position; expression bodies may change; new columns only APPENDED at the end. Signature-check (before == after for existing, +2 appended) is the safety net — data-snapshot is impossible (auth-gated views return 0 rows to service-role).
- **Money correctness (locked with Aaron 2026-07-07):** `regulierung_betrag` = **Ist-first** `COALESCE(p.vs_ist, p.vs_soll, <cache>)`. Verified behavior-neutral: the one populated claim has `p.vs_ist == cache (5000.00)`.
- **Views stay DEFINER** (owner postgres, `security_invoker` NOT set). `REVOKE anon` invariants unchanged (we edit existing views, not create new ones — but re-verify anyway).
- **Prod-DB:** `paizkjajbuxxksdoycev`.
- SQL/commit text may be ASCII (backend). No user-facing strings in this change.

## File / Object map

- Object: `public.v_claim_base` (root view, ~300 cols → +2) — Task 1
- Object: `public.v_faelle_mit_aktuellem_termin` (339 cols, Admin/KB) — Task 2
- Object: `public.faelle_kunde_view` (40 cols, Kunde-Portal) — Task 3 (consistency)
- Migrations: `supabase/migrations/<V1>_v_claim_base_ledger_central.sql`, `<V2>_v_faelle_termin_auszahlung_kunde_from_base.sql`, `<V3>_faelle_kunde_view_read_base.sql`
- Marker: `memory/COORDINATION-payment-ledger-normalisierung.md`

**Out of scope (explicit follow-ups):** Code-reader migration (`fall-finanzen.ts`, `autoPhase.ts`, `eligibility.ts`, `subphase-resolver.ts` → `getClaimPayments`) = Schritt C. Backfill Ledger←Cache + cache-drop = Phase 3. `empfaenger`-Schema-Drop + dead-code = Phase 4.

---

### Task 0: Isolated worktree + stacked branch

**Files:** none (git setup)

- [ ] **Step 1:** Create fresh worktree off the parent stack branch (avoids fattening PR #3778 and the aar-956 branch-collision):

```
node scripts/new-session-worktree.mjs payment-ledger-phase2b-vclaimbase
# OR, if the script does not base on the right ref:
git worktree add -b kitta/payment-ledger-phase2b-vclaimbase \
  "<repo>/.claude/worktrees/payment-ledger-phase2b" origin/kitta/payment-ledger-phase2
```

- [ ] **Step 2:** Confirm base + clean tree: `git -C <wt> log --oneline -1` shows `a4dda7c41` (handoff commit) as ancestor; `git -C <wt> status` clean. Move this plan file into `<wt>/docs/superpowers/plans/`.

---

### Task 1: Rewrite `v_claim_base` — ledger-central (all 3 parties)

**Files:**
- Modify (DDL): `public.v_claim_base`
- Create: `supabase/migrations/<V1>_v_claim_base_ledger_central.sql`

**Interfaces:**
- Consumes: `v_claim_payments` (columns `claim_id, vs_ist, vs_soll, sv_ist, sv_am, kunde_ist, kunde_am`; 1 row per claim; invoker; anon revoked).
- Produces: `v_claim_base.regulierung_betrag` (numeric(10,2), Ist-first ledger), `.auszahlung_gutachter_betrag` (numeric, ledger-COALESCE), `.auszahlung_gutachter_eingegangen_am` (timestamptz, ledger-COALESCE), and NEW `.auszahlung_kunde_betrag` (numeric(10,2)), `.auszahlung_kunde_eingegangen_am` (timestamptz) — read by children as `base.<field>`.

- [ ] **Step 1: Capture the signature BEFORE (safety net)**

```sql
select column_name, data_type, ordinal_position from information_schema.columns
 where table_schema='public' and table_name='v_claim_base' order by ordinal_position;
```
Record the row count N and the full list. Expect N ≈ 300.

- [ ] **Step 2: Fetch the full def** (32,366 chars — will save to a file; slice with python `read()[A:B]` or fetch in halves `substring(def,1,16000)` + `substring(def,16001,17000)`):

```sql
select pg_get_viewdef('v_claim_base'::regclass, true);
```

- [ ] **Step 3: Apply the 5 surgical edits** to the fetched def (assert each OLD substring matches EXACTLY once before replacing):

**R1 — regulierung_betrag CASE (outer), the THEN branch only:**
```
OLD:  WHEN rolle_sieht_regulierung() THEN regulierung_betrag
NEW:  WHEN rolle_sieht_regulierung() THEN COALESCE(p.vs_ist, p.vs_soll, regulierung_betrag)
```
(The surrounding `CASE … ELSE NULL::numeric END::numeric(10,2) AS regulierung_betrag` is unchanged → column type stays numeric(10,2).)

**R2 — auszahlung_gutachter_betrag passthrough (outer, bare form with leading newline+indent+trailing comma; the inner occurrence is `c.auszahlung_gutachter_betrag` and must NOT match):**
```
OLD:  \n    auszahlung_gutachter_betrag,
NEW:  \n    COALESCE(p.sv_ist, auszahlung_gutachter_betrag) AS auszahlung_gutachter_betrag,
```
(COALESCE(numeric, numeric) = numeric → type unchanged. NO ::numeric(10,2).)

**R3 — auszahlung_gutachter_eingegangen_am passthrough (outer):**
```
OLD:  \n    auszahlung_gutachter_eingegangen_am,
NEW:  \n    COALESCE(p.sv_am, auszahlung_gutachter_eingegangen_am) AS auszahlung_gutachter_eingegangen_am,
```

**R4 — append the 2 new kunde columns at the END of the OUTER select list, immediately before the outer `FROM (` (identify the outer FROM as the one whose subquery closes with `) sub` before `WHERE claim_sichtbar_fuer_aktuellen_user(id)`):**
```
Insert before the outer FROM:
    ,
    p.kunde_ist::numeric(10,2) AS auszahlung_kunde_betrag,
    p.kunde_am AS auszahlung_kunde_eingegangen_am
```
(Appending only ADDS ordinal positions; existing columns keep their positions.)

**R5 — add the pivot join at the outer level (unique anchor):**
```
OLD:  ) sub\n  WHERE claim_sichtbar_fuer_aktuellen_user(id)
NEW:  ) sub\n     LEFT JOIN v_claim_payments p ON p.claim_id = sub.id\n  WHERE claim_sichtbar_fuer_aktuellen_user(id)
```

- [ ] **Step 4: Apply via migration**

```
apply_migration({ name: 'v_claim_base_ledger_central',
  query: 'CREATE OR REPLACE VIEW public.v_claim_base AS <edited-def>;' })
```

- [ ] **Step 5: Verify signature AFTER == BEFORE + 2 appended**

```sql
select column_name, data_type, ordinal_position from information_schema.columns
 where table_schema='public' and table_name='v_claim_base' order by ordinal_position;
```
Expected: the first N rows byte-identical to Step 1 (names + types + positions), plus exactly 2 new at N+1/N+2: `auszahlung_kunde_betrag` numeric(10,2), `auszahlung_kunde_eingegangen_am` timestamptz. **If any existing column shifted/retyped → ABORT + revert.**

- [ ] **Step 6: Verify def + security + no anon-leak**

```sql
select
  (pg_get_viewdef('v_claim_base'::regclass) ~* 'join v_claim_payments p') as has_join,
  (pg_get_viewdef('v_claim_base'::regclass) ~* 'COALESCE\(p\.vs_ist') as reg_ist_first,
  (pg_get_viewdef('v_claim_base'::regclass) ~* 'COALESCE\(p\.sv_ist') as gutachter_ledger,
  (pg_get_viewdef('v_claim_base'::regclass) ~* 'p\.kunde_ist') as kunde_surfaced,
  coalesce((select 'security_invoker=true'=any(reloptions) from pg_class
     where relname='v_claim_base' and relnamespace='public'::regnamespace),false)=false as still_definer,
  has_table_privilege('anon','public.v_claim_base','SELECT') as anon_select;
```
Expected: all true EXCEPT `anon_select=false`.

- [ ] **Step 7: Data-equivalence for the one populated claim** (prove no flip):

```sql
select (select 'security_invoker=true'=any(reloptions) from pg_class where relname='v_claim_payments' and relnamespace='public'::regnamespace) as pivot_invoker_sane,
       p.vs_ist, p.kunde_ist, p.sv_ist
from v_claim_payments p where p.claim_id='afb349eb-5681-4b01-ac40-b5431cf88e80';
```
Expected: `vs_ist=5000.00`, kunde_ist/sv_ist NULL. (Ist-first COALESCE → regulierung_betrag surfaces 5000.00 = old cache value.)

- [ ] **Step 8: Commit migration file (Regel 2 step 3+4)**

```
# read recorded version <V1>, write supabase/migrations/<V1>_v_claim_base_ledger_central.sql with the exact applied DDL
git add supabase/migrations/<V1>_v_claim_base_ledger_central.sql
git commit -m "feat(payment): v_claim_base surft vs/kunde/sv aus dem Ledger (Ist-first COALESCE + auszahlung_kunde central)"
```

---

### Task 2: Repoint `v_faelle_mit_aktuellem_termin` → `base.auszahlung_kunde_*`

**Files:**
- Modify (DDL): `public.v_faelle_mit_aktuellem_termin`
- Create: `supabase/migrations/<V2>_v_faelle_termin_auszahlung_kunde_from_base.sql`

**Interfaces:** Consumes `v_claim_base.auszahlung_kunde_betrag` / `_eingegangen_am` (produced Task 1) via its `base` alias. `regulierung_betrag` / `auszahlung_gutachter_*` need NO edit here — inherited as `base.<field>` passthroughs (Task 1 changed base's value).

- [ ] **Step 1: Signature BEFORE** (expect 339): same query as Task 1 Step 1 with `table_name='v_faelle_mit_aktuellem_termin'`.

- [ ] **Step 2: Fetch def** (9,058 chars, inline OK): `select pg_get_viewdef('v_faelle_mit_aktuellem_termin'::regclass, true);` — confirm exact current expressions for the two kunde columns.

- [ ] **Step 3: Two edits** (assert 1 match each):
```
OLD:  NULL::numeric(10,2) AS auszahlung_kunde_betrag
NEW:  base.auszahlung_kunde_betrag AS auszahlung_kunde_betrag

OLD:  NULL::timestamp with time zone AS auszahlung_kunde_eingegangen_am
NEW:  base.auszahlung_kunde_eingegangen_am AS auszahlung_kunde_eingegangen_am
```
(Confirm the OLD strings against the fetched def; adjust to the exact rendered form. base's columns are numeric(10,2)/timestamptz → type-identical, position unchanged.)

- [ ] **Step 4: apply_migration** `CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS <edited>;`

- [ ] **Step 5: Verify** signature 339==339 identical; `pg_get_viewdef ~* 'base.auszahlung_kunde_betrag'` true, `~* 'NULL::numeric\(10,2\) AS auszahlung_kunde_betrag'` false; still_definer true; anon_select false.

- [ ] **Step 6: Commit** `supabase/migrations/<V2>_..._from_base.sql`.

---

### Task 3: Repoint `faelle_kunde_view` → `base.auszahlung_kunde_*` (consistency / single-mechanism)

> Optional-but-recommended: `faelle_kunde_view` already works (own pivot join, commit `fbbc969ae`). Repointing it to `base` gives a single mechanism (everything reads `base`) and drops its now-redundant pivot join. Skip only if minimizing churn.

**Files:**
- Modify (DDL): `public.faelle_kunde_view`
- Create: `supabase/migrations/<V3>_faelle_kunde_view_read_base.sql`

- [ ] **Step 1: Signature BEFORE** (expect 40). Fetch def; locate its `LEFT JOIN v_claim_payments p …` + `p.kunde_ist::… AS auszahlung_kunde_betrag` + `p.kunde_am::… AS auszahlung_kunde_eingegangen_am`.

- [ ] **Step 2: Edits** — replace the two `p.kunde_*` expressions with `base.auszahlung_kunde_betrag` / `base.auszahlung_kunde_eingegangen_am`, and remove the redundant `LEFT JOIN v_claim_payments p ON …` line. (Confirm `base` is faelle_kunde_view's v_claim_base alias in the fetched def; adjust if different.)

- [ ] **Step 3: apply_migration** `CREATE OR REPLACE VIEW public.faelle_kunde_view AS <edited>;`

- [ ] **Step 4: Verify** signature 40==40; `~* 'base.auszahlung_kunde_betrag'` true; `~* 'join v_claim_payments'` **false** (join removed); still_definer true; anon_select false.

- [ ] **Step 5: Commit** `supabase/migrations/<V3>_faelle_kunde_view_read_base.sql`.

---

### Task 4: Regression + wrap-up

**Files:** `memory/COORDINATION-payment-ledger-normalisierung.md`

- [ ] **Step 1: Golden/regression tests** (in the worktree):
```
npx vitest run src/lib/finance src/lib/abrechnung src/lib/fall
```
Expected: all green, byte-identical fakturierte Beträge (ledger empty → COALESCE falls to cache everywhere; auszahlung_kunde still NULL because 0 kunde-ledger-rows). If `subphase-resolver.test.ts` changes: it should NOT (Phase-8 kunde-trigger stays false with 0 kunde rows) — investigate any diff before accepting.

- [ ] **Step 2: Types** — regen deferred (no code consumer reads `v_claim_base.auszahlung_kunde_*` yet; Schritt C is the follow-up). If any `npx tsc` consumer breaks: surgical edit of `database.types.ts` (add the 2 Row fields), NOT full regen (shared file).

- [ ] **Step 3: anon-leak audit across the 3 views** (belt-and-suspenders):
```sql
select relname, has_table_privilege('anon',('public.'||relname),'SELECT') as anon
from pg_class where relnamespace='public'::regnamespace
 and relname in ('v_claim_base','v_faelle_mit_aktuellem_termin','faelle_kunde_view');
```
Expected: all `anon=false`.

- [ ] **Step 4: Update marker** `COORDINATION-payment-ledger-normalisierung.md` (Phase-2b v_claim_base central DONE, migrations `<V1>/<V2>/<V3>`, Ist-first decision, behavior-neutral proof, out-of-scope follow-ups).

- [ ] **Step 5: Push branch + open PR** against `staging` (stacked after #3778). PR body includes the 7-point AGENTS audit + the signature-check evidence + the equivalence proof.

- [ ] **Step 6: Session-close checklist** (Regel 3): `git status` clean, `git stash list` empty, all commits pushed.

## Self-Review

- **Spec coverage:** kunde central (Task 1 R4 + Task 2/3), reg Ist-first (Task 1 R1), gutachter ledger (Task 1 R2/R3), pivot join reusable (Task 1 R5), children inherit reg/gutachter free (no edit — verified passthroughs), verification regime per view (signature + def + security + anon + equivalence), Regel 2/3 discipline. ✅
- **Type consistency:** `p.kunde_ist::numeric(10,2)` matches child declarations; gutachter COALESCE stays bare `numeric`; regulierung stays numeric(10,2) via outer cast. ✅
- **Risk:** all three edits signature-preserving (Task 1 = +2 appended only); behavior-neutral proven for the sole populated claim; DEFINER/anon invariants re-verified per task.
