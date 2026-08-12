# CMM-49 faelle-Drop Landmines Implementation Plan

> # ✅ UEBERHOLT (verifiziert 2026-08-11) — NICHT MEHR AUSFUEHREN
>
> **Die Praemisse haelt, der geplante Guard ist redundant.**
>
> * **Ground-Truth bestaetigt** (gegen `origin/staging`, 11.08.): `git grep "from('faelle')" -- 'src/**'`
>   liefert ausschliesslich **Kommentare** (`// CMM-49 (faelle-Drop-Runway): … statt .from('faelle')`).
>   **0 live Refs** — wie 2026-07-11 erhoben.
> * **`check:faelle-refs` NICHT bauen — `check:query-parse` deckt die Klasse bereits ab** (und zwar
>   breiter). Es entstand am **16.07.**, also *nach* diesem Plan, und schiesst jede statisch
>   rekonstruierbare PostgREST-Query gegen die echte DB trocken.
>
>   **Empirisch verifiziert** (11.08., Negativ-Kontrolle mit einer Scratch-Datei, danach entfernt):
>   ```
>   404 PGRST205  faelle  ⚠ NEU
>      src/__scratch-faelle-probe.ts:8, src/__scratch-faelle-probe.ts:15
>   ```
>   Gefangen wurden **beide** Varianten — Zeile 8 = getypter `createClient()`, Zeile 15 =
>   **ungetypter `createAdminClient()`** (dort ist `tsc` blind, siehe Memory-Marker
>   `reference-supabase-select-strings-untyped-admin-client`). `⚠ NEU` heisst: der CI-Lauf
>   `check-query-parse.mjs --ratchet` (`.github/workflows/ci.yml:339`) haette den PR **geblockt**.
>
>   Gegenprobe: **`check:query-drift` faengt es NICHT** (4212 Query-Ketten, 0 Findings) — es prueft
>   Spalten *innerhalb bekannter* Tabellen und ignoriert unbekannte Relationen still. Die Abdeckung
>   kommt also allein von `check:query-parse`.
>
>   Vorteil gegenueber dem hier geplanten Guard: `query-parse` faengt **jede** tote Relation
>   (und tote Spalten + mehrdeutige Embeds), nicht nur den Sonderfall `faelle`. Ein eigener
>   `check:faelle-refs` waere ein schwaecheres Duplikat (Audit-Punkt 3).
> * **Task 4 (Stale-Branch-Hazard) bleibt inhaltlich gueltig:** ein Branch mit merge-base vor
>   2026-06-22 kann live `faelle`-Writes zurueckbringen. Das faengt jetzt `check:query-parse --ratchet`
>   beim PR — der Punkt ist also abgedeckt, nur durch einen anderen Guard als geplant.
>
> Konsequenz fuer Handoff-Punkt **A4**: „zwei nie gebaute Ratchet-Guards" ist auch fuer FG8 **stale**.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` syntax.
> **Isolation:** implement in a dedicated worktree (`node scripts/new-session-worktree.mjs flag-fg8-faelle-drop-landmines staging`).
> **Ownership:** belongs to the CMM-49 faelle-drop program — coordinate with / hand to that lane; do NOT race their migration.

**Goal:** Prove there are zero live `faelle`-table code references remaining after the CMM-49 `faelle` DROP, and install a permanent regression guard so no new code can reintroduce a `.from('faelle')` call (the table is already gone; a new reference is an instant prod `42P01`).

**Architecture:** This is a **verification + drift-guard** plan, NOT a data/column migration. Ground-truth verification (2026-07-11) established that the `faelle` **table is already dropped in prod** (migration `20260622140745_cmm49_drop_faelle_table_and_orphaned_sync_fns`, merged via PR #3082 on 2026-06-22) and that `origin/main` contains **zero live `.from('faelle')` calls** — every remaining occurrence is a historical `//`/JSDoc comment. The "landmines" cited in the source spec are artifacts of reading the **stale `aar-956` branch** (5 208 commits behind main; merge-base 2026-06-14, i.e. *before* the drop). The deliverable is therefore (1) a documented re-verification against the CMM-49 lane's actual base branch, and (2) a new `check:faelle-refs` guard (baseline-0, ratchet in CI, `--warn` locally) analogous to the existing `check:knip` / `check:component-set` / `check:token-audit` drift bremsen.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, vitest.

## Global Constraints
- Never push to `main`; feature branch → PR against `staging`; merge after review (Regel 1).
- DDL **only** via `mcp__plugin_supabase_supabase__apply_migration` (Regel 2). **This plan has NO DDL** — the DROP is already done and owned by CMM-49. Do not re-run it.
- `execute_sql` is READ-ONLY here (schema verification only).
- Server-actions return `{ ok, error? }` (or `{ success }` in older files — stay consistent per file) + `revalidatePath`. **This plan touches no server-actions.**
- Frontend user-facing strings use real umlauts (ä/ö/ü/ß). **This plan produces no user-facing strings** (guard script + tests only; script output is dev-log ASCII, allowed).
- Node scripts (`scripts/*`), `*.config`, sentry/instrumentation belong in top-level `ignore` for knip, not `project` (knip JSON-reporter gotcha) — the new script must be knip-ignored so it does not itself trip the dead-code gate.
- Every commit ends with an Audit block + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **file:line references below are Stand 2026-07-11 against `origin/main`. RE-VERIFY with a fresh `git grep` before each task** — main moves fast.

---

## Context the executor MUST read first (before Task 1)

Read these to internalize why this plan is a guard and not a migration:

- `docs/superpowers/specs/2026-07-11-interaction-flags-db-driven-audit-design.md` — the parent audit (§5 trap #13, §7 FG8). Note its FG8 premise ("still WRITES faelle … breaks when faelle is dropped") was written against a stale branch and is **superseded by the ground-truth below**.
- `src/lib/faelle/claim-duplicate-columns.ts` — CMM-49's own column-routing machinery (`CLAIM_OWNED_DUPLICATE_COLUMNS`, `splitOrKeepFaelleUpdate`, `AUFTRAEGE_OWNED_COLUMNS`, `CLUSTER1/2/3_RENAMED_TO_CLAIMS`). This is the CMM-49 lane's surface; **FG8 does not touch it.**
- Existing guard scripts to mirror: `scripts/check-knip.mjs`, `scripts/check-token-audit.mjs` (or `.js`), `scripts/check-component-set.mjs`. Copy the `--warn` (exit 0 local) / `--ratchet` (exit 1 CI) / `--update-baseline` convention and the `package.json` wiring.

### Ground-truth verification already performed (2026-07-11, do NOT re-derive from scratch — re-confirm)

| Fact | Evidence |
|---|---|
| `faelle` table **does not exist** in prod | `SELECT count(*) FROM faelle` → `ERROR 42P01: relation "faelle" does not exist`; `pg_class` WHERE relname='faelle' → `[]` (project `paizkjajbuxxksdoycev`) |
| DROP is tracked + deployed | `supabase_migrations.schema_migrations` row `20260622140745 cmm49_drop_faelle_table_and_orphaned_sync_fns`; commit `64458e735` / PR #3082 "DROP TABLE faelle — Capstone" |
| `origin/main` has **0 live `.from('faelle')` calls** | `git grep -nE "from\('faelle'\)\.(update\|insert\|delete\|upsert\|select)" origin/main -- 'src/**'` → only `//` + JSDoc comments (`kunde-ownership.ts:4`, `lead-fall-mapping.ts:355`). Multiline `from('faelle')$` → only comments. |
| Views that STAY (safe, still queried) | `v_faelle_mit_aktuellem_termin` (relkind `v`), `faelle_kunde_view` (`v`), `faelle_sv_view` (`v`), `v_claim_full` (`v`), `faelle_claim_bridge` (base table `r`) all present in `pg_class`. |
| Cited "landmines" live only on stale `aar-956` | `git rev-list --count HEAD..origin/main` = 5208; merge-base date 2026-06-14 (pre-drop). On main, `ocr-trigger` writes `claim_parties`/`personen`, `ocr-fahrzeugschein`/`ocr-gutachten` anchor `faelle_claim_bridge` + write `claims`/`vehicles`. |
| Generated types already `faelle`-free | `git grep -nE "^\s+faelle:\s*\{" origin/main -- '**/database.types.ts'` → empty (no `faelle` Row/Insert/Update). |

**Implication:** the risk is **not** "breaks at drop-time" — the drop is done. The residual risk is (a) a *new* `.from('faelle')` slipping in via copy-paste from old code/docs/AI-memory → instant `42P01` at runtime, and (b) the stale `aar-956` branch (or any long-lived pre-2026-06-22 branch) carrying live `faelle` writes that would resurrect the table reference on merge. The guard addresses (a); Task 4 documents (b) as a coordination hand-off, not a code fix on this branch.

---

## File Structure

```
scripts/
  check-faelle-refs.mjs           # NEW — the drift guard (baseline-0 ratchet)
  faelle-refs-baseline.json       # NEW — baseline (should be {} / [] = zero live refs)
  __tests__/
    check-faelle-refs.test.ts     # NEW — vitest around the pure detection fn
package.json                      # EDIT — add "check:faelle-refs" script + CI hook
scripts/check-knip.mjs            # EDIT (1 line) — ignore scripts/check-faelle-refs.mjs
docs/superpowers/
  2026-07-11-fg8-faelle-drop-verification-report.md  # NEW — the coordination hand-off artifact
```

Guard design (mirror `check-knip.mjs` conventions):
- **Pure core** exported for tests: `findLiveFaelleRefs(files: {path,content}[]): Violation[]` where `Violation = { file: string; line: number; text: string }`.
- **Detection rule:** a line is a *live* `faelle`-table reference iff it matches `.from('faelle')` (single- or the-`from('faelle')`-at-EOL multiline form) **AND** is not a comment line (`//`, ` * `, `/*`, leading `*`) and not inside a template/JSDoc block. Deliberately NARROW to `.from('faelle')` — the string literal `'faelle'` passed to the PostgREST client is the only thing that produces a runtime table hit. Do **NOT** flag: `faelle_claim_bridge`, `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_*` (all live, valid relations), the word "faelle" in comments/paths/route-segment `app/**/faelle/**`, or column names.
- **Scope:** `src/**` only (mirrors token-audit; marketing / cluster-LPs excluded).
- **Modes:** no flag → `--warn` (print, exit 0); `--ratchet` → exit 1 if `violations.length > baseline.length`; `--update-baseline` → write current violations to `faelle-refs-baseline.json`. Baseline seeded to `[]` (zero live refs on main today).

---

## Tasks (bite-sized, TDD)

### Task 0 — Re-verify ground truth on the CMM-49 lane's ACTUAL base branch

> The verification above is against `origin/main` at 2026-07-11. Before writing any guard, confirm nothing changed and identify the branch the CMM-49 lane actually works from (it may be a `cmm49/*` integration branch ahead of main). No code in this task.

- [ ] Re-run: `git fetch origin && git grep -nP "from\('faelle'\)\s*$" origin/main -- 'src/**'` and `git grep -nE "from\('faelle'\)\.(update|insert|delete|upsert|select)" origin/main -- 'src/**'`. Confirm **every** hit is a comment (`//`, ` * `, `/*`). If ANY non-comment hit exists → STOP, that is a real live landmine; escalate to the CMM-49 lane and expand this plan with a reader-first migration task for it (pattern: anchor `faelle_claim_bridge` → `claims`, exactly like the sibling call-sites already migrated).
- [ ] Re-confirm the table is gone: `execute_sql` (READ) `SELECT to_regclass('public.faelle') AS faelle_relid;` → expect `null`. Re-confirm the stay-views exist: `SELECT relname, relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relname IN ('v_faelle_mit_aktuellem_termin','faelle_kunde_view','faelle_sv_view','faelle_claim_bridge');` → expect 4 rows.
- [ ] Identify the CMM-49 owning lane's base branch (check `…/memory/` markers for `cmm49`/CMM-49 coordination + recent `origin/cmm49*`/`origin/kitta/*cmm49*` branches). Record it in the verification report (Task 4). **If that branch has live `faelle` refs that main does not, the guard baseline must be captured against it in coordination with that lane — do not silently diverge.**
- [ ] Commit: `docs(fg8): record faelle-drop ground-truth re-verification` (report stub only, or fold into Task 4). Audit block.

### Task 1 — Failing test for the detection core

Files: `scripts/check-faelle-refs.mjs` (stub export only), `scripts/__tests__/check-faelle-refs.test.ts`.

Interface:
```ts
// scripts/check-faelle-refs.mjs
export function findLiveFaelleRefs(files) { /* returns Violation[] */ }
```

- [ ] Write `scripts/__tests__/check-faelle-refs.test.ts` (vitest) with REAL fixtures — no mocks of the detector:
  - **flags** a live write: `{ path:'src/x.ts', content:"await db.from('faelle').update({ status: 'x' }).eq('id', id)" }` → 1 violation at line 1.
  - **flags** the multiline form: content `"const q = supabase\n  .from('faelle')\n  .select('id')"` → 1 violation on the `.from('faelle')` line.
  - **flags** a live select/insert/delete (parametrize).
  - **does NOT flag** a `//` line-comment mentioning `.from('faelle')` (real sample: `"//   const { data } = await supabase.from('faelle').select('id, kunde_id')"`).
  - **does NOT flag** a JSDoc ` * ` line (real sample: `" * await admin.from('faelle').insert(fallInsert).select('id').single()"`).
  - **does NOT flag** the live sibling relations: `.from('faelle_claim_bridge')`, `.from('faelle_kunde_view')`, `.from('faelle_sv_view')`, `.from('v_faelle_mit_aktuellem_termin')`.
  - **does NOT flag** the substring in a path/segment or a plain comment `// CMM-49 (faelle-Drop-Runway): … statt .from('faelle')`.
- [ ] `npx vitest run scripts/__tests__/check-faelle-refs.test.ts` → **FAILS** (function is an empty stub). Capture the red output.
- [ ] Commit: `test(fg8): failing spec for findLiveFaelleRefs detector`. Audit block (`Build: n/a (test-only, red); Spec: detector contract per FG8 §File-Structure`).

### Task 2 — Minimal detector implementation → green

Files: `scripts/check-faelle-refs.mjs`.

- [ ] Implement `findLiveFaelleRefs` minimally: split each file into lines; for each line, `trimStart()`; skip if it starts with `//`, `*`, `/*`, or `*/`; match `/\bfrom\(\s*['"]faelle['"]\s*\)/`. (The `\bfrom\(` + quoted-exactly-`faelle` guarantees the sibling relations `faelle_claim_bridge` etc. do NOT match — different string literal.) Return `{file, line: idx+1, text: line.trim()}` for matches. Keep it line-based (no full JS parse needed — the comment-prefix skip + exact-literal match covers the real corpus verified on main).
- [ ] `npx vitest run scripts/__tests__/check-faelle-refs.test.ts` → **PASSES** (all fixtures green). Capture the green output.
- [ ] Commit: `feat(fg8): findLiveFaelleRefs detector (exact-literal .from('faelle'))`. Audit block.

### Task 3 — CLI wrapper + baseline-0 + package.json wiring + knip-ignore

Files: `scripts/check-faelle-refs.mjs` (add CLI main), `scripts/faelle-refs-baseline.json`, `package.json`, `scripts/check-knip.mjs`.

- [ ] Add a CLI `main()` to `check-faelle-refs.mjs`: glob `src/**/*.{ts,tsx,js,jsx,mjs,cjs}` (reuse the glob dep the sibling scripts use — check `check-knip.mjs`'s import; likely `fast-glob`/`globby` or Node `fs` walk), read files, call `findLiveFaelleRefs`, then:
  - default / `--warn`: print each violation as `file:line  text`; print summary; **exit 0**.
  - `--ratchet`: load `faelle-refs-baseline.json` (array of `file:line` strings or `{file,line}`); if any current violation is not in the baseline → print the NEW ones → **exit 1**; else exit 0. (Boy-Scout: current ⊆ baseline is fine, shrinking is fine.)
  - `--update-baseline`: write current violations → `faelle-refs-baseline.json`, exit 0.
  - Guard `import.meta.url === process.argv[1]`-style so importing for tests does not run `main`.
- [ ] Generate the baseline: run `node scripts/check-faelle-refs.mjs --update-baseline`. **Expect `[]`** (zero live refs). Commit the empty baseline explicitly (documents the invariant "zero, and it stays zero").
- [ ] `package.json`: add `"check:faelle-refs": "node scripts/check-faelle-refs.mjs"`. Wire it into the same CI aggregation the other `check:*` guards use (find how `check:token-audit`/`check:knip` are invoked in CI — likely a `check:all` script or the CI workflow yaml; add `check:faelle-refs -- --ratchet` alongside them). Mirror exactly; do not invent a new CI stage.
- [ ] `scripts/check-knip.mjs`: add `scripts/check-faelle-refs.mjs` (and its test) to the top-level `ignore` list so the new file is not itself flagged as an unused file (per the knip JSON-reporter workspace gotcha in AGENTS.md). Verify: `npm run check:knip` shows no new unused-file entry for it.
- [ ] Verify end-to-end:
  - `npm run check:faelle-refs` → exit 0, prints "0 live faelle refs".
  - `node scripts/check-faelle-refs.mjs --ratchet` → exit 0 (current ⊆ baseline).
  - Negative control: temporarily add `await db.from('faelle').update({})` to a scratch line in a throwaway file under `src/`, run `--ratchet` → exit 1 naming that file:line; then remove the scratch line and re-confirm exit 0. (Do NOT commit the scratch line.)
- [ ] `npx tsc --noEmit` green (no type breakage from package.json / script addition). Since no routes/layouts/server-actions changed, `tsc --noEmit` is sufficient here (per Audit §1 — full `npm run build` is only mandatory for route/layout/action changes).
- [ ] Commit: `feat(fg8): check:faelle-refs drift guard (baseline 0, CI ratchet)`. Audit block.

### Task 4 — Coordination hand-off report + close-out

Files: `docs/superpowers/2026-07-11-fg8-faelle-drop-verification-report.md`.

- [ ] Write the report capturing, for the CMM-49 lane:
  1. **Status: FG8 is a no-op migration** — `faelle` already dropped (`20260622140745` / PR #3082, 2026-06-22); `origin/main` has zero live `.from('faelle')` calls (evidence table from this plan).
  2. **New protection:** `check:faelle-refs` guard added (baseline 0, CI ratchet) so the drop cannot regress.
  3. **Outstanding coordination risk — the stale-branch resurrection hazard:** `aar-956` (and any branch whose merge-base predates 2026-06-22) still contains live `faelle` writes (e.g. on `aar-956`: `src/app/api/ocr-trigger/route.ts:131/137` write `faelle.halter_geburtsdatum`; `ocr-gutachten/route.ts:156`, `ocr-fahrzeugschein/route.ts:71`, `create-for-fall.ts:150`, `sv-lead-ablehn-actions.ts:102`, `kanzlei-wunsch/actions.ts:556/639` (smoke), `VorOrtPanel.tsx:65`, `stammdaten.ts:335`, `OcrAutoFillModal.tsx:118`, `gutachter/team/actions.ts:68`, `lexdrive/process-event.ts:776/882` via `splitOrKeepFaelleUpdate`). These are **already superseded on main** — the fix is *rebase/merge main into those branches*, NOT re-migrating them here. Flag that the new `check:faelle-refs --ratchet` will (correctly) block any such branch's PR until it rebases.
  4. **Recommendation:** the CMM-49 lane **owns/reviews** this guard; recommend they also add the drop-migration FILE reconciliation if it is still missing from the tree (the DB tracks `20260622140745` but no matching `supabase/migrations/*_cmm49_drop_faelle_table_*.sql` file was found on `aar-956` — verify on the CMM-49 base branch; if absent there too, that is a **Twin-Drift** to fix in the CMM-49 lane per AGENTS.md Regel 2, NOT via re-applying DDL). This is out of FG8's write-scope (Regel 2: no DDL here) but must be surfaced.
- [ ] Post a coordination marker under `…/memory/` for the CMM-49 lane (short one-liner index entry + this report path), per the audit spec §9 "Marker unter …/memory/" convention.
- [ ] Commit: `docs(fg8): CMM-49 faelle-drop verification + guard hand-off`. Audit block.

### Task 5 — Finish the branch

- [ ] Run the full guard suite once more: `npm run check:faelle-refs`, `npm run check:knip`, `npx tsc --noEmit`, and `npx vitest run scripts/__tests__/check-faelle-refs.test.ts` — all green. Capture outputs (verification-before-completion: evidence, not assertion).
- [ ] `git status` clean; `git stash list` empty (Regel 3); all commits pushed.
- [ ] Open PR against `staging`, title `feat(fg8): CMM-49 faelle-drop landmine guard + verification`, body summarizing "no live landmines on main; added regression ratchet; hand-off to CMM-49 lane". Tag/request the CMM-49 lane as reviewer. PR body ends with the Claude Code footer.

---

## Self-Review (run before declaring done)

1. **Did I actually change any `faelle` write?** No — and that is correct. Verification proved main has none. If Task 0 had found a live write, the plan would have grown a reader-first migration task (anchor `faelle_claim_bridge` → `claims`); it did not.
2. **Is the guard NARROW enough to avoid false positives on the live siblings?** The regex matches only the exact literal `from('faelle')`/`from("faelle")`; `faelle_claim_bridge`, `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin` are different literals and MUST NOT be flagged. Comment-prefix skip covers the ~34 historical `// … statt .from('faelle')` lines. Test fixtures assert both directions.
3. **Is the guard WIDE enough?** It catches the only thing that produces a runtime `42P01`: a PostgREST `.from('faelle')`. Raw-SQL `FROM faelle` in a `.rpc()`/SQL string is not currently present on main (checked) and is CMM-49-migration territory, not FG8; note it as a residual in the report rather than over-engineering the detector.
4. **DDL?** None. The DROP (`20260622140745`) is done and owned by CMM-49. The plan explicitly forbids re-applying it. Any missing migration FILE is surfaced as a CMM-49 Twin-Drift item, not fixed by re-running DDL.
5. **Boundaries respected?** Plan does not touch `claim-duplicate-columns.ts`, `state-machine.ts`, `lexdrive/process-event.ts`, or any CMM-49 column-routing surface. It adds an isolated script + test + package.json line + one knip-ignore line + docs.
6. **Regel 1/2/3 + Audit + Co-Authored-By?** Feature branch → staging PR; no `main` push; no CLI DDL; no unattended stash; every commit carries the 7-point Audit block and the Co-Authored-By line.
7. **Did I re-verify file:line before each task?** The plan mandates a fresh `git grep` in Task 0 and re-verification before each edit — main moves; the 2026-07-11 line numbers are indicative, the invariant (zero live refs) is the contract.
