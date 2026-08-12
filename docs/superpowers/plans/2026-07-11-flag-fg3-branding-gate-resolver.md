# Branding-Gate Shared-Resolver Implementation Plan
> # ✅ ERFUELLT (verifiziert 2026-08-12) — NICHT MEHR AUSFUEHREN
>
> Der geplante Shared-Resolver fuer das Branding-Gate existiert:
> **`src/lib/branding/bezahl-status.ts`** („Paid-Perk-Ladehelfer (Aaron 03.08.): liest die
> Bezahl-Grundlage fuer die Whitelabel-Wirkung"), **7 Consumer** im Repo.
>
> Die Umsetzung kam ueber die Whitelabel=Paid-Perk-Lane (Memory
> `COORDINATION-whitelabel-paid-perk-und-admin-audit`), nicht ueber diesen Plan — inhaltlich
> deckungsgleich: EIN Resolver statt inline-Gates, bewusst via Admin-Client, gibt nur einen
> booleschen Ableitungswert nach aussen.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` syntax.
> **Isolation:** implement in a dedicated worktree (`node scripts/new-session-worktree.mjs flag-fg3-branding-gate-resolver`).
**Goal:** Extract the customer-facing branding gate (`verifiziert && use_custom_branding`) and the intentionally-different SV-own gate (`use_custom_branding` alone) into two named, unit-tested pure helpers, migrate every call-site onto them, and add a third named gate `svDarfFaelleEmpfangen(sv)` that centralises the dispatchable predicate — so the `frist_ueberschritten` intent/enforcement gap becomes a single explicit toggle instead of five inline copies.

**Architecture:** Three new pure predicates live in `src/lib/branding/gate.ts` (customer + SV-own branding) and one in `src/lib/sv/dispatch-gate.ts` (case-reception). They take a plain fields-object (NOT a Supabase client), matching the existing `getSvStatusBucket` pure-helper pattern in `src/lib/sv/queries.ts`, so vitest tests need zero DB mocking. All customer-facing branding resolvers (`kunden-theme.ts`, `token-theme.ts`, `kunde/termin/[token]/page.tsx`, the email `EmailLayout` decision via `resolveEmailBranding`, and `kunde/layout.tsx` via `resolveKundenTheme`) import the customer helper; the SV-own portal resolvers (`resolve-theme.ts`, `gutachter/layout.tsx`) import the SV-own helper. `applyDispatchableFilter` becomes the single wiring point for `svDarfFaelleEmpfangen`, so the (contested) `frist_ueberschritten` exclusion is one flag, not scattered logic.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, vitest.

## Global Constraints
- Regel 1: never push to `main`. Feature branch `kitta/aar-<nr>-<slug>`, PR against `staging`.
- Regel 2: DDL only via Supabase MCP `apply_migration`. **This plan expects NO DDL** — code-only. If a task ever needs schema change, stop and re-scope.
- Regel 3: no unaccompanied stash at session end.
- Server-actions return `{ ok, error? }` (or `{ success, error? }` consistent within a file) + `revalidatePath`. These helpers are pure predicates, not server-actions — no `revalidatePath` needed for the helpers themselves; migrated call-sites keep their existing revalidation.
- No `throw` from `'use server'` files except auth-guards; never export constants/types from `'use server'` files (the new helpers live in plain `.ts` modules, NOT `'use server'`).
- UI strings use real German umlauts (ä/ö/ü/ß). Backend/comment/log text may be ASCII.
- Do not add new `check:token-audit` / `check:component-set` / status-ratchet violations. This plan touches TS logic + one `page.tsx` data-read, no new className hex/tokens.
- Commit messages carry the 7-point Audit block + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **file:line references are Stand 2026-07-11 — RE-VERIFY every referenced line with Read/Grep before editing each task.** Another session runs an admin/dispatch/kb/sv HEADER refactor on `aar-956`; likely disjoint, but before touching `src/app/kunde/layout.tsx` confirm it is not concurrently edited (`git log -1 --format=%cd -- src/app/kunde/layout.tsx` + `git status`).

---

## ✅ ENTSCHEIDUNG (Aaron 2026-07-11) — `frist_ueberschritten` DURCHSETZEN

Der Decision-Gate (Task 3.0: „enforce (A) vs. nur Copy-Fix (B)") ist **AUFGELÖST → Option A (durchsetzen)**. Ein SV mit `verifizierung_status='frist_ueberschritten'` bekommt **keine Fälle mehr zugewiesen** — `svDarfFaelleEmpfangen(sv)` schließt ihn aus, verdrahtet im zentralen `applyDispatchableFilter`. Fallback-B (nur E-Mail-Text ändern) **entfällt**; die Reminder-E-Mail wird dadurch inhaltlich korrekt.

⚠ **NULL-Trap zwingend beachten** (aus der Risk-Note): der Ausschluss MUSS NULL-safe sein — SVs mit `verifizierung_status = NULL` / `ausstehend` bekommen **weiter** Fälle. Nutze `.or('verifizierung_status.is.null,verifizierung_status.neq.frist_ueberschritten')`, NICHT ein nacktes `.neq(...)` (das würfe alle NULL-Status-SVs = die Mehrheit raus → Dispatch-Ausfall). Baue Task 3.0 direkt als Option A, nicht als Blocker.

---

## Context: what already exists (verified)

- **Customer branding gate `verifiziert && use_custom_branding` is inline-duplicated** across:
  - `src/lib/branding/kunden-theme.ts:65-66` (`sv.verifiziert !== true` / `sv.use_custom_branding !== true`) — used by `kunde/layout.tsx` via `resolveKundenTheme`.
  - `src/lib/branding/token-theme.ts:33-34` (`resolveBrandingFromSvId`) — feeds ALL magic-link routes (`/upload/*`, `/flow/*`, `resolveBrandingFromFallId`) AND email branding via `resolveEmailBranding`/`toEmailBrand`.
  - `src/app/kunde/termin/[token]/page.tsx:152-153` — **DIVERGENT: keys on `verifiziert_am` (timestamp), not the `verifiziert` boolean.** (`svVerifiziert = !!svRow?.verifiziert_am`.)
  - `src/lib/email/google/templates/layout.tsx` — the template itself is `brand`-driven (correct); the gate decision lives upstream in `resolveEmailBranding` (`token-theme.ts`). So the email "call-site" = the `token-theme.ts` path, already covered. **No gate lives in `layout.tsx`** — it only renders whatever `brand` it is handed. (Documented so a worker does not invent a gate there.)
- **SV-own portal gate `use_custom_branding` ALONE** (deliberately no `verifiziert`, so SV can brand during onboarding):
  - `src/lib/branding/resolve-theme.ts:44` (org) + `:59` (sv) — `org.use_custom_branding && (…)` / `sv.use_custom_branding && (…)`.
  - `src/app/gutachter/layout.tsx:81` — `const useBrand = !!sv?.use_custom_branding`.
- **`applyDispatchableFilter`** (`src/lib/sv/queries.ts:38-44`) is the SINGLE central case-reception gate. It filters `ist_aktiv=true ∧ portal_zugang_freigeschaltet=true ∧ gesperrt_seit IS NULL ∧ geloescht_am IS NULL`. Consumed by the universal engine (`src/lib/termine/engine/matching.ts:132` → drives `findBestSV` → `planeTerminOeffentlich`) and `src/app/api/sv-zuweisung/route.ts:112`. **It does NOT check `verifizierung_status`.**
- **`frist_ueberschritten` is set only by the cron** `src/app/api/cron/verifizierung-reminder/route.ts:60-64` and enforced ONLY as a banner intent. CHECK enum (`sachverstaendige_verifizierung_status_check`, baseline `:10239`): `NULL | 'ausstehend' | 'geprueft' | 'frist_ueberschritten'`.
- **DB guard trigger** `guard_sachverstaendige_privilegien` (baseline `:2173`) already blocks non-admin/non-service_role UPDATE of `verifiziert`/`ist_aktiv`/`verifizierung_status`/`use_custom_branding`/`gesperrt_seit`. All verifizierung actions use `createAdminClient()` → bypass the guard legitimately.

### ⚠️ CONTESTED PRODUCT DECISION — `frist_ueberschritten` enforcement (READ BEFORE Phase 3)
Two documented product intents **contradict each other**:
- **Email copy** (`verifizierung-reminder/route.ts:74`): *"…damit wir dir weiterhin Fälle zuweisen können"* → implies case-assignment stops once frist is missed.
- **`gutachter/layout.tsx:131-137` (AAR-692)**: *"Tier 2 … ist kein Matching-Blocker — der Dispatchable-Filter lässt SVs durch auch ohne Tier-2-Freigabe. Tier 2 schaltet lediglich das „Verifiziert"-Badge frei."* → explicit decision NOT to block.

**This plan builds `svDarfFaelleEmpfangen(sv)` regardless** (naming the semantics + centralising the predicate) and threads it through `applyDispatchableFilter`. Whether it actually EXCLUDES `frist_ueberschritten` is a **flagged decision (Task 3.0)** with a recommended default and a copy-fix fallback. A worker MUST NOT silently pick a side — surface it.

---

## File Structure

```
src/lib/branding/
  gate.ts                      # NEW — kundenBrandingErlaubt() + svEigenBrandingErlaubt() pure predicates
  __tests__/
    gate.test.ts               # NEW — TDD for both branding predicates
  kunden-theme.ts              # EDIT — import + use kundenBrandingErlaubt()
  token-theme.ts               # EDIT — resolveBrandingFromSvId uses kundenBrandingErlaubt()
  resolve-theme.ts             # EDIT — org + sv branches use svEigenBrandingErlaubt()
src/lib/sv/
  dispatch-gate.ts             # NEW — svDarfFaelleEmpfangen() pure predicate + Sv-fields type
  __tests__/
    dispatch-gate.test.ts      # NEW — TDD for case-reception predicate
  queries.ts                   # EDIT — applyDispatchableFilter threads verifizierung_status per decision 3.0
src/app/kunde/termin/[token]/page.tsx   # EDIT — select `verifiziert`; use kundenBrandingErlaubt()
src/app/gutachter/layout.tsx            # EDIT — useBrand via svEigenBrandingErlaubt()
src/app/kunde/layout.tsx                # NO logic change (resolveKundenTheme already fixed) — verify only
scripts/check-token-audit.mjs           # OPTIONAL (Task 6) — add inline-branding-gate ratchet detection
```

**Interfaces (final, settled):**

```typescript
// src/lib/branding/gate.ts
/** Fields both branding predicates read. Superset kept minimal & explicit. */
export type BrandingGateFields = {
  verifiziert: boolean | null
  use_custom_branding: boolean | null
}
/**
 * Customer-facing gate: the Kunde/Magic-Link/Email surfaces show the SV's brand
 * ONLY when the SV is verified AND opted into custom branding. Unverified partners
 * never brand the customer's view (Anti-Versuchskaninchen / brand-trust / access).
 */
export function kundenBrandingErlaubt(sv: BrandingGateFields | null | undefined): boolean {
  return sv?.verifiziert === true && sv?.use_custom_branding === true
}
/**
 * SV-own-portal gate: the SV may customise its OWN portal (and org sub-SVs inherit)
 * as soon as use_custom_branding is on — deliberately BEFORE verification, so the SV
 * can brand during onboarding. Named distinctly so the asymmetry is explicit, not a bug.
 */
export function svEigenBrandingErlaubt(
  entity: Pick<BrandingGateFields, 'use_custom_branding'> | null | undefined,
): boolean {
  return entity?.use_custom_branding === true
}
```

```typescript
// src/lib/sv/dispatch-gate.ts
export type SvDispatchGateFields = {
  ist_aktiv: boolean | null
  portal_zugang_freigeschaltet: boolean | null
  gesperrt_seit: string | null
  geloescht_am: string | null
  verifizierung_status: string | null
}
/**
 * Case-reception gate: a SV may RECEIVE new cases only when technically active,
 * portal-unlocked (deposit paid), not admin-blocked, not soft-deleted
 * — and (per decision FG3-Task-3.0) not 'frist_ueberschritten'.
 * Pure mirror of applyDispatchableFilter's SQL predicate so TS callers and the
 * DB query agree on ONE definition.
 */
export function svDarfFaelleEmpfangen(sv: SvDispatchGateFields | null | undefined): boolean {
  if (!sv) return false
  if (sv.ist_aktiv !== true) return false
  if (sv.portal_zugang_freigeschaltet !== true) return false
  if (sv.gesperrt_seit != null) return false
  if (sv.geloescht_am != null) return false
  // Decision FG3-Task-3.0 — enable ONLY if Aaron confirms enforcement:
  // if (sv.verifizierung_status === 'frist_ueberschritten') return false
  return true
}
```

---

## Phase 1 — Branding gate helpers (customer + SV-own)

### Task 1.1 — Create `kundenBrandingErlaubt` + `svEigenBrandingErlaubt` (TDD)
- [ ] RE-VERIFY: `Read src/lib/branding/kunden-theme.ts:56-66` and `token-theme.ts:27-35` still gate on `verifiziert !== true` + `use_custom_branding !== true`. Confirm `src/lib/branding/__tests__/` exists (peer: `theme.test.ts`).
- [ ] Write failing test `src/lib/branding/__tests__/gate.test.ts` against REAL (not-yet-existing) exports:
  - `kundenBrandingErlaubt`: `{verifiziert:true,use_custom_branding:true}` ⇒ `true`; `{verifiziert:true,use_custom_branding:false}` ⇒ `false`; `{verifiziert:false,use_custom_branding:true}` ⇒ `false`; `{verifiziert:false,use_custom_branding:false}` ⇒ `false`; `null`/`undefined` ⇒ `false`; `{verifiziert:null,use_custom_branding:true}` ⇒ `false` (null ≠ true).
  - `svEigenBrandingErlaubt`: `{use_custom_branding:true}` ⇒ `true`; `{use_custom_branding:false}` ⇒ `false`; `{use_custom_branding:null}`/`null`/`undefined` ⇒ `false`. **Explicitly assert the asymmetry**: `svEigenBrandingErlaubt({use_custom_branding:true})` is `true` even though the same input would be `false` for `kundenBrandingErlaubt` when `verifiziert` is not `true`.
- [ ] Run `npx vitest run src/lib/branding/__tests__/gate.test.ts` → confirm RED (module missing).
- [ ] Create `src/lib/branding/gate.ts` with the two functions + `BrandingGateFields` type exactly as in Interfaces above (German-optional comments, ASCII fine).
- [ ] Run the test → confirm GREEN.
- [ ] `npx tsc --noEmit` green.
- [ ] Commit `feat(FG3): kundenBrandingErlaubt + svEigenBrandingErlaubt pure gate helpers` with Audit block.

### Task 1.2 — Migrate `kunden-theme.ts` onto `kundenBrandingErlaubt`
- [ ] RE-VERIFY `kunden-theme.ts:56-66` shape (the `sv` select includes `verifiziert, use_custom_branding`).
- [ ] Replace the two-line gate (`if (sv.verifiziert !== true) return fallback` + `if (sv.use_custom_branding !== true) return fallback`) with:
  `if (!kundenBrandingErlaubt(sv)) return fallback`
  Keep the subsequent `if (!sv.brand_primary && !sv.brand_theme) return fallback` (that is a theme-content check, NOT the trust gate — leave it).
- [ ] Add `import { kundenBrandingErlaubt } from './gate'`.
- [ ] `npx tsc --noEmit` green. (No behaviour change — pure refactor; the existing `kunde/layout.tsx` consumer is unaffected.)
- [ ] Commit `refactor(FG3): kunden-theme uses shared kundenBrandingErlaubt` + Audit.

### Task 1.3 — Migrate `token-theme.ts` (magic-link + email) onto `kundenBrandingErlaubt`
- [ ] RE-VERIFY `token-theme.ts:26-35` (`resolveBrandingFromSvId`) — this is the shared inner resolver for ALL token routes AND `resolveEmailBranding`. Confirm the `sv` select at `:27-31` includes `verifiziert, use_custom_branding`.
- [ ] Replace `if (sv.verifiziert !== true) return FALLBACK` + `if (sv.use_custom_branding !== true) return FALLBACK` with `if (!kundenBrandingErlaubt(sv)) return FALLBACK`. Keep the `brand_primary/brand_theme` content check.
- [ ] Add `import { kundenBrandingErlaubt } from './gate'`.
- [ ] `npx tsc --noEmit` green. This single edit covers `/upload/dokumente`, `/upload/zb1`, `/flow`, `resolveBrandingFromFallId`, and every customer email (`resolveEmailBranding` → `toEmailBrand` reads `useBrand`, which is only `true` when this passed).
- [ ] Commit `refactor(FG3): token-theme (magic-link + email) uses shared kundenBrandingErlaubt` + Audit.

---

## Phase 2 — Fix the divergent `verifiziert_am` call-site + SV-own portal

### Task 2.1 — `kunde/termin/[token]/page.tsx`: switch `verifiziert_am` → `verifiziert` + use helper
- [ ] RE-VERIFY `src/app/kunde/termin/[token]/page.tsx:124-153`. Confirm the `svRow` select at `:126` currently reads `... use_custom_branding, verifiziert_am` and the gate at `:152-153` is `const svVerifiziert = !!svRow?.verifiziert_am` / `const brandEnabled = svVerifiziert && !!svRow?.use_custom_branding`.
- [ ] Change the select `:126`: replace `verifiziert_am` with `verifiziert` (the canonical gate boolean — baseline `:10373` doc: `verifiziert` is THE branding gate; `verifiziert_am` is an audit timestamp co-written with it). Confirm no other use of `svRow.verifiziert_am` remains in the file (grep the file; the abgeschlossen-branch at `:58-81` does not read it).
- [ ] Replace `:152-153` two-liner with:
  `const brandEnabled = kundenBrandingErlaubt(svRow)`
  (delete the now-unused `svVerifiziert`).
- [ ] Add `import { kundenBrandingErlaubt } from '@/lib/branding/gate'`.
- [ ] `npx tsc --noEmit` green. **UI-reachability note:** no new UI; the branded tracking page keeps rendering; only the gate source column changes (verifiziert bool instead of its timestamp twin — equivalent in practice, correct in principle).
- [ ] **Full build for this route** (`page.tsx` route file → Next 15 validator): `npm run build` green (per AGENTS §Audit-1: routes → full build, not just tsc).
- [ ] Commit `fix(FG3): kunde/termin tracking gate keys on verifiziert boolean via shared helper` + Audit (Spec note: this closes the `verifiziert_am`-vs-`verifiziert` inconsistency flagged in the FG3 audit).

### Task 2.2 — `resolve-theme.ts` (SV-own portal) onto `svEigenBrandingErlaubt`
- [ ] RE-VERIFY `resolve-theme.ts:44` (`org?.use_custom_branding && (org.brand_primary || org.brand_theme)`) and `:59` (`sv.use_custom_branding && (sv.brand_primary || sv.brand_theme)`).
- [ ] Replace the `*.use_custom_branding` sub-expression with the helper, preserving the theme-content half:
  `:44` → `if (svEigenBrandingErlaubt(org) && (org.brand_primary || org.brand_theme)) {`
  `:59` → `if (svEigenBrandingErlaubt(sv) && (sv.brand_primary || sv.brand_theme)) {`
- [ ] Add `import { svEigenBrandingErlaubt } from './gate'`.
- [ ] `npx tsc --noEmit` green. Behaviour identical (`x.use_custom_branding` truthy ⟺ helper true for the boolean column).
- [ ] Commit `refactor(FG3): SV-own theme resolver uses shared svEigenBrandingErlaubt` + Audit.

### Task 2.3 — `gutachter/layout.tsx` (SV-own portal) onto `svEigenBrandingErlaubt`
- [ ] RE-VERIFY `src/app/gutachter/layout.tsx:81` (`const useBrand = !!sv?.use_custom_branding`). Confirm the `svSelect` at `:23` includes `use_custom_branding`.
- [ ] Replace `:81` with `const useBrand = svEigenBrandingErlaubt(sv)`.
- [ ] Add `import { svEigenBrandingErlaubt } from '@/lib/branding/gate'`.
- [ ] `npx tsc --noEmit` green. **Do NOT touch the `frist_ueberschritten`/Tier-2 banner logic here** — that is Phase 3's decision surface; this task is branding-only.
- [ ] **Full build** (layout route file): `npm run build` green.
- [ ] Commit `refactor(FG3): gutachter-layout branding uses shared svEigenBrandingErlaubt` + Audit.

### Task 2.4 — Verify `kunde/layout.tsx` needs no change
- [ ] Confirm `src/app/kunde/layout.tsx:281` calls `resolveKundenTheme(user.id)` and does NOT inline any `verifiziert`/`use_custom_branding` check (it consumes `branding.useBrand`). It is already covered transitively by Task 1.2. Add NO code. Record in the Phase-2 commit body or a short note that `kunde/layout.tsx` is coverage-verified, not edited. (Coordination: this is the file the concurrent aar-956 header refactor might touch — since FG3 makes no edit here, conflict risk ≈ 0.)

---

## Phase 3 — `svDarfFaelleEmpfangen` + `frist_ueberschritten` enforcement

### Task 3.0 — DECISION GATE (blocking; do not skip)
- [ ] Present the CONTESTED decision (email vs AAR-692, see Context) to Aaron and record the answer in the plan/PR. Options:
  - **(A) Enforce (RECOMMENDED default):** exclude `verifizierung_status='frist_ueberschritten'` from case-reception. Aligns dispatch with the email promise; matches the FG3 audit intent ("Intent≠Enforcement" → enforce). Note: contradicts the AAR-692 layout comment → that comment must be updated (Task 3.3) to reflect "frist blocks reception; the *badge* is a separate concern".
  - **(B) Do NOT enforce:** keep today's behaviour (frist is badge-only). Then the fallback is to **fix the email copy** so it stops promising assignment (Task 3.4), and the AAR-692 comment stays authoritative.
- [ ] Whichever is chosen, the pure helper `svDarfFaelleEmpfangen` is still built (Task 3.1) — only the single `frist_ueberschritten` line and the SQL filter (Task 3.2) are toggled accordingly. Encode the decision as a named boolean/const, not scattered ifs.

### Task 3.1 — Create `svDarfFaelleEmpfangen` (TDD)
- [ ] RE-VERIFY `src/lib/sv/queries.ts:38-44` (`applyDispatchableFilter` clauses) so the TS predicate mirrors it exactly.
- [ ] Write failing test `src/lib/sv/__tests__/dispatch-gate.test.ts` against REAL exports:
  - all-good (`ist_aktiv:true, portal_zugang_freigeschaltet:true, gesperrt_seit:null, geloescht_am:null, verifizierung_status:'geprueft'`) ⇒ `true`.
  - `ist_aktiv:false` ⇒ `false`; `portal_zugang_freigeschaltet:false` ⇒ `false`; `gesperrt_seit:'2026-...'` ⇒ `false`; `geloescht_am:'2026-...'` ⇒ `false`; `null` input ⇒ `false`.
  - `verifizierung_status:'frist_ueberschritten'` (else all-good): assert per DECISION 3.0 — `false` if (A), `true` if (B). Add a comment linking the assertion to the recorded decision so it is not silently flipped.
  - `verifizierung_status:'ausstehend'` ⇒ `true` (only `frist_ueberschritten` ever blocks; `ausstehend` and `geprueft` both pass).
- [ ] Run `npx vitest run src/lib/sv/__tests__/dispatch-gate.test.ts` → RED.
- [ ] Create `src/lib/sv/dispatch-gate.ts` per Interfaces, with the `frist_ueberschritten` line commented-in (A) or commented-out (B) matching 3.0.
- [ ] Run test → GREEN. `npx tsc --noEmit` green.
- [ ] Commit `feat(FG3): svDarfFaelleEmpfangen pure case-reception gate` + Audit.

### Task 3.2 — Thread the gate through `applyDispatchableFilter` (single wiring point)
- [ ] RE-VERIFY `applyDispatchableFilter` is still the sole dispatchable path: `Grep applyDispatchableFilter src/` — consumers are `matching.ts:132`, `sv-zuweisung/route.ts:112`, `getDispatchableSvs`. (`plane-termin-oeffentlich.ts` reaches it transitively via `findBestSV`.)
- [ ] **If decision (A):** add `.neq('verifizierung_status', 'frist_ueberschritten')` to the chain in `applyDispatchableFilter` (`queries.ts:38-44`). **Gotcha:** `verifizierung_status` is nullable and PostgREST `.neq` drops NULL rows. Use a NULL-safe form so `NULL`/`ausstehend`/`geprueft` all pass and only `frist_ueberschritten` is excluded — e.g. `.or('verifizierung_status.is.null,verifizierung_status.neq.frist_ueberschritten')`. Verify with a READ `execute_sql` (Supabase MCP, READ-only) count comparing before/after against a known `frist_ueberschritten` SV if one exists; otherwise document the SQL semantics in the commit.
  - Update the `applyDispatchableFilter` JSDoc (`queries.ts:24-33`) to list the new clause + reference `svDarfFaelleEmpfangen` as the TS mirror.
  - Update the two baseline column comments' expectation is out of scope (DDL), but note in commit that SQL filter and TS helper now agree.
- [ ] **If decision (B):** make NO SQL change; instead add a JSDoc line in `queries.ts` stating that `frist_ueberschritten` is intentionally NOT a reception blocker (badge-only) and that `svDarfFaelleEmpfangen` reflects that. Proceed to Task 3.4.
- [ ] Regression: run the engine matcher test `npx vitest run src/lib/termine/engine/__tests__/finde-beste-person.test.ts` (it mocks `applyDispatchableFilter`, so it stays green — confirms no signature break). Run `npx vitest run src/lib/dispatch/__tests__/findBestSV.matching.test.ts` if present.
- [ ] `npm run build` green (touches a lib consumed by API routes + engine).
- [ ] Commit `feat(FG3): applyDispatchableFilter excludes frist_ueberschritten [decision A]` OR `docs(FG3): applyDispatchableFilter — frist_ueberschritten stays badge-only [decision B]` + Audit.

### Task 3.3 — (Decision A only) Reconcile the AAR-692 layout comment
- [ ] RE-VERIFY `gutachter/layout.tsx:131-137`. Update the AAR-692 comment so it no longer claims "Tier 2 … ist kein Matching-Blocker": state that `frist_ueberschritten` now excludes the SV from case-reception (via `applyDispatchableFilter` / `svDarfFaelleEmpfangen`), while the *"Verifiziert"-Badge* remains a separate `verifiziert`-driven concern. Do NOT re-introduce a red Tier-2 banner unless Aaron asks (the comment's "irreführend" rationale for removing the banner can stand). Comment-only edit.
- [ ] Commit `docs(FG3): update AAR-692 comment — frist now blocks reception` + Audit.

### Task 3.4 — (Decision B only) Fix the misleading email copy
- [ ] RE-VERIFY `verifizierung-reminder/route.ts:74`. Change the sentence *"…damit wir dir weiterhin Fälle zuweisen können."* to text that does NOT promise assignment-stop — e.g. *"…damit dein „Verifiziert"-Status erhalten bleibt und du weiterhin optimal gelistet wirst."* (real umlauts; adjust to Aaron's wording). This is a user-facing email string → umlauts mandatory. Do the same for the Tag-7 reminder `:106` if it makes the same promise (re-verify).
- [ ] Commit `fix(FG3): correct verifizierung-reminder email copy (no false assignment-stop) [decision B]` + Audit.

---

## Phase 4 — `verifiziert`-clear-on-doc-removal (scope decision)

### Task 4.0 — Scope out with evidence (default), or add clear-hook
- [ ] RE-VERIFY there is **no live path that removes an already-verified SV's Pflichtdokumente**: `verifiziert` is set true only by `dokumenteAlleFreigeben` / `gibBasicSvFrei` / admin `[id]/actions.ts:145`, and cleared only by explicit rejection (`pflichtdokumentZurueckweisen:350-353`) / re-verify toggle (`actions.ts:146`). The only `.from('pflichtdokumente').delete()` calls are seed/test cleanup (`api/seed-testdata/route.ts:87`, `scripts/verify-f04-db-integration.mjs`). No production doc-removal flow exists.
- [ ] **Default: scope OUT** — document in the plan/PR: "FG3 point 3 (clear `verifiziert` when Pflichtdokumente are removed) has no live trigger surface today; the DB guard already blocks self-tamper. Revisit if/when an admin/self doc-delete flow is added — the clear belongs there (set `verifiziert=false, verifiziert_am=null, verifiziert_von=null`, mirroring `pflichtdokumentZurueckweisen`)." No code.
- [ ] If Aaron instead wants a proactive re-check: add a small pure helper `pflichtdokumenteVollständig(rows)` + a re-evaluation call in whatever doc-delete action gets built — but only when that action exists. Not built speculatively (YAGNI, matches the audit's "leave real facts alone" principle).

---

## Phase 5 — Verification & finish

### Task 5.1 — Full suite + audits
- [ ] `npx vitest run src/lib/branding/__tests__/gate.test.ts src/lib/sv/__tests__/dispatch-gate.test.ts` — all green (paste counts).
- [ ] `npx vitest run` (or at least the branding + sv + engine dirs) — no regressions.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run build` — green (routes touched: `kunde/termin/[token]`, `gutachter/layout`).
- [ ] `npm run check:token-audit` — no NEW violations (this plan adds no hex/tokens). `npm run check:component-set` / `npm run check:knip` — no new violations (new files are imported → not dead).
- [ ] Grep sweep: confirm ZERO remaining inline customer gates — `Grep "verifiziert[^_].*use_custom_branding|use_custom_branding.*verifiziert[^_]"` and `Grep "verifiziert !== true"` return only `gate.ts`. Confirm SV-own sites (`resolve-theme.ts`, `gutachter/layout.tsx`) route through `svEigenBrandingErlaubt`.

### Task 5.2 — Optional ratchet (only if cheap)
- [ ] OPTIONAL: extend `scripts/check-token-audit.mjs` (or a new tiny `check:flag-drift` per audit §8.4) to flag NEW inline `verifiziert && use_custom_branding` compositions outside `src/lib/branding/gate.ts`. Baseline = 0 after this plan (all migrated). Keep local `--warn`, CI `--ratchet`, matching the existing ratchet convention. Skip if it balloons scope — the grep sweep in 5.1 is the minimum bar.

### Task 5.3 — Finish
- [ ] superpowers:finishing-a-development-branch — clean tree, PR against `staging`, PR body notes: the two branding helpers + the case-reception helper, the `verifiziert_am→verifiziert` fix, and **the recorded 3.0 decision (A or B)** prominently (it changes dispatch behaviour or email copy).
- [ ] Session-close checklist (Regel 3): `git status` clean, `git stash list` empty, all commits pushed.

---

## Self-Review

- **Access-control regressions to watch (top risk):**
  1. `kundenBrandingErlaubt` MUST stay `&&` — a bug flipping it to `||` would leak unverified-partner branding to customers (the exact leak FG3 exists to prevent). The 4-case truth-table test (verified-only⇒false, branding-only⇒false) is the guard.
  2. The `kunde/termin` switch from `verifiziert_am` to `verifiziert`: if any SV in prod has `verifiziert=true` but `verifiziert_am=null` (or vice-versa) the branded-tracking gate flips for that SV. They are co-written everywhere (`actions.ts:145`, `verifizierung-actions.ts:425/466/352`), so divergence should be empty — but a READ `execute_sql` sanity count (`WHERE (verifiziert=true) <> (verifiziert_am IS NOT NULL)`) before shipping is cheap insurance. Expected 0.
  3. `svEigenBrandingErlaubt` must NOT accidentally require `verifiziert` — that would strip onboarding SVs of their own-portal branding (the intentional asymmetry). The asymmetry test asserts this.
  4. `applyDispatchableFilter` NULL-handling (decision A): a naive `.neq('verifizierung_status','frist_ueberschritten')` silently drops every SV whose status is NULL (most of them) → mass dispatch outage. The NULL-safe `.or(...)` form + the "`ausstehend`/NULL pass" test prevent this. HIGH-severity if missed.
- **Scope discipline:** `FallKontakteCard.tsx:106` (`sv?.verifiziert ? 'Verifiziert'`) and `KundeTerminDetailClient.tsx:286` are *badge* reads, not branding gates — intentionally left alone. `branding-actions.ts` / `api/branding/{save,reset}` are writers — untouched. `gutachter/willkommen/page.tsx` loads SV-own branding for onboarding preview — optional Boy-Scout adopt of `svEigenBrandingErlaubt`, not required (it does not gate customer visibility).
- **No DDL:** every task is TS/comment/copy. If a worker feels the urge to alter the CHECK enum or add a column, STOP — the plan does not need it.
- **Anti-over-engineering:** helpers are pure fields-in/bool-out (no client injection), so tests need no Supabase mock — the simplest thing that removes the duplication. `applyDispatchableFilter` stays the single SQL wiring point; we do not rewrite the engine to call the TS helper row-by-row (the SQL filter is the performant path; the TS helper is for non-query callers + as the named spec of the predicate).
- **Ordering:** Phase 1 (helpers + branding refactors, zero behaviour change) is safe to ship even if Phase 3's decision stalls. Phase 3 is the only behaviour-changing phase and is gated on Task 3.0. Phase 4 is documentation-only by default.
- **Coordination:** only `src/app/kunde/layout.tsx` overlaps the concurrent aar-956 header refactor, and FG3 makes NO edit there (Task 2.4 is verify-only) → conflict risk negligible. Confirm at start regardless.
