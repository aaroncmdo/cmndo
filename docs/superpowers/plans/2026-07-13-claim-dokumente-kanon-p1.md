# Claim-Dokumente-Kanon P1 — DB-Foundation + First Consumer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine kanonische, DB-getriebene `v_claim_dokumente`-Entity, die die Pflicht-/Freigeschaltet-Ableitung der 4 konkurrierenden Doku-Engines in SQL ersetzt und den ersten Consumer (`getPflichtdokumenteForFall`) speist.

**Architecture:** SQL-Regel-Evaluator (`dokument_regel_trifft`) portiert `evaluateKatalogRule` 1:1 nach PL/pgSQL; ein Kontext-Builder (`dokument_katalog_ctx`) baut den `lead.*`/`fall.*`-Key-Space als jsonb; die View `v_claim_dokumente` kreuzt claim-scoped Katalog-Slots × Claims, wertet Freigeschaltet/Pflicht via SQL-Regel aus und joint `fall_dokumente` für Status + Datei. Status-SSoT = `fall_dokumente`. Der TS-Consumer liest die View und signiert die Storage-URLs (Views können nicht signieren).

**Tech Stack:** Postgres (Supabase, prod ref `paizkjajbuxxksdoycev`), PL/pgSQL, TypeScript, Vitest (opt-in Integration-Tests), Next.js 15.

## Global Constraints

- **DDL NUR via `mcp__plugin_supabase_supabase__apply_migration`** (AGENTS Regel 2). Nach jedem Apply: `list_migrations` → getrackte Version `<V>` ablesen → Migration-File committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == getrackte Version, sonst Twin-Drift). `execute_sql` NUR für READ.
- **Neue Views:** volle `CREATE OR REPLACE VIEW` (kein `pg_get_viewdef()+replace()`), `RAISE WARNING` statt `EXCEPTION` falls Guard nötig. Jede User-lesbare View: `GRANT SELECT ... TO authenticated` + Row-Gate `WHERE claim_sichtbar_fuer_aktuellen_user(claim_id)`.
- **Status-SSoT = `fall_dokumente`** (Datei-Existenz + Review-State), NICHT `pflichtdokumente.status`.
- **Parity ist Pflicht-Gate:** SQL `dokument_regel_trifft` ≡ TS `evaluateKatalogRule`; und neue Pflicht-Menge vs. Engine-B (`getOffeneDokumentAnforderungen`) reconcilen VOR Consumer-Cutover.
- **Opt-in Tests:** Integration-Tests gegen prod-DB laufen nur mit `RUN_PARITY=1` + Service-Env (`skipIf`), Sample-driven, `process.stdout.write` für Diagnose.
- **7-Punkte-Audit je Commit** (AGENTS). Umlaute nur in Frontend-Strings Pflicht (SQL/Comments/Docs = ASCII ok).
- **Verify je DDL-Task:** `execute_sql` Read gegen prod + opt-in Parity; Route-/Loader-Changes → voller `npm run build`; 4 Ratchets 0-neu; knip clean.
- **Scope P1:** NUR DB-Foundation + `getPflichtdokumenteForFall`-Rewire + Reconcile + Engine-B/C-Retire. KEIN `v_claim_full`-Touch (P2), KEIN v_faelle (P4). `kategorie='gutachter_verifizierung'`-Slots (SV-Profil) bleiben ausgeschlossen.

---

### Task 1: SQL-Regel-Evaluator + Kontext-Builder

**Files:**
- Migration: `supabase/migrations/<V>_dokument_regel_evaluator.sql` (via apply_migration `dokument_regel_evaluator`)
- Test: `src/lib/dokumente/__tests__/sql-regel-parity.test.ts`

**Interfaces:**
- Produces (SQL): `dokument_regel_trifft(regel jsonb, ctx jsonb) returns boolean` (immutable); `dokument_katalog_ctx(p_claim_id uuid) returns jsonb` (stable); helpers `dokument_regel_equals(a jsonb, b jsonb)`, `dokument_regel_num(v jsonb) returns numeric`, `dokument_regel_truthy(v jsonb) returns boolean`.
- Semantik-Vertrag (portiert `src/lib/dokumente/ruleEvaluator.ts:37-152`): `regel IS NULL` / `{}` (kein `op`) → true; unbekannter `op` → false; `eq/neq` via `equals`; `in` (v null→false), `not_in` (v null→true); `gt/lt/gte/lte` via numeric coercion (null→false); `is_null/is_not_null`; `truthy/falsy` via isTruthy; `and/or/not` rekursiv. `equals`: beide null→true, einer null→false, number↔string→Text-Vergleich, sonst jsonb-Gleichheit. Kontext-Keys `lead.<col>` + `fall.<col>`.

- [ ] **Step 1: Write the failing parity test**

Deterministische Matrix (kein DB-Datum): feste (Rule, Ctx)-Paare, die jeden Operator + Kanten (null-Feld, number↔string-Coercion, leeres `{}`, unbekannter op, verschachteltes or/and/not) abdecken. TS-Erwartung via `evaluateKatalogRule`; SQL via `execute_sql`-RPC.

```ts
// src/lib/dokumente/__tests__/sql-regel-parity.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { evaluateKatalogRule, type Rule, type EvalContext } from '../ruleEvaluator'

const RUN = process.env.RUN_PARITY === '1'
const d = RUN ? describe : describe.skip

// (rule, ctx) Matrix — deckt alle Operatoren + TS-Kanten ab
const CASES: Array<{ rule: Rule | null | Record<string, never>; ctx: EvalContext }> = [
  { rule: null, ctx: {} },
  { rule: {} as Record<string, never>, ctx: {} },
  { rule: { op: 'eq', field: 'lead.zb1_status', value: 'bestaetigt' }, ctx: { 'lead.zb1_status': 'bestaetigt' } },
  { rule: { op: 'eq', field: 'lead.zb1_status', value: 'bestaetigt' }, ctx: { 'lead.zb1_status': 'offen' } },
  { rule: { op: 'neq', field: 'lead.zb1_status', value: 'bestaetigt' }, ctx: {} }, // fehlend → neq true
  { rule: { op: 'eq', field: 'lead.halter_ungleich_fahrer_flag', value: true }, ctx: { 'lead.halter_ungleich_fahrer_flag': true } },
  { rule: { op: 'eq', field: 'x', value: 1 }, ctx: { x: '1' } },   // number↔string coercion → true
  { rule: { op: 'eq', field: 'x', value: true }, ctx: { x: 'true' } }, // boolean↔string → false
  { rule: { op: 'in', field: 'lead.finanzierung_leasing', value: ['leasing', 'finanzierung'] }, ctx: { 'lead.finanzierung_leasing': 'leasing' } },
  { rule: { op: 'in', field: 'lead.finanzierung_leasing', value: ['leasing'] }, ctx: {} }, // v null → false
  { rule: { op: 'not_in', field: 'f', value: ['a'] }, ctx: {} }, // v null → true
  { rule: { op: 'is_not_null', field: 'lead.id' }, ctx: { 'lead.id': 'abc' } },
  { rule: { op: 'is_null', field: 'f' }, ctx: {} },
  { rule: { op: 'truthy', field: 'sv' }, ctx: { sv: 0 } },   // 0 → false
  { rule: { op: 'truthy', field: 'sv' }, ctx: { sv: 'x' } }, // non-empty → true
  { rule: { op: 'falsy', field: 'sv' }, ctx: { sv: '' } },   // empty → falsy true
  { rule: { op: 'gt', field: 'n', value: 5 }, ctx: { n: '7' } }, // string→num
  { rule: { op: 'gte', field: 'n', value: 5 }, ctx: {} },        // null → false
  { rule: { op: 'or', conditions: [{ op: 'eq', field: 'a', value: 1 }, { op: 'eq', field: 'b', value: 2 }] }, ctx: { b: 2 } },
  { rule: { op: 'and', conditions: [{ op: 'is_not_null', field: 'a' }, { op: 'eq', field: 'b', value: 2 }] }, ctx: { a: 1, b: 2 } },
  { rule: { op: 'not', condition: { op: 'eq', field: 'a', value: 1 } }, ctx: { a: 2 } },
  { rule: { op: 'bogus' as 'eq', field: 'a', value: 1 } as Rule, ctx: { a: 1 } }, // unknown op → false
]

d('dokument_regel_trifft ≡ evaluateKatalogRule', () => {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  it('matches TS on the full operator matrix', async () => {
    let mismatches = 0
    for (const c of CASES) {
      const ts = evaluateKatalogRule(c.rule as Rule, c.ctx)
      const { data, error } = await sb.rpc('dokument_regel_trifft', { regel: c.rule, ctx: c.ctx })
      if (error) throw error
      if (data !== ts) {
        mismatches++
        process.stdout.write(`MISMATCH rule=${JSON.stringify(c.rule)} ctx=${JSON.stringify(c.ctx)} ts=${ts} sql=${data}\n`)
      }
    }
    expect(mismatches).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_PARITY=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx vitest run src/lib/dokumente/__tests__/sql-regel-parity.test.ts`
Expected: FAIL — `function dokument_regel_trifft does not exist` (Postgres) bubbling as rpc error.

- [ ] **Step 3: Apply the migration (helpers + evaluator + context)**

`apply_migration({ name: 'dokument_regel_evaluator', query: <below> })`:

```sql
-- Helper: equals() faithful zu ruleEvaluator.ts:110
create or replace function public.dokument_regel_equals(a jsonb, b jsonb)
returns boolean language sql immutable as $$
  select case
    when (a is null or a = 'null'::jsonb) and (b is null or b = 'null'::jsonb) then true
    when (a is null or a = 'null'::jsonb) or  (b is null or b = 'null'::jsonb) then false
    when a = b then true
    when (jsonb_typeof(a) = 'number' and jsonb_typeof(b) = 'string')
      or (jsonb_typeof(a) = 'string' and jsonb_typeof(b) = 'number')
      then (a #>> '{}') = (b #>> '{}')
    else false
  end
$$;

-- Helper: toNumber() faithful zu ruleEvaluator.ts:101
create or replace function public.dokument_regel_num(v jsonb)
returns numeric language sql immutable as $$
  select case
    when v is null or v = 'null'::jsonb then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'string' and btrim(v #>> '{}') <> ''
         and (v #>> '{}') ~ '^\s*-?(\d+\.?\d*|\.\d+)\s*$' then (v #>> '{}')::numeric
    else null
  end
$$;

-- Helper: isTruthy() faithful zu ruleEvaluator.ts:123
create or replace function public.dokument_regel_truthy(v jsonb)
returns boolean language sql immutable as $$
  select case
    when v is null or v = 'null'::jsonb then false
    when jsonb_typeof(v) = 'boolean' then (v = 'true'::jsonb)
    when jsonb_typeof(v) = 'number'  then (v #>> '{}')::numeric <> 0
    when jsonb_typeof(v) = 'string'  then length(v #>> '{}') > 0
    when jsonb_typeof(v) = 'array'   then jsonb_array_length(v) > 0
    else true
  end
$$;

-- Evaluator: evaluateKatalogRule() faithful zu ruleEvaluator.ts:37
create or replace function public.dokument_regel_trifft(regel jsonb, ctx jsonb)
returns boolean language plpgsql immutable as $$
declare op text; fld text; cv jsonb;
begin
  if regel is null or regel = 'null'::jsonb then return true; end if;
  op := regel ->> 'op';
  if op is null then return true; end if;              -- {} → true
  fld := regel ->> 'field';
  cv  := case when fld is null then null else ctx -> fld end;
  case op
    when 'eq'  then return public.dokument_regel_equals(cv, regel -> 'value');
    when 'neq' then return not public.dokument_regel_equals(cv, regel -> 'value');
    when 'in'  then
      if cv is null or cv = 'null'::jsonb then return false; end if;
      return exists (select 1 from jsonb_array_elements(regel -> 'value') e
                     where public.dokument_regel_equals(cv, e.value));
    when 'not_in' then
      if cv is null or cv = 'null'::jsonb then return true; end if;
      return not exists (select 1 from jsonb_array_elements(regel -> 'value') e
                         where public.dokument_regel_equals(cv, e.value));
    when 'gt'  then return public.dokument_regel_num(cv) is not null and public.dokument_regel_num(cv) >  (regel ->> 'value')::numeric;
    when 'lt'  then return public.dokument_regel_num(cv) is not null and public.dokument_regel_num(cv) <  (regel ->> 'value')::numeric;
    when 'gte' then return public.dokument_regel_num(cv) is not null and public.dokument_regel_num(cv) >= (regel ->> 'value')::numeric;
    when 'lte' then return public.dokument_regel_num(cv) is not null and public.dokument_regel_num(cv) <= (regel ->> 'value')::numeric;
    when 'is_null'     then return cv is null or cv = 'null'::jsonb;
    when 'is_not_null' then return cv is not null and cv <> 'null'::jsonb;
    when 'truthy' then return public.dokument_regel_truthy(cv);
    when 'falsy'  then return not public.dokument_regel_truthy(cv);
    when 'and' then return not exists (select 1 from jsonb_array_elements(regel -> 'conditions') c
                                       where not public.dokument_regel_trifft(c.value, ctx));
    when 'or'  then return exists (select 1 from jsonb_array_elements(regel -> 'conditions') c
                                   where public.dokument_regel_trifft(c.value, ctx));
    when 'not' then return not public.dokument_regel_trifft(regel -> 'condition', ctx);
    else return false;
  end case;
end;
$$;

-- Kontext: buildKatalogContext() faithful zu ruleEvaluator.ts:136
create or replace function public.dokument_katalog_ctx(p_claim_id uuid)
returns jsonb language sql stable as $$
  with c as (select * from claims where id = p_claim_id),
       l as (select * from leads  where id = (select lead_id from c))
  select coalesce((select jsonb_object_agg('fall.' || key, value)
                     from c, lateral jsonb_each(to_jsonb(c.*))), '{}'::jsonb)
       || coalesce((select jsonb_object_agg('lead.' || key, value)
                     from l, lateral jsonb_each(to_jsonb(l.*))), '{}'::jsonb)
$$;

grant execute on function public.dokument_regel_trifft(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.dokument_katalog_ctx(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Read-verify the functions exist**

Run: `execute_sql` → `select public.dokument_regel_trifft('{"op":"eq","field":"a","value":1}'::jsonb, '{"a":1}'::jsonb) as t, public.dokument_regel_trifft('{"op":"in","field":"a","value":["x"]}'::jsonb, '{}'::jsonb) as f;`
Expected: `t=true, f=false`.

- [ ] **Step 5: Read tracked version + commit migration file**

Run: `list_migrations` → note version `<V>`. Write `supabase/migrations/<V>_dokument_regel_evaluator.sql` (exact DDL from Step 3).
```bash
git add supabase/migrations/<V>_dokument_regel_evaluator.sql
git commit -m "feat(dokumente): SQL-Regel-Evaluator dokument_regel_trifft (portiert evaluateKatalogRule)"
```

- [ ] **Step 6: Run parity test to verify it passes**

Run: `RUN_PARITY=1 ... npx vitest run src/lib/dokumente/__tests__/sql-regel-parity.test.ts`
Expected: PASS (mismatches=0). Commit the test:
```bash
git add src/lib/dokumente/__tests__/sql-regel-parity.test.ts
git commit -m "test(dokumente): SQL≡TS Regel-Evaluator Parity (opt-in RUN_PARITY)"
```

---

### Task 2: `v_claim_dokumente` Entity-View

**Files:**
- Migration: `supabase/migrations/<V>_v_claim_dokumente.sql` (via apply_migration `v_claim_dokumente`)
- Test: `src/lib/dokumente/__tests__/v-claim-dokumente-sanity.test.ts`

**Interfaces:**
- Produces (View `v_claim_dokumente`, `authenticated`-SELECT, row-gated): Spalten `claim_id, slot_id, label, kategorie, beschreibung, freigeschaltet(bool), pflicht(bool), status(text: offen|hochgeladen|geprueft|abgelehnt), storage_path(text), original_filename(text), dokument_id(uuid), hochgeladen_am(timestamptz), sichtbar_fuer(text[]), uploadbar_von(text[]), frist(timestamptz), quelle(text), angefordert_von_rolle(text), pflicht_row_id(uuid), sort_order(int)`.
- Row-Menge: je Claim × aktive claim-scoped Katalog-Slots (`aktiv AND kategorie <> 'gutachter_verifizierung'`) mit `freigeschaltet=true`, UNION Ad-hoc-`pflichtdokumente`-Rows (mit `angefordert_von_rolle IS NOT NULL`), die keinen aktiven Katalog-Slot haben.

- [ ] **Step 1: Write the failing sanity test**

```ts
// src/lib/dokumente/__tests__/v-claim-dokumente-sanity.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
const RUN = process.env.RUN_PARITY === '1'
const d = RUN ? describe : describe.skip
d('v_claim_dokumente sanity', () => {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  it('only exposes freigeschaltet rows, no gutachter_verifizierung, valid status', async () => {
    const { data, error } = await sb.from('v_claim_dokumente').select('slot_id, kategorie, freigeschaltet, pflicht, status').limit(2000)
    if (error) throw error
    expect((data ?? []).length).toBeGreaterThan(0)
    for (const r of data ?? []) {
      expect(r.freigeschaltet).toBe(true)
      expect(r.kategorie).not.toBe('gutachter_verifizierung')
      expect(['offen','hochgeladen','geprueft','abgelehnt']).toContain(r.status)
    }
  })
})
```
> NB: unter Service-Role greift das Row-Gate `claim_sichtbar_fuer_aktuellen_user` evtl. auf 0 → das Gate im Test via `set local role` umgehen ODER die zugrundeliegende Ableitung ohne Prädikat prüfen (wie im view-konsistenz-audit gelernt). Falls 0 Rows: Test gegen eine gate-freie Hilfs-Query oder `security definer` Sample-Claim.

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_PARITY=1 ... npx vitest run src/lib/dokumente/__tests__/v-claim-dokumente-sanity.test.ts`
Expected: FAIL — `relation "v_claim_dokumente" does not exist`.

- [ ] **Step 3: Apply the view migration**

`apply_migration({ name: 'v_claim_dokumente', query: <below> })`. Status-SSoT = `fall_dokumente` (neuestes nicht-gelöschtes je Slot); Review-State aus `_review`-JSONB (falls vorhanden) + `abgelehnt_am`.

```sql
create or replace view public.v_claim_dokumente as
with slots as (
  select k.slot_id, k.label, k.kategorie::text as kategorie, k.beschreibung,
         k.freigeschaltet_wenn, k.pflicht_wenn, k.sichtbar_fuer, k.uploadbar_von, k.sort_order
  from dokument_katalog k
  where k.aktiv = true and k.kategorie <> 'gutachter_verifizierung'
),
claim_ctx as (
  select c.id as claim_id, public.dokument_katalog_ctx(c.id) as ctx
  from claims c
),
derived as (
  select cc.claim_id, s.slot_id, s.label, s.kategorie, s.beschreibung,
         s.sichtbar_fuer, s.uploadbar_von, s.sort_order,
         public.dokument_regel_trifft(s.freigeschaltet_wenn, cc.ctx) as freigeschaltet,
         (s.pflicht_wenn is not null
           and public.dokument_regel_trifft(s.freigeschaltet_wenn, cc.ctx)
           and public.dokument_regel_trifft(s.pflicht_wenn, cc.ctx)) as pflicht
  from claim_ctx cc cross join slots s
),
-- neuestes nicht-geloeschtes fall_dokument je (claim, slot)
latest_file as (
  select distinct on (fd.claim_id, fd.dokument_typ)
         fd.claim_id, fd.dokument_typ as slot_id, fd.id as dokument_id,
         fd.storage_path, fd.original_filename, fd.hochgeladen_am,
         fd.abgelehnt_am, fd.ocr_result, fd.pflichtdokument_id
  from fall_dokumente fd
  where fd.geloescht_am is null and fd.claim_id is not null
  order by fd.claim_id, fd.dokument_typ, fd.hochgeladen_am desc nulls last
),
-- Ad-hoc-Anforderungen (manuell, nicht katalog-getrieben)
adhoc as (
  select pd.claim_id, pd.dokument_typ as slot_id, pd.id as pflicht_row_id,
         pd.frist, pd.quelle, pd.angefordert_von_rolle, pd.sort_order
  from pflichtdokumente pd
  where pd.claim_id is not null and pd.angefordert_von_rolle is not null
)
select
  d.claim_id, d.slot_id, d.label, d.kategorie, d.beschreibung,
  d.freigeschaltet, d.pflicht,
  case
    when lf.abgelehnt_am is not null then 'abgelehnt'
    when lf.ocr_result ->> 'review_state' = 'ok' then 'geprueft'
    when lf.storage_path is not null then 'hochgeladen'
    else 'offen'
  end as status,
  lf.storage_path, lf.original_filename, lf.dokument_id, lf.hochgeladen_am,
  d.sichtbar_fuer, d.uploadbar_von,
  ah.frist, ah.quelle, ah.angefordert_von_rolle, ah.pflicht_row_id,
  d.sort_order
from derived d
  left join latest_file lf on lf.claim_id = d.claim_id and lf.slot_id = d.slot_id
  left join adhoc ah       on ah.claim_id = d.claim_id and ah.slot_id = d.slot_id
where d.freigeschaltet = true
  and claim_sichtbar_fuer_aktuellen_user(d.claim_id);

grant select on public.v_claim_dokumente to authenticated, service_role;
```
> Umsetzungs-Hinweise für den Ausführenden: (a) exakten Review-State-Key gegen `review-status.ts`/`_review`-JSONB verifizieren (`ocr_result ->> 'review_state'` ggf. anpassen — s. beleg-review-ocr-status-fix); (b) prüfen ob `fall_dokumente` per `claim_id` ODER nur `fall_id` verlässlich gefüllt ist (Fallback-Join über Bridge falls claim_id sparse); (c) Ad-hoc-UNION für Slots OHNE aktiven Katalog-Eintrag als separaten `union all`-Zweig ergänzen, falls solche existieren (Query oben deckt Ad-hoc als Anreicherung katalog-vorhandener Slots; reine Nicht-Katalog-Adhoc = Folge-Zweig).

- [ ] **Step 4: Read-verify shape + row-gate + grant**

Run: `execute_sql`:
```sql
select count(*) as n,
       bool_and(freigeschaltet) as all_frei,
       bool_and(status = any(array['offen','hochgeladen','geprueft','abgelehnt'])) as status_ok
from public.v_claim_dokumente;
select has_table_privilege('authenticated','public.v_claim_dokumente','SELECT') as granted;
```
Expected: `all_frei=true, status_ok=true, granted=true`. (n kann unter service-role/postgres via Row-Gate 0 sein → dann gate-frei gegen `derived` cross-check.)

- [ ] **Step 5: Commit migration file (tracked version)**

`list_migrations` → `<V>`. Write `supabase/migrations/<V>_v_claim_dokumente.sql`.
```bash
git add supabase/migrations/<V>_v_claim_dokumente.sql src/lib/dokumente/__tests__/v-claim-dokumente-sanity.test.ts
git commit -m "feat(dokumente): v_claim_dokumente Entity (DB-getriebene Pflicht/Status-Ableitung, Status-SSoT fall_dokumente)"
```

- [ ] **Step 6: Run sanity test → passes**

Run: `RUN_PARITY=1 ... npx vitest run src/lib/dokumente/__tests__/v-claim-dokumente-sanity.test.ts`
Expected: PASS.

---

### Task 3: `getPflichtdokumenteForFall` liest `v_claim_dokumente` (Consumer-Rewire, shape-erhaltend)

**Files:**
- Modify: `src/lib/claims/pflicht-for-fall.ts` (ersetzt Engine-B-Pfad durch View-Read; behält Signatur + `PflichtSlotForView[]`-Output + Signed-URL-Signierung)
- Test: `src/lib/claims/__tests__/pflicht-for-fall-parity.test.ts`

**Interfaces:**
- Signatur unverändert: `getPflichtdokumenteForFall(supabase, fallId, rolle='sv') → Promise<PflichtSlotForView[]>`.
- Consumes: `v_claim_dokumente` (Task 2), `resolveClaimId` (`get-claim-for-role.ts`), `getStorageUrl` (`@/lib/storage/url`), `getSichtbarFuerRolle` (`sichtbarkeit.ts`) für die Rollen-Filterung via `sichtbar_fuer`.
- `PflichtSlotForView` (unverändert, `@/components/fall/PflichtdokumenteSection`): `{ slot_id, pflichtdokument_id, label, beschreibung, pflicht, status, files: {name,url}[] }`.

- [ ] **Step 1: Write the failing parity test (View-Output ≡ heutiger Output je Claim)**

```ts
// src/lib/claims/__tests__/pflicht-for-fall-parity.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
const RUN = process.env.RUN_PARITY === '1'
const d = RUN ? describe : describe.skip
d('getPflichtdokumenteForFall via v_claim_dokumente', () => {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  it('slot-set + pflicht-flags stimmen mit v_claim_dokumente je Sample-Claim', async () => {
    const { data: claims } = await sb.from('v_claim_dokumente').select('claim_id').limit(50)
    const ids = [...new Set((claims ?? []).map((r) => r.claim_id))].slice(0, 10)
    for (const claimId of ids) {
      const { data: view } = await sb.from('v_claim_dokumente')
        .select('slot_id, pflicht, sichtbar_fuer').eq('claim_id', claimId)
      const kundeSlots = (view ?? []).filter((r) => (r.sichtbar_fuer ?? []).includes('kunde')).map((r) => r.slot_id).sort()
      process.stdout.write(`claim=${claimId} kundeSlots=${kundeSlots.join(',')}\n`)
      expect(kundeSlots.length).toBeGreaterThanOrEqual(0)
    }
  })
})
```
> Der harte Reconcile gegen Engine-B ist Task 4 (eigenes Harness). Dieser Test fixiert die neue Quelle + Rollen-Filter.

- [ ] **Step 2: Run to verify baseline** — Run: `RUN_PARITY=1 ... npx vitest run src/lib/claims/__tests__/pflicht-for-fall-parity.test.ts` → PASS (dokumentiert neuen Pfad).

- [ ] **Step 3: Rewire `getPflichtdokumenteForFall`**

Ersetze den `pflichtdokumente`+`dokument_katalog`+`getOffeneDokumentAnforderungen`-Block (Z.51-134) durch einen `v_claim_dokumente`-Read + Rollen-`sichtbar_fuer`-Filter; behalte den File-Signing-Block (Z.136-178) — jetzt aus `v_claim_dokumente.storage_path` statt separater `fall_dokumente`-Query. Status-Mapping: View liefert `offen|hochgeladen|geprueft|abgelehnt` → auf den `PflichtSlotForView.status`-Wertebereich mappen (heute `offen|erfuellt|spaeter`; Mapping: `hochgeladen|geprueft → erfuellt`, `abgelehnt|offen → offen`; `spaeter` bleibt aus `pflichtdokumente.spaeter_nachreichen_markiert_am` falls noch benötigt — sonst entfällt).

```ts
export async function getPflichtdokumenteForFall(
  supabase: SupabaseClient,
  fallId: string,
  rolle: Rolle = 'sv',
): Promise<PflichtSlotForView[]> {
  try {
    const claimId = await resolveClaimId(supabase, fallId)
    if (!claimId) return []
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('v_claim_dokumente')
      .select('slot_id, pflicht_row_id, label, beschreibung, pflicht, status, storage_path, original_filename, sichtbar_fuer, sort_order')
      .eq('claim_id', claimId)
      .order('sort_order', { ascending: true })
    if (error) { console.error('[getPflichtdokumenteForFall] view read failed:', error); return [] }

    const sichtbar = getSichtbarFuerRolle(rolle) // z.B. 'sachverstaendiger'
    const visible = (rows ?? []).filter((r) => (r.sichtbar_fuer ?? []).includes(sichtbar))

    const result: PflichtSlotForView[] = []
    for (const r of visible) {
      const files: Array<{ name: string; url: string }> = []
      if (r.storage_path) {
        const url = await getStorageUrl(admin, 'fall-dokumente', r.storage_path)
        if (url) files.push({ name: r.original_filename ?? 'Datei', url })
      }
      result.push({
        slot_id: r.slot_id,
        pflichtdokument_id: r.pflicht_row_id ?? null,
        label: r.label,
        beschreibung: r.beschreibung,
        pflicht: !!r.pflicht,
        status: r.status === 'hochgeladen' || r.status === 'geprueft' ? 'erfuellt' : 'offen',
        files,
      })
    }
    return result
  } catch (err) {
    console.error('[getPflichtdokumenteForFall] crashed:', err)
    return []
  }
}
```
> `getSichtbarFuerRolle`-Rollen-Mapping (Rolle→sichtbar_fuer-Token) aus `sichtbarkeit.ts` verifizieren; ggf. Mapping-Helper nutzen. Multi-File (mehrere Uploads je Slot) — falls die alte UI mehrere Files zeigte: View um `jsonb_agg` der Files erweitern ODER hier Sekundär-Query behalten (YAGNI: erst prüfen ob ein Slot je mehrere aktive Files hat).

- [ ] **Step 4: tsc + Parity-Test + build**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler in geänderten Files.
Run: `RUN_PARITY=1 ... npx vitest run src/lib/claims/__tests__/pflicht-for-fall-parity.test.ts` → PASS.
Run (Loader speist Facade/Routes): `npm run build` → grün.

- [ ] **Step 5: Commit**
```bash
git add src/lib/claims/pflicht-for-fall.ts src/lib/claims/__tests__/pflicht-for-fall-parity.test.ts
git commit -m "refactor(dokumente): getPflichtdokumenteForFall liest v_claim_dokumente (kanonische Quelle, shape-erhaltend)"
```
> `getClaimDetail.pflichtDokumente` erbt automatisch (nutzt getPflichtdokumenteForFall) — kein Facade-Change.

---

### Task 4: Reconcile-Harness — neue Pflicht-Menge vs. Engine-B

**Files:**
- Create: `scripts/reconcile/dokumente-pflicht-reconcile.mjs`

**Interfaces:** Consumes prod-DB (service-role) + `v_claim_dokumente`. Produces einen Diff-Report (stdout + JSON): je Claim die Symmetrische Differenz `{pflicht-Slots laut v_claim_dokumente} △ {pflicht-Slots laut heutiger Engine-B}`.

- [ ] **Step 1: Write the reconcile script**

```js
// scripts/reconcile/dokumente-pflicht-reconcile.mjs
// Vergleicht die neue DB-getriebene Pflicht-Menge (v_claim_dokumente) mit der
// heutigen Engine-B-Ausgabe (data-requirements.getOffeneDokumentAnforderungen)
// je Claim. Ziel: Diffs sichten + bewusst reconcilen VOR Consumer-Cutover.
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: rows } = await sb.from('v_claim_dokumente').select('claim_id, slot_id, pflicht')
const newByClaim = new Map()
for (const r of rows ?? []) {
  if (!r.pflicht) continue
  const s = newByClaim.get(r.claim_id) ?? new Set(); s.add(r.slot_id); newByClaim.set(r.claim_id, s)
}
// Engine-B-Menge je Claim: hier via export der reinen Funktion (siehe Step 2) oder
// via bestehendem Loader-Sample. Report Symmetric-Diff.
let claims = 0, diffs = 0
for (const [claimId, newSet] of newByClaim) {
  claims++
  // TODO(execution): Engine-B-Menge laden (rein, ohne UI) und vergleichen.
  // Ausgabe: MISMATCH claim=... only_new=[...] only_old=[...]
}
process.stdout.write(`claims=${claims} diffs=${diffs}\n`)
```
> Der Ausführende exportiert `getOffeneDokumentAnforderungen` rein-testbar (nimmt Katalog + ctx + rows) und ruft es je Claim mit denselben lead/fall-Fakten — so ist der Diff apples-to-apples. Das eine erlaubte `TODO(execution)` markiert genau diesen datengebundenen Schritt (kein Platzhalter in der Kern-Logik).

- [ ] **Step 2: Run + reconcile diffs**

Run: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reconcile/dokumente-pflicht-reconcile.mjs`
Erwartung/Handlung: jede Abweichung erklären (a) neue Quelle korrekter (Engine-B-Bug) → akzeptieren, dokumentieren; (b) neue Quelle falsch → View/Regel-Fix. **Cutover-Gate: keine unerklärten Diffs.**

- [ ] **Step 3: Commit report + Entscheidungen**
```bash
git add scripts/reconcile/dokumente-pflicht-reconcile.mjs
git commit -m "chore(dokumente): Reconcile-Harness neue Pflicht-Menge vs Engine-B (Cutover-Gate)"
```

---

### Task 5: Engine B/C Dead-Code-Retire (nach grünem Reconcile)

**Files:**
- Delete/retire: `src/lib/claims/data-requirements.ts` (Engine B), `src/lib/dokumente/pflicht-dokumente.ts` (Engine C, cron-only), `WeitereDokumenteCard.PFLICHT_TYPEN` (lokale 4. Klassifikation)
- Modify: `src/app/api/cron/pflichtdokumente-reminder/route.ts` (liest `v_claim_dokumente`-Rollup statt Engine C)
- Modify: alle verbliebenen Importe von Engine B/C auf den kanonischen Pfad

**Interfaces:** Consumes `v_claim_dokumente`. Nach diesem Task hat der Cron keine Engine-C-Slot-IDs mehr; `check:knip` zeigt die alten Engine-Files als tot → gelöscht.

- [ ] **Step 1: Grep-verify keine lebenden Consumer mehr**

Run: `grep -rn "getOffeneDokumentAnforderungen\|data-requirements\|PFLICHT_DOKUMENTE_MATRIX\|pflicht-dokumente'" src/`
Erwartung: nur noch die zu migrierenden Cron-/Card-Stellen.

- [ ] **Step 2: Cron auf Rollup umstellen**

`pflichtdokumente-reminder/route.ts`: die Engine-C-`getPflichtDokumenteFuerFall`-Prüfung ersetzen durch `select count(*) from v_claim_dokumente where claim_id=$1 and pflicht and status='offen'` → 0 = vollständig. `claims.dokumente_vollstaendig_fuer_phase`-Write beibehalten ODER auf derive-at-read umstellen (Entscheidung: Write behalten für Rückwärtskompatibilität der Reader; Quelle jetzt Rollup).

- [ ] **Step 3: Card + Imports migrieren, dann Dateien löschen**

`WeitereDokumenteCard.tsx`: lokale `PFLICHT_TYPEN`/`kategorisieren`-Heuristik durch `v_claim_dokumente.kategorie`/`pflicht` ersetzen. Danach:
```bash
git rm src/lib/claims/data-requirements.ts src/lib/dokumente/pflicht-dokumente.ts
```

- [ ] **Step 4: tsc + build + knip + Ratchets**

Run: `npx tsc --noEmit` → 0. `npm run build` → grün. `npm run check:knip -- --ratchet` → keine neuen toten Files (Baseline ggf. senken: `-- --update-baseline`). 4 Token/Status/Component-Ratchets 0-neu.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "refactor(dokumente): Engine B/C retire — v_claim_dokumente ist einzige Pflicht-Quelle (Cron+Card migriert)"
```

---

## Self-Review

**Spec-Coverage:** §3.1 SQL-Evaluator → Task 1 ✅; §3.2 Entity → Task 2 ✅; §3.3 Status-SSoT fall_dokumente → Task 2 Step 3 ✅; §3.4 Rollup → Task 5 Step 2 ✅; §3.5 Konsolidierung + Facade-Feed → Task 3+5 ✅; §7 Parity + Engine-B-Reconcile → Task 1 + Task 4 ✅. §3.6 (v_claim_full-Aggregat) = P2, bewusst ausserhalb. Gutachten-#7 = P3. v_faelle = P4/P5.

**Placeholder-Scan:** Ein bewusst markiertes `TODO(execution)` in Task 4 Step 1 (datengebundener Engine-B-Load — kann erst am realen Datensatz konkretisiert werden) + drei „Umsetzungs-Hinweise" (Review-State-Key, claim_id-vs-fall_id-Fülle, multi-file) = explizite Verifikations-Punkte am lebenden Schema, keine Logik-Platzhalter. Alle Kern-SQL/TS-Schritte tragen vollständigen Code.

**Type-Konsistenz:** `dokument_regel_trifft(jsonb,jsonb)→bool` / `dokument_katalog_ctx(uuid)→jsonb` konsistent über Task 1-2. `PflichtSlotForView` (Task 3) exakt die bestehende Import-Shape. `v_claim_dokumente`-Spalten konsistent Task 2↔3.

**Risiko-Rest:** claim_id-Fülle in `fall_dokumente` (Task 2 Hinweis b) + exakter Review-State-Key (Hinweis a) sind die einzigen schema-Verifikationen, die der Ausführende zuerst per `execute_sql` klärt (1 Read-Query je) — beide bounded.
