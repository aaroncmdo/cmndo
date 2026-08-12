# SLA breached/blocker Derive-at-Read Implementation Plan
> # ✅ ERFUELLT (verifiziert 2026-08-12) — NICHT MEHR AUSFUEHREN
>
> „Derive-at-Read" ist Realitaet: die persistierten SLA-Flags gibt es nicht mehr.
> **DB-Beleg (12.08.):** `claims.sla_breached` und `claims.sla_blocker` sind **gedroppt** —
> SLA-Zustaende koennen nur noch beim Lesen abgeleitet werden (u.a. `src/lib/fall/subphase-resolver.ts`).
> Der Plan haette genau diesen Zustand herbeigefuehrt; er ist auf anderem Weg erreicht.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` syntax.
> **Isolation:** implement in a dedicated worktree (`node scripts/new-session-worktree.mjs flag-fg7-sla-derive`).
**Goal:** Stop SV-SLA `breached` flags + `kritisch` breach-tasks from persisting after a claim actually progressed, and stop kanzlei dunning from mahn-ing the wrong party after the customer fixed the blocker — by re-checking live completion before escalating and recomputing the blocker at every dunning stage.
**Architecture:** Extract three pure decision helpers (SV-SLA completion derivation from live `operative_status`/termin state, an SV breach-task auto-cancel status resolver, and a stage-independent blocker recompute) into `src/lib/sla/`, unit-test them, then wire them into `checkAndEscalateBreaches` (SV cron path) and `handleKanzleiBreach` (kanzlei dunning). `sla_tracking.status='breached'`/`blocker_rolle` stay as **cached** columns (existing readers depend on them + the kanzlei cron pages on `status IN ('pending','breached')`); we fix the write-paths so the cache tracks the live-derived truth instead of a stale snapshot. Idempotency facts (`n_mahnungen`, `letzte_mahnung_am`) are untouched.
**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, vitest.

## Global Constraints
- Regel 1: never push to `main`; feature branch `kitta/aar-<nr>-<slug>` → PR → `staging`.
- Regel 2: DDL **only** via `mcp__plugin_supabase_supabase__apply_migration` (this plan is **code-only** — no DDL; see "DDL?" below).
- Regel 3: no unaccompanied stash at session end.
- Server-actions/crons keep a consistent return shape; do **not** mix `throw` into result-returning paths. Non-critical sub-ops (WA/email/timeline inserts) stay in local `try/catch`.
- **Leave idempotency facts UNTOUCHED:** `sla_tracking.n_mahnungen`, `letzte_mahnung_am`, every `*_sent`/`*_versendet_am` — records of a real send; never derive (double-send is harmful).
- Frontend user-facing strings use real Umlaute (ä/ö/ü/ß). This FG touches **no** user-facing UI strings (crons/lib only) — email/WA templates in `kanzlei-mahnungen.ts` are NOT modified.
- 7-Punkte-Audit block in every commit body + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Verify column names against the live DB (facts captured below) and **RE-VERIFY every file:line before each task** — citations are Stand 2026-07-11, branch `aar-956`.
- Component-Set / knip / token-audit ratchets: this FG adds only backend `.ts` in `src/lib/sla/` + cron routes → no new components/tokens; run the ratchets anyway to confirm `0 neu`.

---

## Load-bearing facts (verified against live DB `paizkjajbuxxksdoycev`, 2026-07-11)

**The asymmetry (SV-SLA vs kanzlei-SLA):**
- **SV-SLA** cron `GET /api/cron/sla-check` → `checkAndEscalateBreaches()` (`src/lib/sla/tracker.ts:67`). It selects `sla_tracking` rows `status='pending' AND breach_at < now` (`:71-75`), then **immediately** creates a `prioritaet:'kritisch'` task `typ:'sla_breach'` (`:96-103`) and flips `status:'breached'` (`:111-113`). **No completion re-check.** `completeSla()` (`:53-60`) flips `status:'completed'` but does **NOT** cancel the breach task.
- **kanzlei-SLA** cron `GET /api/cron/kanzlei-sla-check` (`route.ts:22`) FIRST calls `checkCompletionSignal()` (`:70`) and, if done, `completeKanzleiSla()` + `continue` (`:71-75`) — escalation is skipped. `completeKanzleiSla()` (`src/lib/sla/kanzlei-tracker.ts:63`) ALSO cancels pending nachfass tasks (`:84-89`).

**Consequence, live-confirmed:** `sla_tracking` has **0** SV-SLA rows in `completed` state; instead `termin_bestaetigung`=29 breached / `gutachter_zuweisung`=19 breached / `besichtigung`=21 breached + 8 pending. `tasks WHERE typ='sla_breach'` = **69 `offen`**, 2 `erledigt` → breach tasks pile up permanently. This is exactly the false-`breached` + spurious-`kritisch`-task drift from spec §5.10.

**`completeKanzleiSla`'s cancel is itself latently broken — do NOT copy it verbatim:** `tasks.status` is a Postgres **enum `task_status` = {`offen`,`in-bearbeitung`,`erledigt`,`blockiert`}** (verified: `pg_enum`). `completeKanzleiSla` (`kanzlei-tracker.ts:86`) writes `status:'abgebrochen'` — **not a valid enum label** → Postgres rejects the UPDATE. Our SV auto-cancel MUST use a valid enum value. Use **`status:'erledigt'` + `auto_resolved_am` + `auto_resolved_grund`** (the repo's established auto-resolve marker; `tasks.auto_resolved_am`/`auto_resolved_grund` columns exist). (Fixing `completeKanzleiSla`'s bad literal is an **optional** hardening in Task 6 — same file family, cheap, and it makes the kanzlei cancel actually work.)

**Blocker snapshot bug:** `handleKanzleiBreach` (`src/lib/sla/kanzlei-mahnungen.ts:357`) computes `blocker` via `detectBlocker()` **only at Stufe 1** (`:419-428`) and writes `blocker_rolle`/`blocker_grund`; Stufen 2/3 **reuse the frozen snapshot** (`:429-434`). `detectBlocker(fallId, claimId, slaTyp)` (`src/lib/sla/blocker-detection.ts:25`, exported) is fully live-derivable from `claims.sa_unterschrieben`/`vollmacht_signiert_am`, `gutachten.fertiggestellt_am`, `pflichtdokumente`, `kanzlei_faelle`. So after the customer signs the Vollmacht, Stufen 2/3 still dun the customer (`blocker.rolle='kunde'`) instead of re-routing to the kanzlei.

**SV-SLA completion signals (from `state-machine.ts` `completeSla` hooks + `bestaetigung.ts`):**
- `gutachter_zuweisung` → completed at `operative_status ∈ {sv-zugewiesen, sv-termin}` (`state-machine.ts:341-342`).
- `termin_bestaetigung` → completed when a `gutachter_termine` row for the fall reaches `status='bestaetigt'` (`bestaetigung.ts:36-40`).
- `besichtigung` → completed at `operative_status ∈ {besichtigung, begutachtung-laeuft}` (`state-machine.ts:344-345`).
- `gutachten_upload` → completed at `operative_status='gutachten-eingegangen'` (`state-machine.ts:348-349`).
- The operative axis is `claims.operative_status` (text, SSoT). Its ordering is `FALL_STATUS_TRANSITIONS` (`state-machine.ts:20-49`): `ersterfassung → sv-gesucht → sv-zugewiesen → sv-termin → besichtigung → begutachtung-laeuft → gutachten-eingegangen → filmcheck → kanzlei-uebergeben → …`. Terminal `abgeschlossen`/`storniert` also close every open SV-SLA.
- `gutachter_termine.status` live values incl. `bestaetigt`, `abgeschlossen`, `storniert`, `verschoben`, `dispatch_pending`.

**Schema facts:** `sla_tracking(fall_id, claim_id, sla_typ text, status text default 'pending', target_rolle text default 'sv', breach_at, n_mahnungen, letzte_mahnung_am, blocker_rolle, blocker_grund, eskalation_task_id, …)`. SV rows carry `target_rolle='sv'` (DB default); kanzlei rows `='kanzlei'`. `checkAndEscalateBreaches` does **not** filter `target_rolle` today (latent: a leaked kanzlei row would get `SLA_LABEL[typ]=undefined`). `sla_breach` task links back via `sla_tracking.eskalation_task_id`.

**Admin client:** all SLA lib modules use `import { createAdminClient } from '@/lib/supabase/admin'`. Query-builder chaining (`.from().select().eq().in()/.lt()/.maybeSingle()`).

**Test conventions (no SLA tests exist yet):** vitest, `environment: 'node'`, include `src/**/*.{test,spec}.{ts,tsx}`. Two established patterns: (a) **pure-function unit tests** (no DB) — preferred for the decision helpers; (b) **source-reading regression guards** (`readFileSync(route, 'utf8')` + `expect(src).toContain(...)`) as used in `src/app/api/cron/send-lead-reminders/route.test.ts` — used here to lock the cron wiring. The DB-mock harness in `src/lib/leads/__tests__/convert-lead-to-claim.test.ts` (queue-based builder) is available if a wired integration test is wanted, but the pure-fn split keeps DB out of the hot logic.

---

## File Structure

```
src/lib/sla/
  sv-completion.ts            (NEW) pure: deriveSvSlaCompletion() + rank helper; no DB
  sv-completion.test.ts       (NEW) unit tests for the pure derivation
  task-resolution.ts          (NEW) pure: resolveSlaBreachTaskCancel() → valid enum + marker
  task-resolution.test.ts     (NEW) unit tests
  tracker.ts                  (EDIT) checkAndEscalateBreaches: completion re-check before escalate;
                                     completeSla: cancel linked sla_breach task
  kanzlei-mahnungen.ts        (EDIT) handleKanzleiBreach: recompute blocker LIVE every Stufe
  kanzlei-tracker.ts          (EDIT, optional Task 6) completeKanzleiSla: 'abgebrochen' → 'erledigt'
src/app/api/cron/
  sla-check/route.test.ts     (NEW) source-guard: cron path exercises completion re-check
  kanzlei-sla-check/route.ts  (unchanged — already re-checks completion)
```

No DDL. No new dependencies. No UI.

---

## Tasks

### Task 1 — Pure SV-SLA completion derivation (`sv-completion.ts`)

**Files:** `src/lib/sla/sv-completion.ts` (new), `src/lib/sla/sv-completion.test.ts` (new).

**Interface (exact):**
```ts
export type SvSlaTyp =
  | 'gutachter_zuweisung' | 'termin_bestaetigung' | 'besichtigung' | 'gutachten_upload'

/** Ordered operative_status progression (mirrors FALL_STATUS_TRANSITIONS in state-machine.ts).
 *  Index = rank; higher rank = further along. Terminal 'abgeschlossen'/'storniert' handled separately. */
export const OPERATIVE_STATUS_ORDER: readonly string[] = [
  'onboarding', 'ersterfassung', 'sv-gesucht', 'sv-zugewiesen', 'sv-termin',
  'besichtigung', 'begutachtung-laeuft', 'gutachten-eingegangen',
  'filmcheck', 'qc-pruefung', 'kanzlei-uebergeben', 'anschlussschreiben',
  'regulierung', 'regulierung-laeuft', 'vs-kuerzt', 'nachbesichtigung-laeuft',
  'vs-abgelehnt', 'klage', 'zahlung-eingegangen', 'abgeschlossen',
]

/** operative_status a given SV-SLA is considered satisfied at-or-after. */
export const SV_SLA_COMPLETE_AT: Record<SvSlaTyp, string> = {
  gutachter_zuweisung: 'sv-zugewiesen',
  termin_bestaetigung: 'besichtigung',   // reaching besichtigung implies the termin was confirmed
  besichtigung:        'besichtigung',
  gutachten_upload:    'gutachten-eingegangen',
}

export interface SvCompletionInputs {
  operativeStatus: string | null
  /** true if ANY gutachter_termine row for the fall has status ∈ {bestaetigt, abgeschlossen}. */
  hasConfirmedTermin: boolean
}

/** Pure: is this SV-SLA already satisfied by the live claim/termin state?
 *  - terminal 'abgeschlossen'/'storniert' → true (nothing left to escalate)
 *  - termin_bestaetigung → true if hasConfirmedTermin OR operativeStatus at/after 'besichtigung'
 *  - others → operativeStatus rank >= rank(SV_SLA_COMPLETE_AT[typ])
 *  Unknown/NULL operativeStatus → false (cannot prove completion). */
export function deriveSvSlaCompletion(typ: SvSlaTyp, inputs: SvCompletionInputs): boolean
```

**Steps:**
- [ ] RE-VERIFY `state-machine.ts:20-49` (`FALL_STATUS_TRANSITIONS` order) and `:338-351` (`completeSla` trigger statuses) still match `OPERATIVE_STATUS_ORDER`/`SV_SLA_COMPLETE_AT`. Adjust the constants if the state machine changed.
- [ ] Write `sv-completion.test.ts` FIRST (failing). Cases: `gutachter_zuweisung` false at `sv-gesucht`, true at `sv-zugewiesen`, true at `kanzlei-uebergeben`; `besichtigung` false at `sv-termin`, true at `begutachtung-laeuft`; `gutachten_upload` false at `besichtigung`, true at `gutachten-eingegangen`; `termin_bestaetigung` true when `hasConfirmedTermin=true` even at `sv-termin`, true at `besichtigung` even when `hasConfirmedTermin=false`, false at `sv-termin`+`hasConfirmedTermin=false`; terminal `abgeschlossen`→true and `storniert`→true for all typs; `operativeStatus=null`→false (unless terminal/hasConfirmedTermin).
- [ ] Run `npx vitest run src/lib/sla/sv-completion.test.ts` → confirm RED (module missing).
- [ ] Implement `sv-completion.ts` minimally (rank lookup via `OPERATIVE_STATUS_ORDER.indexOf`; unknown status → rank `-1` → false).
- [ ] Run `npx vitest run src/lib/sla/sv-completion.test.ts` → GREEN.
- [ ] `npx tsc --noEmit` → clean.
- [ ] Commit with Audit block (`feat(FG7): pure SV-SLA completion derivation` — no UI, no DB, no consumers yet).

### Task 2 — Pure breach-task cancel resolver (`task-resolution.ts`)

**Files:** `src/lib/sla/task-resolution.ts` (new), `src/lib/sla/task-resolution.test.ts` (new).

**Interface (exact):**
```ts
/** The task-status enum (public.task_status). 'abgebrochen' is NOT a member — verified. */
export type TaskStatus = 'offen' | 'in-bearbeitung' | 'erledigt' | 'blockiert'

export interface SlaBreachTaskCancel {
  status: TaskStatus            // always 'erledigt' (no 'cancelled' member exists)
  auto_resolved_am: string      // ISO now
  auto_resolved_grund: string   // e.g. 'SLA completed — auto-resolved'
}

/** Pure: the patch to auto-resolve an sla_breach task when its SLA completes.
 *  Uses 'erledigt' + auto_resolved_* (repo auto-resolve marker) — NOT the invalid 'abgebrochen'. */
export function resolveSlaBreachTaskCancel(now: Date, grund?: string): SlaBreachTaskCancel
```

**Steps:**
- [ ] RE-VERIFY the `task_status` enum via `mcp__plugin_supabase_supabase__execute_sql` (labels: offen, in-bearbeitung, erledigt, blockiert) and that `tasks.auto_resolved_am`/`auto_resolved_grund` exist (they do, per `database.types.ts` `tasks.Row`). Do NOT introduce a new status.
- [ ] Write `task-resolution.test.ts` FIRST (failing): asserts `status==='erledigt'`, `auto_resolved_am===now.toISOString()`, non-empty `auto_resolved_grund`, and a compile-time guard that `'abgebrochen'` is not assignable to `TaskStatus` (type-level test via `// @ts-expect-error`).
- [ ] Run `npx vitest run src/lib/sla/task-resolution.test.ts` → RED.
- [ ] Implement `task-resolution.ts` minimally.
- [ ] Run vitest → GREEN; `npx tsc --noEmit` → clean.
- [ ] Commit with Audit block.

### Task 3 — `completeSla` cancels the linked breach task (`tracker.ts`)

**Files:** `src/lib/sla/tracker.ts` (edit).

**Change:** In `completeSla(fallId, typ)` (`:53-60`), after flipping `status:'completed'`, look up the row's `eskalation_task_id` and auto-resolve that task (parity with `completeKanzleiSla`, but using the valid enum from Task 2). Keep the function's `Promise<void>` signature and its "no throw" behavior (non-critical: wrap the task update so a failure only logs).

**Steps:**
- [ ] RE-VERIFY `tracker.ts:53-60` (`completeSla`) and `:111-113` (where `eskalation_task_id` is written on breach) unchanged.
- [ ] Failing test: add to `src/app/api/cron/sla-check/route.test.ts` (Task 5 file) OR a new `tracker.test.ts` a **source-guard** asserting `tracker.ts` source contains `eskalation_task_id` inside `completeSla` and imports `resolveSlaBreachTaskCancel`. (Pure DB behavior is covered by the helper unit tests; a wired DB test is optional via the convert-lead mock harness.)
- [ ] Run the guard → RED.
- [ ] Implement: select `id, eskalation_task_id` for the row(s) being completed (same `fall_id`+`sla_typ`+`status IN ('pending','breached')` filter as the update), then for each with a non-null `eskalation_task_id`, `db.from('tasks').update(resolveSlaBreachTaskCancel(new Date())).eq('id', taskId).eq('status', 'offen')` (only auto-resolve still-open tasks — never reopen/rewrite a human-`erledigt` one). Wrap in `try/catch` + `console.error`.
- [ ] Run guard → GREEN; `npx tsc --noEmit` → clean.
- [ ] Commit with Audit block.

### Task 4 — SV cron re-checks completion before escalating (`tracker.ts`)

**Files:** `src/lib/sla/tracker.ts` (edit `checkAndEscalateBreaches`, `:67-124`).

**Change (parity with kanzlei cron `route.ts:68-78`):** For each `pending`+`breach_at<now` row, BEFORE creating the breach task, derive live completion via `deriveSvSlaCompletion`. If complete → call `completeSla(fallId, typ)` (which now also cancels any stale task) and **skip** escalation. Only genuinely-still-pending SLAs create the `kritisch` task + flip to `breached`. Also add the cheap correctness guard `.neq('target_rolle', 'kanzlei')` (or `.eq('target_rolle','sv')`) to the pending query so kanzlei rows can never leak into SV escalation (they'd produce `SLA_LABEL[typ]=undefined`). Keep the `{ neueBreaches, tasksErstellt }` return shape; add nothing that changes callers.

**Data needed per row for the derivation:** `operative_status` from `claims` (via `claim_id`; the row already selects `claim_id`), and `hasConfirmedTermin` = `EXISTS(gutachter_termine WHERE fall_id=… AND status IN ('bestaetigt','abgeschlossen'))`. Batch or per-row reads both fine (cron cardinality is tiny — dozens of rows). Prefer per-row `maybeSingle`/`head:true count` reads mirroring the existing `claim_nummer` per-row read at `:90-93`.

**Steps:**
- [ ] RE-VERIFY `tracker.ts:67-124`, the select at `:71-75`, and the escalation block `:80-121`. RE-VERIFY the kanzlei parity block `kanzlei-sla-check/route.ts:68-78`.
- [ ] Extend `src/app/api/cron/sla-check/route.test.ts` (source-guard) with assertions: `tracker.ts` (imported by the route) references `deriveSvSlaCompletion`; the pending query includes a `target_rolle` guard; completion re-check appears **before** the `tasks` insert. (Because the route is a thin wrapper, the guard reads `tracker.ts` too — see Task 5.)
- [ ] Run guard → RED.
- [ ] Implement: import `deriveSvSlaCompletion, type SvSlaTyp` from `./sv-completion`. In the loop, resolve `operativeStatus` (`claims.operative_status` via `claim_id`) + `hasConfirmedTermin`, then `if (deriveSvSlaCompletion(typ, { operativeStatus, hasConfirmedTermin })) { await completeSla(fallId, typ); continue }`. Guard: rows with `claim_id=null` cannot be proven complete → treat as still-pending (escalate) exactly as today. Count only real escalations in `neueBreaches`/`tasksErstellt` (adjust `neueBreaches` to count escalated rows, not raw `pending.length`, so the metric reflects true breaches; document in commit).
- [ ] Run guard → GREEN. `npx tsc --noEmit` → clean.
- [ ] Optional wired sanity (no commit needed): dry-run reasoning — with 69 stale `offen` tasks + rows now derivable-complete, the next SV cron run auto-resolves them via Task 3. Note this in the commit body as the expected prod effect.
- [ ] Commit with Audit block.

### Task 5 — Cron wiring source-guard (`sla-check/route.test.ts`)

**Files:** `src/app/api/cron/sla-check/route.test.ts` (new).

**Rationale:** The route (`sla-check/route.ts:1-13`) is a 1-line delegate to `checkAndEscalateBreaches`; the logic lives in `tracker.ts`. Mirror `send-lead-reminders/route.test.ts` by source-reading BOTH the route and `tracker.ts` and asserting the completion-re-check contract is present and correctly ordered.

**Steps:**
- [ ] RE-VERIFY `send-lead-reminders/route.test.ts` pattern (readFileSync + `toContain`).
- [ ] Write the test: read `src/lib/sla/tracker.ts`; assert it (a) imports from `./sv-completion`, (b) calls `deriveSvSlaCompletion(` inside `checkAndEscalateBreaches`, (c) the `deriveSvSlaCompletion`/`completeSla` completion branch's source index is **before** the `typ: 'sla_breach'` insert's index (ordering guard), (d) the pending select contains a `target_rolle` filter, (e) `completeSla` source contains `eskalation_task_id` (Task 3 contract). Read `sla-check/route.ts`; assert it still delegates to `checkAndEscalateBreaches` and keeps the `CRON_SECRET` auth guard.
- [ ] Run `npx vitest run src/app/api/cron/sla-check/route.test.ts` → GREEN (Tasks 3+4 already landed the source). If any assertion is RED, fix the wiring, not the test.
- [ ] Commit with Audit block.

### Task 6 — Kanzlei dunning recomputes blocker LIVE every Stufe (`kanzlei-mahnungen.ts`) + optional `completeKanzleiSla` enum fix

**Files:** `src/lib/sla/kanzlei-mahnungen.ts` (edit `handleKanzleiBreach`, `:357-471`); optionally `src/lib/sla/kanzlei-tracker.ts` (`:86`).

**Change A (blocker recompute):** Replace the "Stufe-1-only snapshot" (`:417-434`) with a **live `detectBlocker()` call on every Stufe**. Persist the freshly-derived `blocker_rolle`/`blocker_grund` back to `sla_tracking` at every Stufe (so downstream reads + tasks reflect the current blocker), instead of reusing `slaRecord.blocker_rolle`/`_grund`. Keep the `n_mahnungen`/`letzte_mahnung_am` counter write (`:462-468`) **exactly as-is** — those are idempotency facts, untouched. Keep the `{ stufe, blocker }` return shape.

**Change B (optional, same file family — make the kanzlei cancel actually work):** In `completeKanzleiSla` (`kanzlei-tracker.ts:84-89`), replace the invalid `status:'abgebrochen'` with `status:'erledigt'` + `auto_resolved_am`/`auto_resolved_grund` (reuse `resolveSlaBreachTaskCancel` from Task 2, applied to the nachfass-task filter). This fixes a currently-throwing UPDATE (the enum has no `abgebrochen`). Gate this behind the same PR but call it out separately in the commit — it is a latent-bug fix, not strictly FG7's headline, but it's the same broken-cancel root cause.

**Steps:**
- [ ] RE-VERIFY `kanzlei-mahnungen.ts:400-434` (Stufe determination + blocker snapshot) and `:437-459` (mahnung routing by `blocker.rolle`). RE-VERIFY `detectBlocker` signature (`blocker-detection.ts:25`) and `completeKanzleiSla` (`kanzlei-tracker.ts:63-97`).
- [ ] Failing source-guard test `src/lib/sla/kanzlei-mahnungen.test.ts`: assert the `detectBlocker(` call is NOT inside an `if (stufe === 1)` block (i.e. blocker is recomputed unconditionally); assert the file no longer reads `slaRecord.blocker_rolle` as the blocker for Stufe 2/3 routing. For Change B: assert `kanzlei-tracker.ts` no longer contains the string `'abgebrochen'`.
- [ ] Run → RED.
- [ ] Implement Change A: move `blocker = await detectBlocker(fallKtx.id, claimId, slaRecord.sla_typ)` out of the `stufe===1` guard so it runs for every Stufe; always persist `blocker_rolle`/`blocker_grund` (and keep the `status:'breached'` write for the Stufe-1 first-breach case — Stufe 2/3 rows are already `breached`). Implement Change B if in scope.
- [ ] Run → GREEN. `npx tsc --noEmit` → clean.
- [ ] Commit with Audit block (call out: blocker now live-derived per Stufe; `n_mahnungen`/`letzte_mahnung_am` untouched; Change B fixes invalid enum literal).

### Task 7 — Full build + ratchets + audit sweep

**Steps:**
- [ ] `npm run build` green (Next.js 15 validates route/edge at build time — this FG touches a cron route, so run the full build, not just tsc).
- [ ] `npx vitest run src/lib/sla src/app/api/cron/sla-check` → all green.
- [ ] `npm run check:knip -- --warn`, `npm run check:token-audit`, `npm run check:component-set -- --warn` → `0 neu` (no new files gated; SLA lib is backend `.ts`).
- [ ] Grep for other consumers of `checkAndEscalateBreaches`/`completeSla`/`handleKanzleiBreach` (`rg "checkAndEscalateBreaches|completeSla|handleKanzleiBreach" src/`) → confirm return-shapes unchanged so no caller breaks. Known callers: `state-machine.ts:342/345/346/349`, `bestaetigung.ts:39`, `flow/[token]/actions.ts:1312-1314`, `sla-check/route.ts:11`, `kanzlei-sla-check/route.ts:83/103`.
- [ ] Session-Abschluss-Checkliste: `git status` clean, `git stash list` empty, all commits pushed.
- [ ] Open PR → `staging`. PR body ends with the Claude Code footer.

---

## Self-Review

**Return shapes / consistency:** `completeSla`/`checkAndEscalateBreaches` keep `Promise<void>` / `{ neueBreaches, tasksErstellt }`; `handleKanzleiBreach` keeps `{ stufe, blocker }`. No `throw` added to result paths; new sub-ops (task cancel, blocker persist) are non-critical `try/catch`. Verified callers (Task 7) unaffected.

**Idempotency facts untouched:** `n_mahnungen`, `letzte_mahnung_am` never derived or rewritten by this FG. No `*_sent`/`*_versendet_am` touched. Auto-cancel only flips a *task* from `offen`→`erledigt` with an auto-resolve marker (idempotent, `.eq('status','offen')` guard prevents rewriting human-closed tasks) — it does not un-send anything.

**Derive vs flag:** `sla_tracking.status='breached'` and `blocker_rolle` REMAIN cached columns (readers depend on them; the kanzlei cron pages on `status IN ('pending','breached')`; the SV breach task links via `eskalation_task_id`). We do **not** drop them — we fix the write-paths so the cache tracks the live truth (completion derived from `operative_status`+termin; blocker derived per Stufe). This is the spec's K2 "read the source" applied at write-time, avoiding a risky schema change to a table with live drift.

**DDL?** None. Pure code (extract helpers + wire). If a future iteration wants `status='breached'` as a `GENERATED`/view-derived read, that's a separate DDL plan via `apply_migration` — explicitly out of scope here.

**Top risk:** the SV-SLA completion signal is harder to detect than kanzlei's (kanzlei reads discrete `anschlussschreiben_am`/`ruege_gesendet_am` timestamps; SV must infer completion from the *ordered* `operative_status` axis + a termin existence probe). Mitigations: (1) the ordering constant is a verified mirror of `FALL_STATUS_TRANSITIONS` with a Task-1 re-verify step; (2) `deriveSvSlaCompletion` is **conservative** — unknown/NULL status ⇒ NOT complete ⇒ still escalates (fail toward the current behavior, never toward silently suppressing a real breach); (3) `termin_bestaetigung` has a dedicated `hasConfirmedTermin` probe because reaching `sv-termin` does not by itself prove the termin was *confirmed*. Secondary risk: a claim that legitimately regressed (e.g. `sv-termin → sv-gesucht` after SV lead-rejection) would make a once-satisfied `gutachter_zuweisung` look incomplete again — acceptable, because that IS a real re-open and re-escalation is correct.

**Boundaries:** No active neighbor lane owns `src/lib/sla/*` (spec §7 lists FG7 with no neighbor lane). `state-machine.ts` is 470d55c9's lane but this FG does **not** edit it (only re-verifies its constants); `bestaetigung.ts` is 6c630247-adjacent but likewise untouched. Coordinate only if Task 1's re-verify finds the state machine changed.
