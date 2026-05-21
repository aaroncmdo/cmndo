# CMM-44 SP-C1 — Kunde-Snapshot → claim_parties (geschaedigter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 7 `faelle.kunde_*`-Snapshot-Felder (vorname/nachname/telefon/strasse/plz/stadt/adresse) auf `claim_parties` (rolle=`geschaedigter`) umstellen — **Reader/Writer-Switch + Backfill, kein ADD** (Zielspalten + 45 geschaedigter-Zeilen existieren).

**Architecture:** PR1 = Backfill-Migration (COALESCE `faelle.kunde_*` → existierende geschaedigter-Partei, 1:1 pro Claim) + ggf. View-Repoint. PR2 = Reader/Writer-Sweep code-only (`faelle.kunde_X` → `claim_parties` rolle=geschaedigter; Rename `kunde_vorname`→`vorname` etc.; bestehende profile/lead-Fallbacks erhalten). PR3 = idempotenter COALESCE-Catch-up. **Rein additiv** — `faelle.kunde_*` bleibt bis Phase 6. Kein `ADD COLUMN`, keine Types-Regen (kein Schema-Change).

**Tech Stack:** Next.js 15, TypeScript, `@supabase/supabase-js`, Supabase CLI (Migrations), Postgres, Playwright (Smoke).

**Spec:** `docs/superpowers/specs/2026-05-21-cmm44-spc1-kunde-geschaedigter-design.md`

---

## Vorbedingungen & Kontext
- **Worktree:** `.claude/worktrees/cmm-44-spd`, Branch `kitta/cmm-44-spc1-kunde-geschaedigter` off `origin/staging`. Pro PR eigener Branch off `staging`. PRs `--base staging`.
- **Harte Regeln (AGENTS.md):** Nie `main`-Push. DDL nur via supabase-CLI (`db query --linked` + `migration repair`, kein `db push`). Kein unbegleiteter Stash.
- **Worktree-Setup:** `.env.local` + `supabase/.temp/` aus Haupt-Repo (bereits im Worktree). `db query --linked` läuft.
- **db query Multi-Statement-Falle:** mehrere SELECTs → nur letztes Resultset. Measure/Verify als **ein** UNION-ALL.
- **Spec-Review-Sichtbarkeit:** Spec/Plan-Branch **pushen**, damit Aaron das File sieht ([[feedback_push_specs_for_review]]).
- **Commit:** 7-Punkte-Audit-Block; Englisch oder echte Umlaute.
- **PR-Hygiene:** Auto-Merge WIDERRUFEN. Push → Review → PR. Aaron mergt selbst.
- **Bestehendes Muster:** `src/lib/claims/kunde-ownership.ts` + `get-kunde-faelle.ts` lesen die geschaedigter-Partei (`claim_parties` `.eq('user_id',uid).eq('rolle','geschaedigter')`). Reader-Switch folgt diesem Muster (claim-zentriert: `.eq('claim_id', claimId).eq('rolle','geschaedigter')`).

## Referenz: 7 Spalten (Rename-Mapping)
| `faelle` | → `claim_parties` (rolle=geschaedigter) |
|---|---|
| `kunde_vorname` | `vorname` |
| `kunde_nachname` | `nachname` |
| `kunde_telefon` | `telefon` |
| `kunde_strasse` | `adresse_strasse` |
| `kunde_plz` | `adresse_plz` |
| `kunde_stadt` | `adresse_ort` |
| `kunde_adresse` | (Legacy-Kombifeld; Reader-Fallback → `adresse_strasse` wenn `kunde_strasse` leer; kein eigenes Backfill-Ziel) |

Live (2026-05-21): faelle hat die 7; claim_parties hat vorname/nachname/telefon/adresse_strasse/adresse_plz/adresse_ort; 45 geschaedigter-Zeilen (1:1).

## Transform-Regelwerk (PR2)
| Muster | Transform |
|---|---|
| **A — Read nur kunde_*** | `from('claim_parties').select('vorname,nachname,telefon,adresse_strasse,adresse_plz,adresse_ort').eq('claim_id', claimId).eq('rolle','geschaedigter').maybeSingle()`; Property `kunde_vorname`→`vorname` beim Konsumenten. null-safe. |
| **B — Read gemischt** | non-kunde-Cols bleiben auf faelle; kunde-Cols via separate geschaedigter-Query (deterministisch, da 1:1) ODER nested `claims:claim_id(claim_parties(...))` + Array-Normalisierung + `rolle==='geschaedigter'`-Filter im Code. |
| **C — Write kunde_*** | auf geschaedigter-Zeile schreiben: `from('claim_parties').update({vorname,…}).eq('claim_id',X).eq('rolle','geschaedigter')`; kunde-Cols aus faelle-Write entfernen. Falls keine geschaedigter-Zeile: `console.warn`+skip. Kein Dual-Write. Guarded. |
| **Fallback erhalten** | Viele Stellen lesen `fall.kunde_vorname ?? profile.vorname ?? lead.vorname`. Nur die `faelle.kunde_*`-Quelle → cp; profile/lead-Zweig **unverändert**. |
| **View-Read (E)** | PR1 repointed → kein Code-Change. |
| **Typ/Property (F)** | Rename nachziehen; kein DB-Query → nur Property-Umbenennung. |

**Verify PR2:** paren-balanced Re-Grep 0 live `faelle`-Zugriffe der 7 kunde-Snapshot-Cols. `tsc --noEmit` + `npm run build` (CI-Gate).

## File Structure
**Neu:** `scripts/cmm44-spc1-measure.sql`, `scripts/cmm44-spc1-verify.sql`, `scripts/cmm44-spc1-grep.mjs`, `supabase/migrations/<ts>_cmm44_spc1_backfill_geschaedigter.sql` (PR1), `supabase/migrations/<ts>_cmm44_spc1_catchup.sql` (PR3), `docs/21.05.2026/cmm44-spc1-{views-audit,inventory,smoke}.md`, `scripts/smoke-cmm44-spc1.mjs`.
**Modifiziert (PR2):** `src/`-Files mit `faelle.kunde_*`-Snapshot-Zugriff (Inventur Task 3). **Keine** `database.types.ts`-Änderung (kein Schema-Change).

---

## Task 0: Live-Drift-Check
**Files:** Create `scripts/cmm44-spc1-measure.sql`.
- [ ] **Step 1: Measure-Script (UNION-ALL)**
```sql
SELECT 'faelle_kunde_cols' AS k, count(*)::text AS v FROM information_schema.columns WHERE table_schema='public' AND table_name='faelle' AND column_name IN ('kunde_vorname','kunde_nachname','kunde_telefon','kunde_strasse','kunde_plz','kunde_stadt','kunde_adresse')
UNION ALL SELECT 'cp_target_cols', count(*)::text FROM information_schema.columns WHERE table_schema='public' AND table_name='claim_parties' AND column_name IN ('vorname','nachname','telefon','adresse_strasse','adresse_plz','adresse_ort')
UNION ALL SELECT 'geschaedigter_rows', (SELECT count(*)::text FROM public.claim_parties WHERE rolle='geschaedigter')
UNION ALL SELECT 'claims_ohne_geschaedigter', (SELECT count(*)::text FROM public.claims c WHERE NOT EXISTS (SELECT 1 FROM public.claim_parties cp WHERE cp.claim_id=c.id AND cp.rolle='geschaedigter'));
```
- [ ] **Step 2: Run** — `npx supabase db query --linked --file scripts/cmm44-spc1-measure.sql 2>&1 | grep -E '"k"|"v"'`. Expected: `faelle_kunde_cols=7`, `cp_target_cols=6`, `geschaedigter_rows`≈45. `claims_ohne_geschaedigter` notieren (die kriegen kein Backfill — kein Row-Create in SP-C1).
- [ ] **Step 3: Commit** (Script; 7-Punkte-Audit n/a außer Spec).

## Task 1: PR1 — View-Audit + Backfill-Migration + Dry-Run
**Branch:** `kitta/cmm-44-spc1-pr1-backfill`, frisch von `kitta/cmm-44-spc1-kunde-geschaedigter`.
- [ ] **Step 1: Branch** — `git fetch origin && git checkout -b kitta/cmm-44-spc1-pr1-backfill kitta/cmm-44-spc1-kunde-geschaedigter`
- [ ] **Step 2: View-Audit** — welche Views exponieren die 7 kunde-Snapshot-Cols aus `f.`?
```bash
cat > /tmp/spc1-va.sql <<'SQL'
SELECT c.table_name AS view_name, c.column_name FROM information_schema.columns c
JOIN information_schema.views v ON v.table_schema=c.table_schema AND v.table_name=c.table_name
WHERE c.table_schema='public' AND c.column_name IN ('kunde_vorname','kunde_nachname','kunde_telefon','kunde_strasse','kunde_plz','kunde_stadt','kunde_adresse')
ORDER BY c.table_name, c.column_name;
SQL
npx supabase db query --linked --file /tmp/spc1-va.sql 2>&1 | tail -30
```
Pro Treffer `pg_get_viewdef` prüfen, in `docs/21.05.2026/cmm44-spc1-views-audit.md` festhalten. Repoint via `LEFT JOIN claim_parties cp_g ON cp_g.claim_id=<claim> AND cp_g.rolle='geschaedigter'` + `f.kunde_X` → `cp_g.<col> AS kunde_X` (Output-Name unverändert). 1:1 → einfacher LEFT JOIN. Leere Liste → kein View-Block.
- [ ] **Step 3: Verify-Script** `scripts/cmm44-spc1-verify.sql`:
```sql
SELECT 'geschaedigter_mit_vorname' AS k, count(*)::text AS v FROM public.claim_parties WHERE rolle='geschaedigter' AND vorname IS NOT NULL
UNION ALL SELECT 'mismatch_vorname', (SELECT count(*)::text FROM public.claim_parties cp JOIN public.faelle f ON f.claim_id=cp.claim_id WHERE cp.rolle='geschaedigter' AND f.kunde_vorname IS NOT NULL AND cp.vorname IS NOT NULL AND cp.vorname IS DISTINCT FROM f.kunde_vorname);
```
- [ ] **Step 4: Werte-Konsistenz prüfen** (vor Backfill) — `mismatch_vorname` aus Verify-Script: wo cp.vorname UND faelle.kunde_vorname beide gesetzt aber verschieden sind. Erwartung gering (Snapshot). Bei vielen Mismatches: mit Aaron klären welche Quelle gewinnt (Plan nimmt cp-gewinnt via COALESCE — füllt nur NULLs).
- [ ] **Step 5: Backfill-Migration**
```bash
npx supabase migration new cmm44_spc1_backfill_geschaedigter
```
Inhalt (in BEGIN/COMMIT; **kein ADD**):
```sql
-- CMM-44 SP-C1 PR1 — Backfill kunde-Snapshot -> claim_parties (geschaedigter).
-- COALESCE: cp gewinnt (SSoT-Partei), faelle.kunde_* fuellt nur cp-NULL-Luecken. 1:1.
-- Kein Row-Create (geschaedigter existiert pro Claim; claims_ohne_geschaedigter -> skip).
-- Optional: View-Repoint Block (nur falls Audit Treffer). Nach Apply: migration repair.
BEGIN;
UPDATE public.claim_parties cp SET
  vorname         = COALESCE(cp.vorname, f.kunde_vorname),
  nachname        = COALESCE(cp.nachname, f.kunde_nachname),
  telefon         = COALESCE(cp.telefon, f.kunde_telefon),
  adresse_strasse = COALESCE(cp.adresse_strasse, f.kunde_strasse, f.kunde_adresse),
  adresse_plz     = COALESCE(cp.adresse_plz, f.kunde_plz),
  adresse_ort     = COALESCE(cp.adresse_ort, f.kunde_stadt)
FROM public.faelle f
WHERE cp.claim_id = f.claim_id AND cp.rolle = 'geschaedigter';
-- (View-Repoint hier, falls Step-2-Audit Treffer: CREATE OR REPLACE VIEW … LEFT JOIN claim_parties cp_g …)
COMMIT;
```
- [ ] **Step 6: Dry-Run** — `MIG=$(ls supabase/migrations/*_cmm44_spc1_backfill_geschaedigter.sql|tail -1); sed 's/^COMMIT;/ROLLBACK;/' "$MIG" > /tmp/spc1-dry.sql; npx supabase db query --linked --file /tmp/spc1-dry.sql 2>&1 | tail -8`. Expected: kein Fehler.
- [ ] **Step 7: Commit** (measure/verify/audit/migration; NICHT appliziert; 7-Punkte-Audit).

## Task 2: PR1 — Apply + Verify + Push (KEIN PR / KEINE Types-Regen)
**Branch:** `kitta/cmm-44-spc1-pr1-backfill`.
- [ ] **Step 1: Drift-Recheck** (measure).
- [ ] **Step 2: Apply + repair** — `npx supabase db query --linked --file "$MIG"`; `npx supabase migration repair --status applied <TS>`.
- [ ] **Step 3: Verify** — `cmm44-spc1-verify.sql`: `geschaedigter_mit_vorname` ≥ vorher; `mismatch_vorname` unverändert (COALESCE überschreibt nichts).
- [ ] **Step 4: Push (KEIN PR)** — `git push -u origin kitta/cmm-44-spc1-pr1-backfill`. Keine `database.types.ts`-Änderung (kein Schema-Change). Build optional (kein Code-Change in PR1 wenn View-Block leer; sonst `npm run build`).
- [ ] **Step 5: PR öffnen NACH Review** — `gh pr create --base staging --title "CMM-44 SP-C1 PR1 — Backfill kunde-Snapshot -> claim_parties (geschaedigter)" --body "Backfill COALESCE; kein ADD/Schema-Change. Migration appliziert+repair. Spec: …spc1…"`.
> **GATE:** Task 3 (PR2) nach PR1-staging-Merge.

## Task 3: PR2 — Inventur (paren-balanced)
**Branch:** `kitta/cmm-44-spc1-pr2-sweep`, frisch von `origin/staging`.
- [ ] **Step 1: Branch.**
- [ ] **Step 2: Grep-Skript** `scripts/cmm44-spc1-grep.mjs` (analog `scripts/cmm44-spd-grep.mjs`, COLS = die **7** kunde-Snapshot-Cols; `stripSubEmbeds` entfernt `claims:claim_id(...)` + `claim_parties(...)`):
```javascript
#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'
const COLS=['kunde_vorname','kunde_nachname','kunde_telefon','kunde_strasse','kunde_plz','kunde_stadt','kunde_adresse']
function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(['node_modules','.next','.claude'].includes(e.name))continue;walk(p,o)}else if(/\.(ts|tsx|mjs|js)$/.test(e.name))o.push(p)}return o}
function stripSub(s){let prev='';while(prev!==s){prev=s;s=s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g,'');s=s.replace(/\bclaim_parties\s*\(([^()]|\([^()]*\))*\)/g,'')}return s}
const fromRe=/\.from\(['"]faelle['"]\)/g,nestedRe=/\bfaelle\s*\(/g,hits=[]
for(const f of walk('src')){const s=fs.readFileSync(f,'utf8');let m;fromRe.lastIndex=0
 while((m=fromRe.exec(s))){const w=stripSub(s.slice(m.index,m.index+1500));for(const c of COLS){if(new RegExp('\\b'+c+'\\b').test(w)){hits.push(f+':'+s.slice(0,m.index).split('\n').length+' | '+c+" | from('faelle')");break}}}
 nestedRe.lastIndex=0;while((m=nestedRe.exec(s))){let d=1,e=m.index+m[0].length;while(e<s.length&&d>0){if(s[e]==='(')d++;else if(s[e]===')')d--;e++}const w=stripSub(s.slice(m.index+m[0].length,e-1));for(const c of COLS){if(new RegExp('\\b'+c+'\\b').test(w)){hits.push(f+':'+s.slice(0,m.index).split('\n').length+' | '+c+' | nested faelle(...)');break}}}}
console.log(hits.join('\n'));console.log('\nTOTAL: '+hits.length)
```
- [ ] **Step 3: Inventur fahren + klassifizieren** (A/B/C, Fallback-Sites markieren). False-Positive-Triage (Spaltenname nahe faelle-Query ≠ faelle-Select; pro Hit File aufschlagen — SP-D-Lesson). Doc `docs/21.05.2026/cmm44-spc1-inventory.md`. Commit.

## Task 4: PR2 — Transform + Build + Push (KEIN PR)
- [ ] **Step 1: Transform pro Site** (Regelwerk A/B/C). Beispiel A:
```typescript
// NACHHER
let geschaedigter: { vorname: string|null; nachname: string|null; telefon: string|null } | null = null
if (claimId) {
  const { data } = await db.from('claim_parties')
    .select('vorname, nachname, telefon, adresse_strasse, adresse_plz, adresse_ort')
    .eq('claim_id', claimId).eq('rolle','geschaedigter').maybeSingle()
  geschaedigter = data
}
const vorname = geschaedigter?.vorname ?? profile?.vorname ?? null  // bestehenden Fallback erhalten
```
Beispiel C:
```typescript
const { data: fall } = await db.from('faelle').select('claim_id').eq('id', fallId).single()
if (fall?.claim_id) {
  const { error } = await db.from('claim_parties').update({ vorname, nachname, telefon })
    .eq('claim_id', fall.claim_id).eq('rolle','geschaedigter')
  if (error) return { ok:false, error: error.message }
}
```
- [ ] **Step 2: tsc** — `npx tsc --noEmit` 0 Fehler (Property-Renames nachgezogen).
- [ ] **Step 3: Re-Grep** — `node scripts/cmm44-spc1-grep.mjs` → 0 echte faelle-kunde-Reads/Writes (FPs triagieren).
- [ ] **Step 4: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | tail -10` (CI-Gate wenn lokal require-in-the-middle-Block).
- [ ] **Step 5: Commit + Push (KEIN PR).**
- [ ] **Step 6: PR öffnen NACH Review** — `--base staging`.
> **GATE:** Task 5 nach PR2-staging-Merge.

## Task 5: PR2 — Portal-Smoke
- [ ] **Step 1: Smoke-Script** `scripts/smoke-cmm44-spc1.mjs` (analog `smoke-cmm44-spd.mjs`): Kunde-Stammdaten/Profil, Fallakte-Kundendaten (Admin/Dispatch `/faelle/[id]`), SV-Kundenanzeige. Detekt 5xx/pageerror/„undefined".
- [ ] **Step 2: Smoke gegen `app.staging.claimondo.de`** (`node --env-file=.env.local scripts/smoke-cmm44-spc1.mjs`). Screenshots im selben Turn auswerten ([[feedback_smoke_screenshot_pflicht]]) — Kundendaten korrekt angezeigt (aus cp geschaedigter).
- [ ] **Step 3: Commit Smoke-Protokoll + Push.**
> **GATE:** Task 6 nach PR2-main.

## Task 6: PR3 — Catch-up
**Branch:** `kitta/cmm-44-spc1-pr3-catchup` off `origin/staging`.
- [ ] **Step 1: Branch + inhaltsbasierter Gate-Check** (`git diff origin/main origin/staging -- src/`).
- [ ] **Step 2: Migration** — idempotenter Re-COALESCE (identisch Task 1 Step 5 UPDATE-Block).
- [ ] **Step 3: Dry-Run → Apply → repair → Verify.**
- [ ] **Step 4: Commit + Push + PR NACH Review.** Finaler Smoke.

## Task 7: Abschluss
- [ ] **Step 1:** Phase-1-Mapping-Update-Block (`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`): SP-C1 erledigt, 7 kunde-Snapshot → cp geschaedigter; SP-C2 (gegner) + SP-C3 (halter) offen.
- [ ] **Step 2:** Handoff `docs/21.05.2026/handoff-cmm44-spc1-abschluss.md` (Lessons: 1:1-geschaedigter, COALESCE-cp-gewinnt, Fallback-Erhalt, kein Row-Create).
- [ ] **Step 3:** Memory `project_cmm44_spc_status.md` + MEMORY.md-Pointer.
- [ ] **Step 4:** Commit + Abschluss-PR.
- [ ] **Step 5:** Session-Abschluss-Checkliste (git status / stash list / unpushed).

## Definition of Done
- [ ] PR1 gemergt; Backfill: geschaedigter-Parteien mit kunde-Snapshot-Werten (COALESCE); kein ADD.
- [ ] PR2 gemergt; Re-Grep 0 live `faelle.kunde_*`-Snapshot-Zugriffe; Property-Renames durch.
- [ ] PR3 appliziert + recorded.
- [ ] `tsc`/Build grün. Portal-Smoke 0 Hard-Fail (Kundendaten korrekt aus cp).
- [ ] Phase-1-Mapping + Handoff + Memory nachgezogen.

## Selbst-Review (Plan vs. Spec)
- **Spec §2 (7 Cols Rename-Map)** → Referenz-Tabelle + Backfill Step 5 + Regelwerk. ✅
- **Spec §2 Ausschluss kunde_id/email/lat/lng/match_via** → COLS in grep/measure = nur die 7; Non-Goals respektiert. ✅
- **Spec §3 Backfill COALESCE 1:1 geschaedigter, kein Row-Create** → Task 1 Step 5 + `claims_ohne_geschaedigter`-Skip (Task 0). ✅
- **Spec §4 Reader/Writer-Switch + Fallback-Erhalt** → Regelwerk A/B/C + Fallback-Zeile + Task 4 Beispiele. ✅
- **Spec §5 Views** → Task 1 Step 2 (Audit + LEFT JOIN geschaedigter, konditional). ✅
- **Spec §6 3-PR, kein ADD/Types-Regen** → Task 1-2 (PR1 backfill), 3-4 (PR2 sweep), 6 (PR3); Task 2 Step 4 „keine Types-Regen". ✅
- **Spec §8 Verifikation** → measure/verify (Task 0/1), Werte-Konsistenz (Task 1 Step 4), Re-Grep (Task 4), Smoke (Task 5). ✅
- **Keine Placeholders** — View-Block explizit konditional; grep-Skript vollständig; Backfill/Catch-up SQL vollständig. ✅
- **Typ-Konsistenz** — `geschaedigter`-Filter (`.eq('rolle','geschaedigter')`), Rename `kunde_X`→cp-Spalte durchgängig. ✅

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
