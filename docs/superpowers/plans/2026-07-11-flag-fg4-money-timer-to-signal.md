# Geld/Ops Timer→Signal Implementation Plan
> # ✅ ERFUELLT (verifiziert 2026-08-12) — NICHT MEHR AUSFUEHREN
>
> Umgesetzt und im Code **namentlich als FG4 gekennzeichnet**:
> **`src/lib/provisionen/completion-release-gate.ts`**, Zeile 1:
> „**FG4-A** (Aaron 13.07. „einheitlich"): Provisions-Release = Completion-Signal + 7-Tage-Hold,
> EINHEITLICH" — inkl. `/** 7-Tage-Hold nach Completion (Clawback-Fenster), in ms. */`.
> Begleitend: `completion-fetch.ts` + `release-runner.ts`.
>
> Der Timer->Signal-Umbau ist damit gelandet; die im Plan-Kopf gewarnte Provisions-Lane-Kollision
> hat sich aufgeloest (die Lane hat den Gate selbst eingebaut).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` syntax.
> **Isolation:** implement in a dedicated worktree. ⚠ COORDINATION: this is the PROVISION domain — a session on `kitta/ws6-werkstatt-provision-reparatur` (and its follow-up `kitta/werkstatt-provision-inbound-only`) is actively auditing provision. Hand this plan to that lane to reconcile, or serialize — do NOT run a parallel provision session editing the same crons. **See §Coordination BEFORE writing any code** — the makler-release cron has ALREADY been rewritten to `partner_provisionen` on those branches (but WITHOUT the completion gate this FG adds); FG4-A layers onto the landed version, it must NOT re-do the table migration.

**Goal:** Stop two money/ops crons from acting on a clock instead of a real signal: (A) `release-makler-provisionen` releases a Makler-provision the moment `hold_until` elapses (and releases-by-default when `operative_status` is unknown) with no proof the referred claim actually completed; (B) `zahlungspruefung` deactivates a Sachverständiger (`ist_aktiv=false`, no audit, no restore) from a *deprecated* billing table on a bare date compare.

**Architecture:** Two independent, code-only fixes. **(A)** gate the makler release-pass on a real completion signal — the referred claim must have reached the positive operational terminal (`claims.operative_status = 'abgeschlossen'`, the engine-produced happy-path close; equivalently the positive `claims.status` terminal `reguliert_vollstaendig`) — and treat NULL/unknown `operative_status` as **hold** (not release). A small pure helper `istProvisionFreigabeReif(operativeStatus, claimStatus)` makes the gate testable and shared. **(B)** retire `zahlungspruefung` entirely: the table it reads (`gutachter_monatsabrechnungen`) is fed only by the `@deprecated` `monatsabrechnung` cron, the live SV-billing pipeline is `abrechnungen` + `abrechnung-reminder` + `abrechnung-einzug` (Stripe auto-debit, no ops-lockout), and the cron is not scheduled in the crontab — plus add a **one-shot re-activation migration** (DDL via MCP) restoring the one live SV that this cron already locked out. The dunning function that *legitimately* wants "overdue" belongs to the active `abrechnungen` pipeline, which already exists and needs no SV-deactivation.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, vitest.

## Global Constraints
- DDL ONLY via `mcp__plugin_supabase_supabase__apply_migration({name,query})`; then `list_migrations` to read the assigned version `<V>`; commit the file as `supabase/migrations/<V>_<name>.sql` (filename == tracked version); verify via READ-only `execute_sql`. NEVER supabase-CLI (`db push`), NEVER raw `execute_sql` with DDL. Project ref = `paizkjajbuxxksdoycev` (Claimondo-v2, ACTIVE_HEALTHY). Only Task 4 has DDL (a data-only UPDATE of one row) — everything else is code-only.
- Cron routes return `NextResponse.json({...}, {status})`, guard on `Authorization: Bearer ${CRON_SECRET}`, `export const dynamic = 'force-dynamic'` — keep the existing shape. Non-critical sub-ops (email/notify) stay in local `try/catch` so a send-fail never breaks the status update.
- Never export non-function constants from a `'use server'` file. The crons here are route handlers, not `'use server'` — the shared helper lives in a plain module (`src/lib/makler/provision-release-gate.ts`).
- Every commit message ends with an `Audit:` block (7 points) + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Backend-only FG (no user-facing UI strings) → ASCII in comments/logs is fine; Audit point 2 (UI) = `n/a (kein UI-Change)`. If any Makler-facing email copy is touched, real Umlaute (`ä/ö/ü/ß`) are mandatory.
- DB column/table names verified against live DB + code on 2026-07-11. **file:line = Stand 2026-07-11 — RE-VERIFY by reading the file before each task** (the provision lane is rewriting these files in parallel).

---

## ✅ ENTSCHEIDUNG (Aaron 2026-07-11) — Release-Regel FINAL (löst den nur_gutachter-Gate weiter unten auf)

**Release = Completion-Signal + 7-Tage-Hold, EINHEITLICH für alle Provisionstypen** („genauso"):
- **Voll-Claim:** completion = `operative_status='abgeschlossen'` (Timestamp `claims.abgeschlossen_am`) ODER `claims.status='reguliert_vollstaendig'`.
- **`nur_gutachter`:** completion = Termin durchgeführt (`claims.status='termin_durchgefuehrt'` / `gutachter_termine.durchgefuehrt_am`).
- **Freigabe erst wenn:** completion erreicht **UND** `now >= completion_ts + 7 Tage`. NULL/unbekannt → **HOLD** (nie Default-Release).

Das **präzisiert** die „completion signal to gate on"-Sektion unten (die bisher sofort bei completion freigab) und **löst** den „Open decision … nur_gutachter"-Blockquote auf: `istProvisionFreigabeReif(...)` bekommt zusätzlich den **completion-Timestamp + 7-Tage-Check**. `hold_until` wird ans Completion-Event **re-ankert** (`= completion_ts + 7d`) statt an `trigger_at` — bevorzugt LIVE im Cron aus dem completion-Timestamp ableiten (kein neuer stale Timer, konsistent mit dem Audit-Prinzip). 7 Tage = Clawback-/Dispute-Fenster nach echter Fertigstellung. → Helper-Signatur + Unit-Tests in den Tasks entsprechend anpassen.

---

## Context: verified facts (Stand 2026-07-11 — RE-VERIFY before each task)

### The live DB reality (verified via MCP, project `paizkjajbuxxksdoycev`)
- **`makler_provisionen` NO LONGER EXISTS.** Migration `20260708135155_provision_unifikation_phase3bc_stop_dualwrite_and_drop` dropped it; provisions were unified into **`partner_provisionen`** (`partner_typ text NOT NULL`, plus `partner_id, claim_id, fall_id, lead_id, service_typ, trigger_event, trigger_at, hold_until, status, storniert_am, storno_grund, abrechnung_id, betrag_netto_eur, …` — same shape as old makler_provisionen). Live: **2 rows, both `partner_typ='makler'`, both already `status='freigegeben'`** → 0 pending today (dormant, as the spec said, but now for a different reason: the current-branch cron queries a *phantom* table).
- **The current branch (`aar-956`) makler cron still targets the dropped `makler_provisionen`** (`src/app/api/cron/release-makler-provisionen/route.ts` lines 70/133/160) → it would 500 against live DB. **The provision lanes have already rewritten it to `partner_provisionen`** (see §Coordination). FG4-A builds on the rewritten version.
- **`claims.status` is sparsely populated**: 43/48 rows `NULL`, `in_kommunikation_vs(4)`, `reguliert_vollstaendig(1)`. It is only set at terminal decisions by `endzustand-actions`.
- **`claims.operative_status` is the live operational cursor**: `ersterfassung(25), sv-termin(13), kanzlei-uebergeben(6), abgeschlossen(4)`. **`abgeschlossen` is the positive happy-path terminal** produced by the state-machine (`state-machine.ts:47` — `abgeschlossen: []`, reached only via `regulierung→…→abgeschlossen` / `klage→abgeschlossen` / `zahlung-eingegangen→abgeschlossen`). `storniert` is the negative terminal. **`operative_status` has NO CHECK constraint** (verified) — do not assume a fixed enum at the DB layer.
- **`gutachter_monatsabrechnungen`**: 2 rows, **both already `status='ueberfaellig'`**, last created `2026-06-01` (deprecated cron last ran June 1). The 2 overdue bills belong to SV `677400bf…` (`ist_aktiv=true`, paket=pro) and SV `7f79e570…` (**`ist_aktiv=false`**, paket=pro, verifiziert=true, portal_zugang=true). **→ SV `7f79e570…` is a REAL live lockout caused by `zahlungspruefung`** (a verified pro-SV, portal-freed, deactivated purely because a June legacy invoice went unpaid, with no `deaktiviert_am`/`deaktiviert_grund` and no restore path).
- **`abrechnungen` (the active table) is EMPTY** (0 rows). Columns confirmed: `empfaenger_typ, empfaenger_id, faellig_am, status, bezahlt_am, storniert_am, einzug_versucht_am, reminder_gesendet_am, stripe_payment_intent_id, …`. The active SV-billing crons filter `empfaenger_typ='sv'`.

### The completion signal to gate makler-release on (FG4-A) — decision + evidence
A Makler provision represents an **INBOUND referral** (`partner_typ='makler'`, a Makler referred us a claim). **Provision model is out of scope — do NOT re-open it** (Aaron 2026-07-11: inbound-Haftpflicht-only). This FG changes only the **release mechanism** (timer → signal).

**Chosen gate:** release only when the referred claim has reached a **positive completion**:
- `claims.operative_status === 'abgeschlossen'` (the live, engine-produced happy-path close — this is the concrete signal, 4 live claims have it), **OR**
- `claims.status === 'reguliert_vollstaendig'` (the positive `claims.status` terminal → `erfolgreich_reguliert` in `lifecycle.ts:134`, for claims closed via the KB/Kanzlei endzustand-action path where `operative_status` may lag — FG1 will couple these, but FG4 must not depend on FG1 having landed).

**Explicitly NOT released:** any negative/unknown state. In particular:
- `operative_status === 'storniert'` → already handled by the existing storno-pass (flip to `status='storniert'`), never released.
- `operative_status IN (any non-terminal: ersterfassung, sv-termin, kanzlei-uebergeben, regulierung, …)` → **hold** (claim not done).
- `operative_status` NULL/`''`/unknown → **hold** (this fixes the default-release bug — the current code's `operative_status ?? ''` → `'' !== 'storniert'` → released).
- negative terminals reachable on `claims.status` (`abgelehnt_final`, `verjaehrt`, `abgelehnt`) → hold/never-release (a rejected/expired claim earned no referral fee). `storniert` covered above.

Evidence anchors: `state-machine.ts:20-49` (`FALL_STATUS_TRANSITIONS`, `abgeschlossen`/`storniert` terminals), `fall-status-claim-mapping.ts:29-37` (`CLAIMS_TERMINAL_STATES`), `lifecycle.ts:133-142` (`ABSCHLUSS_SUBSTATE` — positive vs negative terminals), `completion-signals.ts` (the existing DB-signal-checker pattern for SLAs — the model this helper follows).

Why `operative_status='abgeschlossen'` and not "any `claims.status` terminal": half the `claims.status` terminals are *failures* (`storniert`, `abgelehnt_final`, `verjaehrt`, `an_externe_kanzlei_uebergeben`) that should NOT pay a referral fee. `operative_status='abgeschlossen'` is unambiguously the *successful* close; pairing it with the single positive `claims.status` terminal (`reguliert_vollstaendig`) covers the case where the endzustand-action set `status` but `operative_status` hasn't been coupled yet (pre-FG1).

> **Open decision to confirm with Aaron / the provision lane before Task 2:** should `nur_gutachter` provisions (`service_typ='nur_gutachter'`) release at the *appraisal-done* signal (`operative_status='sv-termin'` completed / `claims.status='termin_durchgefuehrt'`) rather than full-claim completion? A `nur_gutachter` claim has no regulierungs-tail (`lifecycle.ts:140`, `service_typ` blends out the regulierungs-phase), so requiring `abgeschlossen` may never fire for it. **Default in this plan:** treat `termin_durchgefuehrt` (a positive terminal in `CLAIMS_TERMINAL_STATES`) as completion for `nur_gutachter`. This is encoded in the helper and unit-tested; flag it in the PR for the provision lane to ratify.

### Why `zahlungspruefung` is retired, not fixed (FG4-B) — decision + evidence
- The table it reads (`gutachter_monatsabrechnungen`) is written **only** by `src/app/api/cron/monatsabrechnung/route.ts`, which is itself `@deprecated AAR-925` (JSDoc lines 6-23: "System A wird abgeloest durch /api/cron/abrechnung-erstellen"). So `zahlungspruefung` gates SV activation on a dead billing table.
- The **active** SV-billing pipeline is `abrechnungen` (empfaenger_typ='sv') + `abrechnung-reminder` (T-7/T-3/T-1 dunning, `abrechnung-reminder/route.ts`) + `abrechnung-einzug` (Stripe off-session auto-debit + admin alert on failure, `abrechnung-einzug/route.ts`). **This pipeline never sets `ist_aktiv=false`** — non-payment is handled by auto-debit + an admin email, deliberately NOT by an ops-lockout.
- `ist_aktiv=false` is a **hard ops lockout**: it gates ~14 read paths — dispatch/matching (`get-active-svs.ts:18`, `onboarding/svMatching.ts:56/93`, `debugSvMatching.ts:72`, `lade-deadpin-fallback.ts:78`, `dispatch/kalender/_actions/spontan.ts:131`, `admin-kalender.ts:186`, `tasks/entity-loader.ts:55`), the public map (`gutachter-finder-actions.ts`, `api/kfzgutachter-lp/gutachter-verfuegbar/route.ts:177/183`), billing (`abrechnung-erstellen/route.ts:50`, deprecated `monatsabrechnung:37`), analytics (`sv-performance.ts:30`), `sv/queries.ts:40`. A wrongly-set `ist_aktiv=false` = SV gets no leads, vanishes from the map, gets no new billing.
- The canonical admin deactivate/reactivate path already exists and is auditable: `src/app/faelle/[id]/_actions/core.ts:85` sets `ist_aktiv:false, deaktiviert_am, deaktiviert_grund`; `:120` reactivates (`ist_aktiv:true, deaktiviert_am:null, deaktiviert_grund:null`). `zahlungspruefung` bypasses these (no reason, no restore) — that is the bug.
- Neither `zahlungspruefung` nor `release-makler-provisionen` appears in `.claude/vps-crons.md` (only `termin-morgen-erinnerung` is documented there) → both are effectively dormant/unscheduled today. Retiring `zahlungspruefung` removes a latent foot-gun that would re-fire if ever scheduled.

**Conclusion:** delete `zahlungspruefung` (route + any schedule reference), do NOT rebuild an equivalent against `abrechnungen` (the active pipeline already dunning-covers overdue, and SV-deactivation-on-nonpayment is explicitly not a behavior the live system wants). Add a one-shot migration to un-lock the SV this cron already locked out.

### Test harness pattern
Pure-function helper → plain vitest (see `src/lib/faelle/fall-status-claim-mapping.test.ts` and `src/lib/sv-basic/__tests__/claim-eligibility.test.ts` for the style). Cron-route logic that needs a Supabase mock → queue-based builder mock (see `src/lib/leads/__tests__/convert-lead-to-claim.test.ts:17-120`; also the ws6 branch already added `src/app/api/cron/einzug-status-filter.test.ts` as a cron-test precedent). Run one file: `npx vitest run <path>`. Vitest config: `vitest.config.ts`.

---

## File Structure

```
src/lib/makler/
  provision-release-gate.ts                 (NEW) pure helper: istProvisionFreigabeReif() + POSITIVE_COMPLETION sets
  __tests__/provision-release-gate.test.ts  (NEW) unit tests for the gate

src/app/api/cron/release-makler-provisionen/route.ts   (EDIT) add completion gate to the release-pass; fix NULL-default
src/app/api/cron/zahlungspruefung/route.ts             (DELETE) retire deprecated-table SV-deactivation cron

supabase/migrations/<V>_reactivate_sv_locked_by_zahlungspruefung.sql   (NEW, via MCP) one-shot un-lock of the affected SV
```

No new UI, no new route, no schema change beyond the one data-only UPDATE migration.

---

## Tasks

### Task 1 — Pure completion-gate helper (`provision-release-gate.ts`) [FG4-A]

**Files:** `src/lib/makler/provision-release-gate.ts` (new), `src/lib/makler/__tests__/provision-release-gate.test.ts` (new).

**Interface:**
```ts
// Positive operational terminal (state-machine happy-path close). NO CHECK on the column,
// so this is a code-level allow-list, verified against live values 2026-07-11.
export const POSITIVE_OPERATIVE_COMPLETION = new Set<string>(['abgeschlossen'])
// Positive claims.status terminals that count as a "referral earned" completion.
// (reguliert_vollstaendig = happy-path; termin_durchgefuehrt = nur_gutachter/embed-B terminal.)
export const POSITIVE_CLAIM_TERMINALS = new Set<string>(['reguliert_vollstaendig', 'termin_durchgefuehrt'])

/**
 * Darf eine pending Makler-Provision freigegeben werden?
 * TRUE nur bei nachgewiesener POSITIVER Completion des vermittelten Claims.
 * NULL/unknown/aktive/negative Zustaende -> FALSE (halten). storniert wird separat
 * vom Storno-Pass behandelt und hier ebenfalls FALSE.
 */
export function istProvisionFreigabeReif(
  operativeStatus: string | null,
  claimStatus: string | null,
): boolean
```

**Steps:**
- [ ] RE-VERIFY the live positive-terminal facts: read `state-machine.ts:20-49`, `fall-status-claim-mapping.ts:29-37`, `lifecycle.ts:133-142`. Confirm `abgeschlossen` is the sole positive `operative_status` terminal and `reguliert_vollstaendig`/`termin_durchgefuehrt` are the positive `claims.status` terminals.
- [ ] Write `src/lib/makler/__tests__/provision-release-gate.test.ts` FIRST, asserting REAL behavior:
  - `istProvisionFreigabeReif('abgeschlossen', null)` → `true`
  - `istProvisionFreigabeReif(null, 'reguliert_vollstaendig')` → `true`
  - `istProvisionFreigabeReif(null, 'termin_durchgefuehrt')` → `true`
  - `istProvisionFreigabeReif(null, null)` → **`false`** (the default-release bug)
  - `istProvisionFreigabeReif('', '')` → **`false`**
  - `istProvisionFreigabeReif('sv-termin', null)` → `false`
  - `istProvisionFreigabeReif('kanzlei-uebergeben', null)` → `false`
  - `istProvisionFreigabeReif('ersterfassung', null)` → `false`
  - `istProvisionFreigabeReif('storniert', null)` → `false`
  - `istProvisionFreigabeReif(null, 'abgelehnt_final')` → `false`
  - `istProvisionFreigabeReif(null, 'verjaehrt')` → `false`
  - `istProvisionFreigabeReif(null, 'abgelehnt')` → `false`
- [ ] Run `npx vitest run src/lib/makler/__tests__/provision-release-gate.test.ts` → **fails** (module missing).
- [ ] Implement the minimal helper (the two Sets + a body that returns `POSITIVE_OPERATIVE_COMPLETION.has(operativeStatus ?? '') || POSITIVE_CLAIM_TERMINALS.has(claimStatus ?? '')`).
- [ ] Run the test → **passes**.
- [ ] Commit with Audit block (UI: n/a; Redundancy: reuses terminal vocab, no new source of truth; Regression: pure fn, no callers yet).

### Task 2 — Gate the makler release-pass on the completion signal [FG4-A]

**Files:** `src/app/api/cron/release-makler-provisionen/route.ts` (edit).

⚠ **RE-VERIFY FIRST which version is checked out.** On `aar-956` the file still reads the dropped `makler_provisionen`; on the provision lanes it reads `partner_provisionen` with `.eq('partner_typ','makler')`. **This task must be applied to the `partner_provisionen` version** (the one that will land). If the worktree is off `aar-956`, coordinate: either rebase onto the provision-lane version first, or hand this task to that lane (see §Coordination). Do NOT reintroduce `makler_provisionen`.

**What the release-pass looks like today (both versions), verified:**
```ts
const toRelease = pending.filter((p) => {
  if (stornoSet.has(p.id)) return false
  if (p.hold_until > now) return false
  const fallStatus = p.fall_id ? fallMap.get(p.fall_id)?.status : null   // = operative_status, or '' when NULL
  return fallStatus !== 'storniert'                                       // BUG: '' passes -> released by default
})
```
`fallMap` is keyed by `fall_id` and holds `{ status: operative_status ?? '', claim_nummer }` (built from the claims read at lines ~62-90 of the provision-lane version).

**Steps:**
- [ ] RE-VERIFY the claims read populates BOTH `operative_status` and `status`. Currently it selects `id, claim_nummer, operative_status` only. **Extend the select to also fetch `status`** and carry it into `fallMap` as `claim_status` (add the field to the `FallRow`/local map type). Keep `operative_status` as `status` for the existing storno-pass so that pass is untouched.
- [ ] Import `istProvisionFreigabeReif` from `@/lib/makler/provision-release-gate`.
- [ ] Change the release-pass predicate to require the completion signal (keep the `hold_until` check as a *floor*, not the gate):
  ```ts
  const toRelease = pending.filter((p) => {
    if (stornoSet.has(p.id)) return false
    if (p.hold_until > now) return false                 // hold period is a minimum, not sufficient
    const f = p.fall_id ? fallMap.get(p.fall_id) : null
    if (!f) return false                                  // no claim context -> HOLD (was implicitly released before)
    if (f.operative_status === 'storniert') return false  // storno handled separately
    return istProvisionFreigabeReif(f.operative_status ?? null, f.claim_status ?? null)
  })
  ```
  (Adapt field names to whichever version is checked out — the key change is: **completion signal required; missing context = hold**.)
- [ ] Keep the release UPDATE (`status:'freigegeben'`, `.eq('partner_typ','makler')`) and the release-email/notify block unchanged. The email still only fires for actually-released rows (now correctly gated).
- [ ] Update the header comment block (the numbered flow doc at the top) to state the new gate: "Release-Pass: pending mit `hold_until <= NOW()` UND vermittelter Claim POSITIV abgeschlossen (`operative_status='abgeschlossen'` bzw. `claims.status` positiver Terminal), Fall nicht storniert." Note that an unknown/NULL claim state now **holds** (was: released by default).
- [ ] **Test:** add `src/app/api/cron/release-makler-provisionen/__tests__/release-gate.test.ts` (queue-mock the Supabase builder, precedent: ws6's `einzug-status-filter.test.ts` + `convert-lead-to-claim.test.ts`). Assert the *filtering* decision, not Stripe/email:
  - pending row, `hold_until` in past, mapped claim `operative_status='abgeschlossen'` → released
  - pending row, `hold_until` in past, mapped claim `operative_status='sv-termin'` → **not** released
  - pending row, `hold_until` in past, claim not found in map (NULL/`''`) → **not** released (regression guard for the default-release bug)
  - pending row, `hold_until` in future → not released (floor still honored)
  If a full route-mock is too heavy, extract the release-pass predicate into a tiny exported `selectReleasable(pending, fallMap, now)` pure function in the route file (or the gate module) and unit-test that directly — preferred, mirrors how FG1 kept logic testable.
- [ ] Run the new test(s) → pass. Run `npx tsc --noEmit` (route change) → clean.
- [ ] Commit with Audit block (Spec: FG4-A completion gate + NULL-default fix; Regression: storno-pass + email block untouched, `hold_until` still a floor; Inkonsistenz: reads `operative_status` = CMM-74 SSoT, mirrors the storno-pass source).

### Task 3 — Retire `zahlungspruefung` [FG4-B]

**Files:** `src/app/api/cron/zahlungspruefung/route.ts` (delete) + any schedule/reference.

**Steps:**
- [ ] RE-VERIFY the deprecation chain still holds: `monatsabrechnung/route.ts:6` still says `@deprecated AAR-925`, and `abrechnung-reminder` + `abrechnung-einzug` still operate on `abrechnungen` with `empfaenger_typ='sv'`. Confirm no code imports anything from `zahlungspruefung/route.ts` (route handlers export only `GET`; grep `zahlungspruefung` across `src/` — the only hits should be the route file itself and the deprecated `monatsabrechnung` sibling reference, if any).
- [ ] `git rm src/app/api/cron/zahlungspruefung/route.ts`.
- [ ] Grep `zahlungspruefung` in `.claude/vps-crons.md`, `vercel.json`, `docs/vps-*.md`, and any `scripts/` crontab helper. Remove any schedule line (verified: not currently in `.claude/vps-crons.md`; check `docs/` and `vercel.json` at implement-time in case the provision lane added one).
- [ ] Add a short note to the retirement wherever the team tracks retired crons (if such a doc exists; otherwise the commit body suffices) explaining: deprecated source table, active pipeline covers dunning, ops-lockout-on-nonpayment intentionally not carried forward.
- [ ] `npx tsc --noEmit` → clean (no dangling import). `npm run check:knip -- --update-baseline` if the deleted file was baseline-tracked (it is an unreachable route now; run knip to keep the ratchet honest — record the baseline delta in the commit).
- [ ] Commit with Audit block (Dead-Code: route deleted + schedule ref removed; Spec: FG4-B retire-not-rebuild justified from the deprecated-table chain; Regression: active `abrechnungen` dunning pipeline untouched, no `ist_aktiv` writer removed that anything depends on).

### Task 4 — One-shot re-activation of the SV locked out by `zahlungspruefung` [FG4-B, DDL/data via MCP]

**Files:** `supabase/migrations/<V>_reactivate_sv_locked_by_zahlungspruefung.sql` (new, via `apply_migration`).

⚠ This is a **data-only** migration (a targeted `UPDATE`), routed through `apply_migration` per Rule 2 so it is tracked (a manual `execute_sql` UPDATE would be an untracked prod mutation). It is idempotent and scoped by a WHERE that only matches SVs that (a) are currently `ist_aktiv=false`, (b) have NO admin-audit deactivation (`deaktiviert_am IS NULL` — proving the deactivation was the cron, not a human via `core.ts`), and (c) have an `ueberfaellig` legacy `gutachter_monatsabrechnungen` row. This will NOT resurrect a legitimately admin-deactivated SV.

**Steps:**
- [ ] RE-VERIFY the affected set with a READ `execute_sql`:
  ```sql
  SELECT s.id, s.ist_aktiv, s.deaktiviert_am, s.paket, s.verifiziert, s.portal_zugang_freigeschaltet
  FROM sachverstaendige s
  WHERE s.ist_aktiv = false
    AND s.deaktiviert_am IS NULL
    AND EXISTS (SELECT 1 FROM gutachter_monatsabrechnungen g
                WHERE g.sv_id = s.id AND g.status = 'ueberfaellig');
  ```
  Expected (2026-07-11): 1 row — SV `7f79e570-776b-4525-82ce-c35654ed6ecc`. If the set is empty at implement-time (e.g. already healed by the provision lane), **skip Task 4** and note it in the PR.
- [ ] `apply_migration({ name: 'reactivate_sv_locked_by_zahlungspruefung', query: <UPDATE> })` where the UPDATE mirrors the canonical reactivate (`core.ts:120`) but only sets activation flags (do NOT touch `portal_zugang_freigeschaltet` — it was never flipped by the cron and is true already):
  ```sql
  UPDATE public.sachverstaendige s
  SET ist_aktiv = true
  WHERE s.ist_aktiv = false
    AND s.deaktiviert_am IS NULL
    AND EXISTS (SELECT 1 FROM public.gutachter_monatsabrechnungen g
                WHERE g.sv_id = s.id AND g.status = 'ueberfaellig');
  ```
- [ ] `list_migrations` → read the assigned version `<V>`; commit the file as `supabase/migrations/<V>_reactivate_sv_locked_by_zahlungspruefung.sql` (filename == tracked version — Twin-Drift guard).
- [ ] Verify via READ `execute_sql`: the SV is now `ist_aktiv=true` and appears in the active-SV read (`SELECT count(*) FROM sachverstaendige WHERE ist_aktiv=true AND portal_zugang_freigeschaltet=true` increased by 1; the specific SV row `ist_aktiv=true`).
- [ ] Commit with Audit block (Spec: heals the concrete live lockout; Regression: WHERE excludes admin-deactivated SVs via `deaktiviert_am IS NULL`; Inkonsistenz: filename==tracked version, data-only via apply_migration not raw execute_sql).

### Task 5 — Full build + reconcile check

- [ ] `npm run build` (route deletions + a cron edit → run the FULL build, not just tsc, per project rule for route changes). Green.
- [ ] `npx vitest run src/lib/makler src/app/api/cron/release-makler-provisionen` → all green.
- [ ] `npm run check:token-audit`, `npm run check:component-set -- --ratchet`, `npm run check:knip -- --ratchet` → 0 new violations (this FG adds no UI tokens/components; knip baseline updated in Task 3 if needed).
- [ ] Final `git status` / `git stash list` clean (Rule 3); confirm the migration file is committed with the tracked version name (Rule 2); confirm no push to `main` (Rule 1 — PR against `staging`).

---

## Coordination — READ before implementing

**This FG shares files with the active provision lane. The table migration for FG4-A is already done there; FG4 adds only the completion gate.** Concretely (verified 2026-07-11):

- `kitta/ws6-werkstatt-provision-reparatur` HEAD = `59269c0ee feat(ws6-money): … + Cron-Completion-Gate`. That commit added a completion gate — but to a **different** cron: `release-werkstatt-provisionen` (partner_typ='werkstatt', gates `reparatur_*` provisions on `reparatur_termine.status='erledigt'`). It **did not** touch `release-makler-provisionen`. So the makler completion gate (this FG's core) is still missing there.
- `kitta/werkstatt-provision-inbound-only` HEAD = `ae843a2ad … drop outbound reparatur-assign trigger` — this branch rewrote `release-makler-provisionen` to `partner_provisionen` / `partner_typ='makler'` (57-line refactor) and reads `operative_status` for the storno-pass, **but its release-pass is still the bare `hold_until <= now && operative_status !== 'storniert'` timer with the NULL-default-release bug** (verified: lines ~86, ~138-140). This is the version FG4-A should land on top of.
- The provision **model** is in flux across these sub-branches (one added an outbound reparatur trigger, `inbound-only` drops it — per the "inbound-Haftpflicht-only" broadcast). **FG4 must not participate in that churn** — it changes only the makler *release timing*, not who gets paid.

**Recommended handoff:** give this plan to the provision-lane owner (ws6 / inbound-only) so Task 2 is applied to their `partner_provisionen` version in one place, or serialize (wait for their makler-cron rewrite to land on `staging`, then apply FG4 on top). Do NOT open a parallel worktree that re-touches `release-makler-provisionen` against `makler_provisionen` — that would resurrect the dropped table.

**Overlap with FG1 (operative_status coupling):** FG1 makes `endzustand-actions` set `operative_status='abgeschlossen'` when `claims.status` goes to a positive terminal. FG4-A deliberately checks **both** `operative_status='abgeschlossen'` OR the positive `claims.status` terminals, so it is correct **before and after** FG1 lands (if FG1 lands, the `operative_status` branch simply also fires for endzustand-closed claims — no conflict, no double-count). FG4 has **no ordering dependency** on FG1.

---

## Self-Review
- **Completion signal chosen (FG4-A):** `operative_status='abgeschlossen'` (positive engine terminal, live) OR positive `claims.status` terminal (`reguliert_vollstaendig` / `termin_durchgefuehrt`). Evidence: `state-machine.ts:20-49`, `fall-status-claim-mapping.ts:29-37`, `lifecycle.ts:133-142`, live distribution (43 NULL status / operative_status the real cursor). NULL/unknown → HOLD (fixes default-release). Model untouched.
- **zahlungspruefung (FG4-B):** RETIRED, not rebuilt — its source table is fed by a `@deprecated` cron, the live `abrechnungen` pipeline dunning-covers overdue and intentionally never sets `ist_aktiv=false`, and the cron isn't scheduled. Plus a one-shot migration un-locks the one live SV it already deactivated (`7f79e570…`, guarded by `deaktiviert_am IS NULL` so no admin-deactivated SV is resurrected).
- **Task count:** 5 (helper+test / makler-cron gate+test / retire zahlungspruefung / one-shot reactivation migration / build+reconcile). **DDL:** one data-only `UPDATE` migration via `apply_migration` (Task 4) — no schema change; everything else code-only.
- **Coordination:** PROVISION domain — makler cron already rewritten to `partner_provisionen` on ws6/inbound-only WITHOUT the completion gate; hand FG4 to that lane or serialize. No parallel provision session. No FG1 ordering dependency (gate checks both axes).
- **Rules honored:** DDL via MCP + filename==tracked-version (Task 4); return-shape/`dynamic`/auth-guard preserved (Task 2); no `main` push (PR→staging); no unaccompanied stash; backend-only so ASCII comments OK; if any Makler email copy is edited, real Umlaute required.
- **Risk:** low/dormant today (0 pending makler provisions; zahlungspruefung unscheduled) — but both are wired-dangerous and the makler cron is currently broken on `aar-956` (phantom table). The real live harm fixed now is the SV lockout (Task 4). The gate + retirement prevent the money/ops foot-guns from firing when these crons are (re)scheduled against `partner_provisionen`.
