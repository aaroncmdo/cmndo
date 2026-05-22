# CMM-44 SP-J — Abrechnung/Zahlung → claims · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 12 zahlungs-/abrechnungsbezogenen `faelle`-Spalten additiv auf `claims` migrieren (1:1 pro Claim). **Rein additiv** — kein per-Spalten-`DROP`.

**Architecture:** PR1 = additive Migration (12× `ADD COLUMN` auf `claims`, UPDATE-Backfill `FROM faelle WHERE f.claim_id=c.id`, 3 View-Repoints). PR2 = Reader/Writer-Sweep code-only + die 12 in `CLAIM_OWNED_DUPLICATE_COLUMNS` (zentrale Writer routen automatisch). PR3 = idempotenter Catch-up-Backfill. Muster identisch zu **SP-B** (`docs/20.05.2026/handoff-cmm44-spb-abschluss.md`).

**Tech Stack:** Next.js 15, TypeScript, `@supabase/supabase-js`, Supabase CLI (Migrations), Postgres, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-22-cmm44-spj-abrechnung-claims-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** `.claude/worktrees/cmm-44-sph-pr2` (hat node_modules + `.env.local` + `supabase/.temp/`). Pro PR ein eigener Branch off `origin/staging` (PR2 nach PR1-staging-Merge wegen regen. Types). PRs immer `--base staging` (`feedback_pr_gegen_staging`).
- **Harte Regeln (AGENTS.md):** Nie auf `main` pushen. DDL nur via supabase-CLI (`db query --linked` + `migration repair`, **kein** `db push`). Kein unbegleiteter Stash.
- **DB-Apply-Muster (SP-A2/B/G/H bewährt):** Migration in `BEGIN/COMMIT`; Dry-Run `sed 's/^COMMIT;/ROLLBACK;/'`; Apply via `npx supabase db query --linked --file <sql>`; dann `npx supabase migration repair --status applied <version>`.
- **PR-Hygiene:** Branch pushen → 2-Stufen-Review (Spec + Quality) → **dann** `gh pr create`. Feature→staging mergt Aaron selbst (`feedback_kein_auto_merge`).
- **db query Multi-Statement:** gibt nur das letzte Resultset → Measure/Verify als ein `SELECT` mit Subqueries.

## Referenz: Die 12 Spalten (live 2026-05-22)

| `faelle.<col>` → `claims.<col>` (gleicher Name) | Typ (Doc) | Cov | Hinweis |
|---|---|--:|---|
| `zahlung_eingegangen_am` | timestamptz | 0 | |
| `zahlung_erwartet_am` | date | 0 | |
| `zahlung_betrag` | numeric | 0 | von state-machine gesetzt |
| `guthaben_verrechnet_netto` | numeric | 48 | **hat Default** — live messen |
| `sv_nachzahlung_netto` | numeric | 0 | |
| `schlussabrechnung_am` | timestamptz | 0 | |
| `zahlungsweg` | text | 0 | |
| `auszahlung_gutachter_eingegangen_am` | timestamptz | 0 | |
| `auszahlung_zahlungsweg` | text | 0 | |
| `auszahlung_gutachter_betrag` | numeric | 0 | |
| `abrechnung_id` | uuid | 0 | **FK→abrechnungen** |
| `kanzlei_abrechnung_id` | uuid | 0 | **FK→abrechnungen** |

claims hat aktuell **keine** der 12 (kein DUP, kein Rename). Exakte Typen/Precision/Defaults/FK in Task 1 live messen.

## Transform-Regelwerk (PR2)

`claims` ist 1:1 pro Claim → **kein** `.order().limit(1)`, **kein** LATERAL (anders als SP-H/SP-D).

| Muster | Erkennung | Transform |
|---|---|---|
| **A — Direct-Select aus faelle, nur SP-J-Spalten** | `from('faelle').select('id, claim_id, zahlung_betrag')` | `from('claims').select('zahlung_betrag').eq('id', claimId).maybeSingle()`. Name unverändert. |
| **B — Direct-Select aus faelle, gemischt** | `from('faelle').select('… , zahlungsweg, …')` | SP-J-Spalten in nested Embed: `from('faelle').select('… , claims:claim_id(zahlungsweg, …)')` + Array-Normalisierung `const c = Array.isArray(row.claims) ? row.claims[0] : row.claims`. |
| **C — Write auf faelle (SP-J-col), via Helper** | Update-Dict läuft durch `splitOrKeepFaelleUpdate` (state-machine, process-event, core/eskalation/stammdaten/kanzlei-paket) | **Kein Code-Change am Call-Site nötig** — sobald die 12 in `CLAIM_OWNED_DUPLICATE_COLUMNS` sind, routet der Helper sie nach claims (Task 4 Step 1). |
| **C2 — Write auf faelle (SP-J-col), DIREKT** | `from('faelle').update({ zahlung_betrag: … })` ohne Helper | SP-J-Werte aus dem faelle-Update entfernen, separat `from('claims').update({ zahlung_betrag: … }).eq('id', claimId)`; `{ error }`-geguarded; non-SP-J bleibt auf faelle; **kein Dual-Write**. |
| **D — Nested `faelle(...)`-Select** | `from('x').select('…, faelle(zahlungsweg)')` | SP-J-Spalte in `claims:claim_id(zahlungsweg)` doppelt-genestet, Array-Normalisierung an beiden Stellen. |
| **E — View-Read** | Read aus `v_faelle_mit_aktuellem_termin`/`faelle_sv_view`/`faelle_kunde_view` | PR1 hat repointet → **kein Code-Change.** |
| **F — TS-Typ / JSX / Property-Access** | `interface`-Feld, `obj.zahlungsweg`, JSX | **Kein Change** — Name identisch. Falls als `Tables<'faelle'>['Row'][...]` getypt → auf `'claims'`. |

**Verify-Endzustand PR2:** paren-balanced Re-Grep (`scripts/cmm44-spj-grep.mjs`) zeigt 0 live `from('faelle')`-Reads/Writes + 0 nested `faelle(...)` der 12. `npm run build` (8 GB) grün.

## File Structure

**Neu:** `scripts/cmm44-spj-measure.sql`, `scripts/cmm44-spj-views-audit.sql`, `scripts/cmm44-spj-verify.sql`, `scripts/cmm44-spj-grep.mjs`, `scripts/smoke-cmm44-spj.mjs`, `supabase/migrations/<ts>_cmm44_spj_add_claims_columns.sql`, `supabase/migrations/<ts>_cmm44_spj_catchup_backfill.sql`, `docs/22.05.2026/cmm44-spj-{views-audit,inventory,smoke-pr2}.md`.
**Modifiziert:** `src/lib/faelle/claim-duplicate-columns.ts` (+12 in Set, PR2), `src/lib/faelle/claim-duplicate-columns.test.ts` (+Routing-Case, PR2), `src/`-Sweep-Files (PR2), `src/lib/supabase/database.types.ts` (PR1).

---

## Task 0: Live-DB-Drift-Check

**Files:** Create `scripts/cmm44-spj-measure.sql`.

- [ ] **Step 1: Measure-Query schreiben**

`scripts/cmm44-spj-measure.sql`:
```sql
-- CMM-44 SP-J — sind die 12 schon auf claims? + exakte faelle-Defs.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='claims'
    AND column_name IN ('zahlung_eingegangen_am','zahlung_erwartet_am','zahlung_betrag','guthaben_verrechnet_netto','sv_nachzahlung_netto','schlussabrechnung_am','zahlungsweg','auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','auszahlung_gutachter_betrag','abrechnung_id','kanzlei_abrechnung_id')) AS spj_already_on_claims,
  (SELECT string_agg(column_name||' '||udt_name||' null='||is_nullable||' def='||COALESCE(column_default,'-')||' prec='||COALESCE(numeric_precision::text,'-')||','||COALESCE(numeric_scale::text,'-'), E'\n' ORDER BY column_name)
     FROM information_schema.columns WHERE table_schema='public' AND table_name='faelle'
    AND column_name IN ('zahlung_eingegangen_am','zahlung_erwartet_am','zahlung_betrag','guthaben_verrechnet_netto','sv_nachzahlung_netto','schlussabrechnung_am','zahlungsweg','auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','auszahlung_gutachter_betrag','abrechnung_id','kanzlei_abrechnung_id')) AS faelle_defs;
```

- [ ] **Step 2: Fahren**

Run: `npx supabase db query --linked --file scripts/cmm44-spj-measure.sql 2>&1 | tail -40`
Expected: `spj_already_on_claims=0`. `faelle_defs` listet 12 Zeilen mit exakten Typen/Defaults/Precision. Zeigt eine Spalte schon auf claims → andere Session war schneller, aus Block 1 streichen + im Log vermerken. **Notiere die exakten numeric-Precisions** (für ADD + View-Casts) und `guthaben_verrechnet_netto`-Default.

- [ ] **Step 3: FK-Definition der 2 Pointer messen**

```bash
cat > /tmp/spj-fk.sql <<'SQL'
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid='public.faelle'::regclass AND contype='f'
  AND pg_get_constraintdef(oid) LIKE '%abrechnung%';
SQL
npx supabase db query --linked --file /tmp/spj-fk.sql 2>&1 | tail -20
```
Notiere die FK-Definition (Ziel-Tabelle + `ON DELETE`-Verhalten) für `abrechnung_id`/`kanzlei_abrechnung_id` — 1:1 auf claims spiegeln. Kein Commit (reiner Mess-Schritt).

---

## Task 1: PR1 — View-Audit + Migration schreiben + Dry-Run

**Branch:** `kitta/cmm-44-spj-pr1-add-columns`, frisch von `kitta/cmm-44-spj` (Spec/Plan-Branch).

**Files:** Create `scripts/cmm44-spj-views-audit.sql`, `scripts/cmm44-spj-verify.sql`, `docs/22.05.2026/cmm44-spj-views-audit.md`, `supabase/migrations/<ts>_cmm44_spj_add_claims_columns.sql`.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git checkout -b kitta/cmm-44-spj-pr1-add-columns kitta/cmm-44-spj
```

- [ ] **Step 2: Verify-Query schreiben**

`scripts/cmm44-spj-verify.sql`:
```sql
SELECT count(*) AS spj_neu_auf_claims
FROM information_schema.columns
WHERE table_schema='public' AND table_name='claims'
  AND column_name IN ('zahlung_eingegangen_am','zahlung_erwartet_am','zahlung_betrag','guthaben_verrechnet_netto','sv_nachzahlung_netto','schlussabrechnung_am','zahlungsweg','auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','auszahlung_gutachter_betrag','abrechnung_id','kanzlei_abrechnung_id');
```

- [ ] **Step 3: View-Bodies holen (für Repoint)**

Die 3 Treffer-Views live auslesen (wortgetreuer Body für `CREATE OR REPLACE`):
```bash
for v in v_faelle_mit_aktuellem_termin faelle_sv_view faelle_kunde_view; do
  echo "=== $v ===" > /tmp/spj-vd-$v.sql
  echo "SELECT pg_get_viewdef('public.$v', true);" > /tmp/q.sql
  npx supabase db query --linked --file /tmp/q.sql 2>&1 | tail -200 >> /tmp/spj-vd-$v.sql
done
```
Pro View: die SP-J-Spalten kommen aktuell aus `f.<col>` (faelle-Alias). Repoint-Strategie in `docs/22.05.2026/cmm44-spj-views-audit.md` festhalten (Tabelle `view | cols | quelle | repoint`). `v_faelle_mit_aktuellem_termin` joint claims bereits als `c` (SP-B) → nur `f.<col>` → `c.<col>` ersetzen; `faelle_sv_view`/`faelle_kunde_view` ggf. claims-JOIN ergänzen falls noch nicht vorhanden (live prüfen).

- [ ] **Step 4: Migration generieren + schreiben**

```bash
npx supabase migration new cmm44_spj_add_claims_columns
```
Inhalt (Typen/Defaults/FK aus Task 0 — unten ist die Erwartung, **vor Apply gegen Task-0-Messung abgleichen**):
```sql
-- CMM-44 SP-J PR1 — additive Migration (kein DROP)
-- Block 1: 12 ADD COLUMN auf claims (Typ/Default/FK 1:1 von faelle gespiegelt)
-- Block 2: UPDATE-Backfill claims <- faelle via f.claim_id=c.id
-- Block 3: 3 View-Repoints (f.<col> -> c.<col>)
-- Nach Apply: npx supabase migration repair --status applied <ts>
BEGIN;

ALTER TABLE public.claims
  ADD COLUMN zahlung_eingegangen_am timestamptz,
  ADD COLUMN zahlung_erwartet_am date,
  ADD COLUMN zahlung_betrag numeric,
  ADD COLUMN guthaben_verrechnet_netto numeric DEFAULT 0,   -- Default aus Task 0 bestätigen
  ADD COLUMN sv_nachzahlung_netto numeric,
  ADD COLUMN schlussabrechnung_am timestamptz,
  ADD COLUMN zahlungsweg text,
  ADD COLUMN auszahlung_gutachter_eingegangen_am timestamptz,
  ADD COLUMN auszahlung_zahlungsweg text,
  ADD COLUMN auszahlung_gutachter_betrag numeric,
  ADD COLUMN abrechnung_id uuid REFERENCES public.abrechnungen(id),         -- ON DELETE aus Task 0
  ADD COLUMN kanzlei_abrechnung_id uuid REFERENCES public.abrechnungen(id); -- ON DELETE aus Task 0

UPDATE public.claims c SET
  zahlung_eingegangen_am               = f.zahlung_eingegangen_am,
  zahlung_erwartet_am                  = f.zahlung_erwartet_am,
  zahlung_betrag                       = f.zahlung_betrag,
  guthaben_verrechnet_netto            = COALESCE(f.guthaben_verrechnet_netto, c.guthaben_verrechnet_netto),
  sv_nachzahlung_netto                 = f.sv_nachzahlung_netto,
  schlussabrechnung_am                 = f.schlussabrechnung_am,
  zahlungsweg                          = f.zahlungsweg,
  auszahlung_gutachter_eingegangen_am  = f.auszahlung_gutachter_eingegangen_am,
  auszahlung_zahlungsweg               = f.auszahlung_zahlungsweg,
  auszahlung_gutachter_betrag          = f.auszahlung_gutachter_betrag,
  abrechnung_id                        = f.abrechnung_id,
  kanzlei_abrechnung_id                = f.kanzlei_abrechnung_id
FROM public.faelle f
WHERE f.claim_id = c.id;

-- Block 3: CREATE OR REPLACE VIEW pro Treffer-View — Body wortgetreu aus
-- pg_get_viewdef (Step 3), je f.<spj_col> -> c.<spj_col> mit Precision-Cast
-- wo die claims-Spalte breiter ist (42P16-Guard). Occurrence-Count-Assertion
-- (jede ersetzte Stelle ==1) wie SP-G2/SP-D.

COMMIT;
```

- [ ] **Step 5: Trigger-Body-Audit auf claims (SP-G-Lesson)**

```bash
cat > /tmp/spj-trg.sql <<'SQL'
SELECT p.proname, left(p.prosrc, 200) FROM pg_trigger t
JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='claims' AND NOT t.tgisinternal ORDER BY p.proname;
SQL
npx supabase db query --linked --file /tmp/spj-trg.sql 2>&1 | tail -60
```
Feuert ein Trigger-Body auf den 12 Spalten Notifications (`pg_notify`/`net.http`)? Falls ja: Backfill in `DISABLE/ENABLE TRIGGER`-Wrapper. Sonst ohne. Befund in views-audit.md.

- [ ] **Step 6: Dry-Run**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spj_add_claims_columns.sql | tail -1)
sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/spj-pr1-dry.sql
npx supabase db query --linked --file /tmp/spj-pr1-dry.sql 2>&1 | tail -10
```
Expected: kein Fehler. Häufige Klassen: `column already exists` (streichen), `cannot change data type of view column` (Precision-Cast ergänzen), FK-Verstoß (faelle-Werte zeigen auf gelöschte abrechnungen → `ON DELETE SET NULL` prüfen, pre-launch cov=0 also unkritisch).

- [ ] **Step 7: Commit (vor Apply)**

```bash
git add scripts/cmm44-spj-views-audit.sql scripts/cmm44-spj-verify.sql docs/22.05.2026/cmm44-spj-views-audit.md supabase/migrations/*_cmm44_spj_add_claims_columns.sql
git commit -m "chore(CMM-44): SP-J PR1 — ADD-Migration + View-Audit (vor Apply)"
```

---

## Task 2: PR1 — Apply + Verify + Types + Build + Push

**Branch:** `kitta/cmm-44-spj-pr1-add-columns` (Forts.).

- [ ] **Step 1: Drift-Recheck** — `npx supabase db query --linked --file scripts/cmm44-spj-measure.sql 2>&1 | grep spj_already_on_claims` → erwartet `0`.

- [ ] **Step 2: Applizieren + repair**

```bash
MIG=$(ls supabase/migrations/*_cmm44_spj_add_claims_columns.sql | tail -1); TS=$(basename "$MIG" | cut -d_ -f1)
npx supabase db query --linked --file "$MIG" 2>&1 | tail -10
npx supabase migration repair --status applied "$TS" 2>&1 | tail -3
```

- [ ] **Step 3: Verify** — `npx supabase db query --linked --file scripts/cmm44-spj-verify.sql 2>&1 | grep spj_neu_auf_claims` → erwartet `12`. Plus Backfill-Spotcheck: für 1 Claim mit abrechnung_id (falls vorhanden) `c.<col>==f.<col>`; pre-launch cov 0 → meist NULL=NULL.

- [ ] **Step 4: View-Verify** — pro View `pg_get_viewdef` zeigt SP-J-Spalten aus `c.` (claims). 0 residual `f.<spj_col>` in den 3 Views.

- [ ] **Step 5: Types regen** (PowerShell, kein stderr-Bleed — SP-G-Lesson)

```bash
powershell -Command "& { npx supabase gen types typescript --linked 2>\$null | Out-File -Encoding utf8 src/lib/supabase/database.types.ts }"
grep -nE "zahlung_betrag\b|auszahlung_gutachter_betrag\b|abrechnung_id\b" src/lib/supabase/database.types.ts | head
```
Sanity: head `export type Json =`, tail `} as const`; die 3 Beispiel-Spalten erscheinen im claims-Row/Insert/Update-Type.

- [ ] **Step 6: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10` → `✓ Compiled successfully`, exit 0.

- [ ] **Step 7: Commit + Push (KEIN PR)**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat(CMM-44): SP-J PR1 — 12 ADD auf claims + Backfill + 3 View-Repoints"  # + 7-Punkte-Audit-Block im Body
git push -u origin kitta/cmm-44-spj-pr1-add-columns
```

- [ ] **Step 8: PR öffnen NACH 2-Stufen-Review** — `gh pr create --base staging --title "CMM-44 SP-J PR1 — 12 ADD auf claims + Backfill" --body "Additive Migration, appliziert+repaired. Spec: docs/superpowers/specs/2026-05-22-cmm44-spj-abrechnung-claims-design.md"`

> **GATE:** Task 3 startet erst, wenn PR1 auf `staging` gemergt ist (Reader-Sweep braucht regen. Types).

---

## Task 3: PR2 — Call-Site-Inventur

**Branch:** `kitta/cmm-44-spj-pr2-sweep`, frisch von `origin/staging` (nach PR1-Merge).

**Files:** Create `scripts/cmm44-spj-grep.mjs`, `docs/22.05.2026/cmm44-spj-inventory.md`.

- [ ] **Step 1: Branch** — `git fetch origin && git checkout -b kitta/cmm-44-spj-pr2-sweep origin/staging`

- [ ] **Step 2: Re-Grep-Skript** (analog `scripts/cmm44-sph-grep.mjs`, COLS = die 12):

```javascript
#!/usr/bin/env node
// CMM-44 SP-J — paren-balanced Re-Grep der 12 Spalten in src/.
import fs from 'node:fs'; import path from 'node:path'
const COLS = ['zahlung_eingegangen_am','zahlung_erwartet_am','zahlung_betrag','guthaben_verrechnet_netto','sv_nachzahlung_netto','schlussabrechnung_am','zahlungsweg','auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','auszahlung_gutachter_betrag','abrechnung_id','kanzlei_abrechnung_id']
function walk(dir, out=[]) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if (e.isDirectory()) { if (e.name==='node_modules'||e.name==='.next'||e.name==='.claude') continue; walk(p,out) } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p) } return out }
function stripSubEmbeds(s){ let prev=''; while(prev!==s){ prev=s; s=s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g,''); s=s.replace(/\bclaims\s*\(([^()]|\([^()]*\))*\)/g,'') } return s }
const fromRe=/\.from\(['"]faelle['"]\)/g, nestedRe=/\bfaelle\s*\(/g, hits=[]
for (const f of walk('src')) { const s=fs.readFileSync(f,'utf8'); let m
  fromRe.lastIndex=0; while((m=fromRe.exec(s))){ const w=stripSubEmbeds(s.slice(m.index,m.index+1500)); for(const c of COLS){ if(new RegExp(`\\b${c}\\b`).test(w)){ hits.push(`${f}:${s.slice(0,m.index).split('\n').length} | ${c} | from('faelle')`); break } } }
  nestedRe.lastIndex=0; while((m=nestedRe.exec(s))){ const st=m.index+m[0].length; let d=1,e=st; while(e<s.length&&d>0){ const ch=s[e]; if(ch==='(')d++; else if(ch===')')d--; e++ } const w=stripSubEmbeds(s.slice(st,e-1)); for(const c of COLS){ if(new RegExp(`\\b${c}\\b`).test(w)){ hits.push(`${f}:${s.slice(0,m.index).split('\n').length} | ${c} | nested faelle(...)`); break } } } }
console.log(hits.join('\n')); console.log(`\nTOTAL HITS: ${hits.length}`)
```
> **Hinweis** stripSubEmbeds entfernt hier `claims:claim_id(...)` UND `claims(...)`-Embeds (claims ist das Ziel), damit bereits-rerouted Reads keine False-Positives erzeugen.

- [ ] **Step 3: Inventur fahren + dokumentieren**

```bash
node scripts/cmm44-spj-grep.mjs > /tmp/spj-hits.txt; tail -1 /tmp/spj-hits.txt
grep -oE '\| [a-z_]+ \|' /tmp/spj-hits.txt | sed 's/| //; s/ |//' | sort | uniq -c | sort -rn
sed -E 's/:[0-9]+ \|.*//' /tmp/spj-hits.txt | grep -v TOTAL | sort | uniq -c | sort -rn | head -25
```
`docs/22.05.2026/cmm44-spj-inventory.md`: pro-Site Pattern A/B/C/C2/D/E/F + Out-of-Scope (Test/Seed) + **Grep-Gap-Check** (Helper-Consumer von `splitOrKeepFaelleUpdate`: `grep -rn splitOrKeepFaelleUpdate src/` — diese setzen SP-J-Werte evtl. ohne Spaltennamen nahe `from('faelle')`; sie sind nach Task 4 Step 1 automatisch abgedeckt, im Doc als „Pattern C via Set" markieren). Chunking: <80 Sites → 1 PR2.

- [ ] **Step 4: Commit** — `git add scripts/cmm44-spj-grep.mjs docs/22.05.2026/cmm44-spj-inventory.md && git commit -m "docs(CMM-44): SP-J PR2 — Call-Site-Inventur"`

---

## Task 4: PR2 — Transform + Set-Update + vitest + Build + Push

**Files:** `src/lib/faelle/claim-duplicate-columns.ts`, `src/lib/faelle/claim-duplicate-columns.test.ts`, alle A/B/C2/D-Sites aus der Inventur, `src/lib/supabase/database.types.ts` (falls Typ-Refs).

- [ ] **Step 1: Die 12 in `CLAIM_OWNED_DUPLICATE_COLUMNS` aufnehmen**

In `src/lib/faelle/claim-duplicate-columns.ts`, im `CLAIM_OWNED_DUPLICATE_COLUMNS`-Set einen SP-J-Block ergänzen:
```typescript
  // CMM-44 SP-J — Abrechnung/Zahlung-Spalten, jetzt namensgleich auf claims.
  // splitOrKeepFaelleUpdate routet sie automatisch auf claims (state-machine
  // zahlung_eingegangen_am/zahlung_betrag, process-event, etc.).
  'zahlung_eingegangen_am',
  'zahlung_erwartet_am',
  'zahlung_betrag',
  'guthaben_verrechnet_netto',
  'sv_nachzahlung_netto',
  'schlussabrechnung_am',
  'zahlungsweg',
  'auszahlung_gutachter_eingegangen_am',
  'auszahlung_zahlungsweg',
  'auszahlung_gutachter_betrag',
  'abrechnung_id',
  'kanzlei_abrechnung_id',
```

- [ ] **Step 2: vitest-Routing-Case ergänzen**

In `src/lib/faelle/claim-duplicate-columns.test.ts` einen Block ergänzen:
```typescript
describe('SP-J: Abrechnung-Spalten routen auf claims', () => {
  it('splitOrKeepFaelleUpdate routet zahlung_* + abrechnung_id nach claims (mit claim_id)', () => {
    const update = { status: 'zahlung-eingegangen', zahlung_eingegangen_am: '2026-05-22T10:00:00Z', zahlung_betrag: 1500, abrechnung_id: 'inv-1' }
    const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(update, 'claim-1')
    expect(claimsUpdate).toEqual({ zahlung_eingegangen_am: '2026-05-22T10:00:00Z', zahlung_betrag: 1500, abrechnung_id: 'inv-1' })
    expect(faelleUpdate).toEqual({ status: 'zahlung-eingegangen' })
  })
  it('bleibt auf faelle ohne claim_id (Legacy-Fallback)', () => {
    const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate({ zahlung_betrag: 1500 }, null)
    expect(faelleUpdate).toEqual({ zahlung_betrag: 1500 }); expect(claimsUpdate).toEqual({})
  })
})
```
Run: `npx vitest run src/lib/faelle/claim-duplicate-columns.test.ts` → alle grün (inkl. bestehendem AUFTRAEGE-Disjunktheits-Test — die 12 dürfen nicht in `AUFTRAEGE_OWNED_COLUMNS` sein; sind sie nicht).

- [ ] **Step 3: Pattern A/B/C2/D-Sites transformieren** (pro Inventur-Eintrag)

**Beispiel A (Read nur SP-J):**
```typescript
// VORHER: from('faelle').select('id, claim_id, zahlung_betrag').eq('id', fallId).single()
// NACHHER:
const { data: fall } = await db.from('faelle').select('id, claim_id').eq('id', fallId).single()
let claimRow: { zahlung_betrag: number | null } | null = null
if (fall?.claim_id) {
  const { data } = await db.from('claims').select('zahlung_betrag').eq('id', fall.claim_id).maybeSingle()
  claimRow = data
}
const betrag = claimRow?.zahlung_betrag
```
**Beispiel B (gemischt):**
```typescript
// from('faelle').select('id, status, zahlungsweg') ->
const { data: fall } = await db.from('faelle').select('id, status, claims:claim_id(zahlungsweg)').eq('id', fallId).single()
const claims = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims
const zahlungsweg = claims?.zahlungsweg ?? null
```
**Beispiel C2 (direkter Write):**
```typescript
// from('faelle').update({ zahlung_betrag: x, status: 'zahlung-eingegangen' }) ->
const { data: fall } = await db.from('faelle').select('claim_id').eq('id', fallId).single()
if (fall?.claim_id) { const { error } = await db.from('claims').update({ zahlung_betrag: x }).eq('id', fall.claim_id); if (error) return { ok:false, error:error.message } }
const { error: fErr } = await db.from('faelle').update({ status: 'zahlung-eingegangen' }).eq('id', fallId)
if (fErr) return { ok:false, error: fErr.message }
```
Pattern C (Helper-Consumer) + E (View) + F (Typ) = **kein Change**. Error-Handling je File-Stil (Result-Object in Actions; throw in state-machine/process-event).

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → 0 Fehler. Typische: „Property 'zahlung_betrag' does not exist on type Tables<'faelle'>" → Konsument liest noch alt → nachziehen.

- [ ] **Step 5: Re-Grep** — `node scripts/cmm44-spj-grep.mjs` → 0 oder nur FPs (Kommentare, Helper-Consumer-Writes [Pattern C via Set], type-Echoes). Echte Reste fixen.

- [ ] **Step 6: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10` → grün.

- [ ] **Step 7: Commit + Push (KEIN PR)** — `git add -A && git commit` (Subject `refactor(CMM-44): SP-J PR2 — Reader/Writer-Sweep faelle->claims + Set` + 7-Punkte-Audit) `&& git push -u origin kitta/cmm-44-spj-pr2-sweep`

- [ ] **Step 8: PR NACH Review** — `gh pr create --base staging --title "CMM-44 SP-J PR2 — Reader/Writer-Sweep faelle->claims (12 Spalten)"`

---

## Task 5: PR2 — Portal-Smoke (nach staging-Merge)

**Files:** Create `scripts/smoke-cmm44-spj.mjs` (kopiere `scripts/smoke-cmm44-sph.mjs`, passe Routes an).

- [ ] **Step 1: Smoke-Script** — Kritische SP-J-Pfade: **Admin** `/admin/finance` + `/admin/faelle/[id]` (Regulierung/Abrechnung-Tab); **SV** `/gutachter/abrechnung`; **Fallakte** `/faelle/[id]` (VS-Regulierung/Zahlung). DB-Sanity: `claims` trägt die 12 (count=12). Detekt: 5xx, pageerror, `undefined/NaN/[object Object]`.

- [ ] **Step 2: Smoke fahren** — `node --env-file=.env.local scripts/smoke-cmm44-spj.mjs` gegen `app.staging.claimondo.de`. Screenshots im selben Turn auswerten (`feedback_smoke_screenshot_pflicht`). Protokoll `docs/22.05.2026/cmm44-spj-smoke-pr2.md`. Pre-existing #418 (Fallakte) / #310 (Redirect) / transienter ChunkLoadError = NICHT als SP-J-Regression werten.

- [ ] **Step 3: Commit** — `git add scripts/smoke-cmm44-spj.mjs docs/22.05.2026/cmm44-spj-smoke-pr2.md && git commit -m "test(CMM-44): SP-J PR2 — Portal-Smoke" && git push`

> **GATE:** Task 6 startet erst, wenn PR2 auf `main` ist (Squash-Inhaltscheck: `git diff origin/main origin/staging -- src/ supabase/migrations/ | head -5`).

---

## Task 6: PR3 — Catch-up-Backfill

**Branch:** `kitta/cmm-44-spj-pr3-catchup`, frisch von `origin/staging`.

**Files:** Create `supabase/migrations/<ts>_cmm44_spj_catchup_backfill.sql`.

- [ ] **Step 1: Branch** — `git fetch origin && git checkout -b kitta/cmm-44-spj-pr3-catchup origin/staging`

- [ ] **Step 2: Migration** — `npx supabase migration new cmm44_spj_catchup_backfill`, Inhalt idempotent COALESCE (bestehende claims-Werte gewinnen):
```sql
BEGIN;
UPDATE public.claims c SET
  zahlung_eingegangen_am               = COALESCE(c.zahlung_eingegangen_am, f.zahlung_eingegangen_am),
  zahlung_erwartet_am                  = COALESCE(c.zahlung_erwartet_am, f.zahlung_erwartet_am),
  zahlung_betrag                       = COALESCE(c.zahlung_betrag, f.zahlung_betrag),
  guthaben_verrechnet_netto            = COALESCE(c.guthaben_verrechnet_netto, f.guthaben_verrechnet_netto),
  sv_nachzahlung_netto                 = COALESCE(c.sv_nachzahlung_netto, f.sv_nachzahlung_netto),
  schlussabrechnung_am                 = COALESCE(c.schlussabrechnung_am, f.schlussabrechnung_am),
  zahlungsweg                          = COALESCE(c.zahlungsweg, f.zahlungsweg),
  auszahlung_gutachter_eingegangen_am  = COALESCE(c.auszahlung_gutachter_eingegangen_am, f.auszahlung_gutachter_eingegangen_am),
  auszahlung_zahlungsweg               = COALESCE(c.auszahlung_zahlungsweg, f.auszahlung_zahlungsweg),
  auszahlung_gutachter_betrag          = COALESCE(c.auszahlung_gutachter_betrag, f.auszahlung_gutachter_betrag),
  abrechnung_id                        = COALESCE(c.abrechnung_id, f.abrechnung_id),
  kanzlei_abrechnung_id                = COALESCE(c.kanzlei_abrechnung_id, f.kanzlei_abrechnung_id)
FROM public.faelle f WHERE f.claim_id = c.id;
COMMIT;
```

- [ ] **Step 3: Dry-Run** — `sed 's/^COMMIT;/ROLLBACK;/'` → kein Fehler.

- [ ] **Step 4: Apply + repair + Verify** — wie Task 2 Step 2-3; `spj_neu_auf_claims=12` unverändert.

- [ ] **Step 5: Commit + Push** — `git commit` (Subject `feat(CMM-44): SP-J PR3 — Catch-up-Backfill` + Audit) `&& git push -u origin kitta/cmm-44-spj-pr3-catchup`

- [ ] **Step 6: PR NACH Review** — `gh pr create --base staging --title "CMM-44 SP-J PR3 — Catch-up-Backfill (12 COALESCE)"`

- [ ] **Step 7: Finaler Smoke** — Smoke-Script erneut gegen staging, Protokoll `docs/22.05.2026/cmm44-spj-smoke-pr3.md`.

---

## Task 7: Abschluss

- [ ] **Step 1: Phase-1-Mapping** — `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` Update-Block: „SP-J erledigt — 12 Abrechnung/Zahlung-Spalten auf claims (Verdikt-Korrektur abrechnungen→claims). PR1 #/PR2 #/PR3 #."
- [ ] **Step 2: Handoff** — `docs/22.05.2026/handoff-cmm44-spj-abschluss.md` (was erledigt, Verify, Lessons: Verdikt-Korrektur, CLAIM_OWNED_DUPLICATE_COLUMNS-Routing, 1:1 simpler als SP-H).
- [ ] **Step 3: Memory** — `project_cmm44_spj_status.md` schreiben + MEMORY.md-Pointer. Coordination-Marker `COORDINATION-active-spj.md` löschen.
- [ ] **Step 4: Commit + PR** — `git add docs/ && git commit -m "docs(CMM-44): SP-J erledigt — Handoff + Phase-1-Mapping" && git push && gh pr create --base staging`
- [ ] **Step 5: Session-Abschluss-Checkliste** — `git status` clean, `git stash list` (eigene?), `git log --branches --not --remotes`.

---

## Definition of Done
- [ ] 12 Spalten live auf claims (Typen/FK gespiegelt); Backfill verifiziert.
- [ ] 3 Views sourcen die 12 aus claims.
- [ ] 12 in CLAIM_OWNED_DUPLICATE_COLUMNS; vitest grün (Routing-Case + AUFTRAEGE-Disjunktheit).
- [ ] Re-Grep 0 live faelle-Zugriffe der 12; `npm run build` grün.
- [ ] PR3 appliziert + recorded.
- [ ] 5-Portal-Smoke 0 SP-J-Regression (Screenshots ausgewertet).
- [ ] Phase-1-Mapping + Handoff + Memory nachgezogen.

## Selbst-Review (Plan vs. Spec)
- **Spec §1 Scope (12 Spalten → claims, additiv)** — Task 1 ADD-Block deckt die 12; Verdikt-Korrektur in Spec §1 + Task-1-Header. ✅
- **Spec §3a Zentrale-Writer-Routing** — Task 4 Step 1 (Set) + Step 2 (vitest-Case). ✅
- **Spec §3b View-Repoint (3 Views)** — Task 1 Step 3 + Block 3. ✅
- **Spec §3c voller Sweep** — Task 3 (Inventur) + Task 4 (A/B/C2/D-Transform, Re-Grep 0). ✅
- **Spec §4 Migrations-Vorgehen (CLI apply+repair, kein db push)** — Task 1 Step 6, Task 2 Step 2, Task 6. ✅
- **Spec §5 3-PR** — Task 1-2 (PR1), 3-5 (PR2), 6 (PR3). ✅
- **Spec §6 Error-Handling** — Task 4 Step 3 (Result-Object/throw je File; claims-Writes error-guarded). ✅
- **Spec §7 Testing** — Task 4 Step 2 (vitest) + Task 5/6 Step 7 (Smoke). ✅
- **Spec §8 Risiken (Finance-Flux, Drift-Recheck)** — Task 0 + Task 2 Step 1 + Task 3 Drift. ✅
- **Spec §9 DoD** — 1:1 in DoD oben übernommen. ✅
- **Placeholder-Scan:** ADD-Typen/Defaults/FK + View-Bodies sind explizit als „live in Task 0/1 messen + abgleichen" markiert (kein blindes Raten) — kein Platzhalter, sondern Mess-Anweisung mit konkretem Befehl. ✅
- **Typ-Konsistenz:** Spaltennamen identisch über alle Tasks; `splitOrKeepFaelleUpdate`/`CLAIM_OWNED_DUPLICATE_COLUMNS` exakt wie im Modul. ✅

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
