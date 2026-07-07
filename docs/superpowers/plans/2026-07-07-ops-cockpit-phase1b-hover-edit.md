# Ops-Cockpit Phase 1b — KB Board Hover-Split + Inline Fact-Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use `- [ ]`.

**Goal:** Make the KB board cards editable ("voll editierbar" for facts): a hover-split popover on each `MeineArbeitBoard` card that shows the claim's key fields with a curated set inline-editable (write → `claims` base + audit → `timeline`), plus the next-best-action CTA. Facts only — the hard **phase-override** (which would touch the shared `v_claim_phase`) is deliberately deferred to Phase 1c to keep this phase additive and collision-free.

**Architecture:** A `'use server'` action `updateClaimField(claimId, field, value)` guarded by an explicit role+ownership check (KB may edit own claims, admin any), writing only whitelisted `claims`-native columns, appending a `timeline` audit row, and `revalidatePath('/mitarbeiter')`. A client `ClaimHoverCard` popover renders on card hover with inline-edit fields (✎ → input → save via the action) + the next-action label + quick actions (link-outs). Wired into `MeineArbeitBoard`.

**Tech Stack:** Next.js (App Router, breaking-changes version — read `node_modules/next/dist/docs/` before Next code), React client components, Supabase, Vitest.

## Global Constraints

- Branch `kitta/ops-cockpit-phase1b-hover-edit` (off staging, already checked out). Commit per task; PR against `staging`; never `main`.
- **No shared-view DDL in this phase.** Do NOT modify `v_claim_phase`, `v_claim_full`, `v_claim_base`, `v_claim_workstate`, or add `phase_override`. That is Phase 1c (isolated because `v_claim_phase` is depended on by many sessions). This phase touches only: a new server-action file, the board/hover components, and their tests. No migrations.
- **Server-action pattern (AGENTS.md):** return a Result object `{ ok: true } | { ok: false; error: string }` — never throw. `revalidatePath` the affected route. Auth guard may throw (pre-condition).
- **Write authorization:** the action must verify the caller is admin OR the claim's `kundenbetreuer_id`. Do the check EXPLICITLY (read the claim's `kundenbetreuer_id` + the caller's role) and perform the write with `createAdminClient()` (RLS on `claims` UPDATE is not assumed to cover KB; the explicit check is the gate). Reject otherwise with `{ ok:false }`.
- **Whitelist writes.** Only these `claims`-native columns are editable in this phase (verified present on `claims`, 2026-07-07): `notizen` (text), `interne_notizen` (text), `schadens_hoehe_netto` (numeric). No derived/status/owner/financial-ledger columns. An unknown field → `{ ok:false, error:'Feld nicht editierbar' }`.
- **Audit every write:** insert into `timeline` (columns verified: `claim_id, typ, titel, beschreibung, erstellt_von, metadata, created_at`) — `typ='kb_edit'`, `titel='Feld bearbeitet: <field>'`, `erstellt_von=user.id`, `metadata={ field, old, new }`. Audit insert is non-critical (wrap in try/catch; a timeline failure must not fail the field write).
- **All user-visible text in Umlauten.** No new inline status/color maps (`check:status-registry` ratchet). Claimondo tokens only, `rounded-ios-*`.
- Foundation contract (Phase 0, on staging): `ClaimWorkItem` has `id` (claim_id), `fallId`, `stage`, `subState`, `nextActionCode`, `isOverdue`, `overdueSinceDays`, `display:{title,kennzeichen,schadenhoehe}`. `CLAIM_WORKFLOW_META[subState].ctaLabel` gives the next-action label.

---

## File Structure

- `src/app/mitarbeiter/claim-edit-actions.ts` — NEW `'use server'`: `updateClaimField` + `ALLOWED_CLAIM_FIELDS`.
- `src/app/mitarbeiter/claim-edit-actions.test.ts` — action tests (mocked supabase + guards).
- `src/components/mitarbeiter/ClaimHoverCard.tsx` — NEW client popover (fields + inline-edit + next-action + quick actions).
- `src/components/mitarbeiter/ClaimHoverCard.test.tsx` — render + edit-state tests (renderToStaticMarkup / pure helper, env=node — no jsdom).
- `src/components/mitarbeiter/MeineArbeitBoard.tsx` — MODIFY: attach `ClaimHoverCard` to each card on hover.

---

### Task 1: `updateClaimField` server-action (whitelist + guard + audit)

**Files:**
- Create: `src/app/mitarbeiter/claim-edit-actions.ts`, `src/app/mitarbeiter/claim-edit-actions.test.ts`

**Interfaces:**
- Produces: `ALLOWED_CLAIM_FIELDS: readonly ['notizen','interne_notizen','schadens_hoehe_netto']`; `updateClaimField(claimId: string, field: string, value: string | number | null): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/mitarbeiter/claim-edit-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authGetUser = vi.fn()
const fromMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: authGetUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateClaimField } from './claim-edit-actions'

function claimRow(kb: string | null) {
  return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { kundenbetreuer_id: kb }, error: null }) }) }) }
}
beforeEach(() => { authGetUser.mockReset(); fromMock.mockReset() })

describe('updateClaimField', () => {
  it('lehnt nicht-gewhitelistete Felder ab', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await updateClaimField('c1', 'status', 'reguliert')
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/editierbar/i) })
  })
  it('lehnt ab, wenn User weder Owner noch Admin', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // profiles(role)=kundenbetreuer, claim.kundenbetreuer_id='other'
    fromMock.mockImplementation((t: string) =>
      t === 'profiles' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: 'kundenbetreuer' }, error: null }) }) }) }
      : t === 'claims' ? claimRow('other') : {})
    const res = await updateClaimField('c1', 'notizen', 'hi')
    expect(res.ok).toBe(false)
  })
  it('schreibt bei Owner + auditet', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const updateEq = vi.fn(async () => ({ error: null }))
    const insert = vi.fn(async () => ({ error: null }))
    fromMock.mockImplementation((t: string) =>
      t === 'profiles' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: 'kundenbetreuer' }, error: null }) }) }) }
      : t === 'claims' && fromMock.mock.calls.filter(c => c[0]==='claims').length === 1
        ? claimRow('u1')                                   // 1st claims call = ownership read
      : t === 'claims' ? { update: () => ({ eq: updateEq }) } // 2nd claims call = the write
      : t === 'timeline' ? { insert } : {})
    const res = await updateClaimField('c1', 'notizen', 'neue Notiz')
    expect(res).toEqual({ ok: true })
    expect(updateEq).toHaveBeenCalled()
    expect(insert).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/app/mitarbeiter/claim-edit-actions.test.ts`).

- [ ] **Step 3: Implement**

```ts
// src/app/mitarbeiter/claim-edit-actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export const ALLOWED_CLAIM_FIELDS = ['notizen', 'interne_notizen', 'schadens_hoehe_netto'] as const
type AllowedField = (typeof ALLOWED_CLAIM_FIELDS)[number]

export async function updateClaimField(
  claimId: string,
  field: string,
  value: string | number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(ALLOWED_CLAIM_FIELDS as readonly string[]).includes(field)) {
    return { ok: false, error: 'Feld nicht editierbar' }
  }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  const rolle = (profile?.rolle as string | null) ?? null
  const { data: claim, error: readErr } = await admin.from('claims').select('kundenbetreuer_id').eq('id', claimId).maybeSingle()
  if (readErr || !claim) return { ok: false, error: 'Fall nicht gefunden' }
  const isAdmin = rolle === 'admin'
  const isOwner = claim.kundenbetreuer_id === user.id
  if (!isAdmin && !isOwner) return { ok: false, error: 'Keine Berechtigung' }

  const oldVal = (claim as Record<string, unknown>)[field] ?? null
  const { error: upErr } = await admin.from('claims').update({ [field as AllowedField]: value }).eq('id', claimId)
  if (upErr) return { ok: false, error: upErr.message }

  // Audit — non-critical (must not fail the write).
  try {
    await admin.from('timeline').insert({
      claim_id: claimId, typ: 'kb_edit', titel: `Feld bearbeitet: ${field}`,
      erstellt_von: user.id, metadata: { field, old: oldVal, new: value },
    })
  } catch (err) { console.error('[updateClaimField] audit insert failed', err) }

  revalidatePath('/mitarbeiter')
  return { ok: true }
}
```
> Note: the ownership read selects `kundenbetreuer_id`; the audit's `old` value is read as `null` here (the select only fetched `kundenbetreuer_id`). If you want the true old value in the audit, extend the ownership `select` to also fetch `field` dynamically — acceptable to keep `old:null` for this phase; state your choice in the report.

- [ ] **Step 4: Run → PASS**; commit.

```bash
git add src/app/mitarbeiter/claim-edit-actions.ts src/app/mitarbeiter/claim-edit-actions.test.ts
git commit -m "feat(kb): updateClaimField server-action (whitelist + owner/admin guard + timeline audit)"
```

---

### Task 2: `ClaimHoverCard` popover (fields + inline-edit + next-action)

**Files:**
- Create: `src/components/mitarbeiter/ClaimHoverCard.tsx`, `src/components/mitarbeiter/ClaimHoverCard.test.tsx`

**Interfaces:**
- Consumes: `ClaimWorkItem` (`@/lib/ops/claim-workstate.types`), `CLAIM_WORKFLOW_META` (`@/lib/ops/claim-workflow-meta`), `updateClaimField` (`@/app/mitarbeiter/claim-edit-actions`).
- Produces: `export default function ClaimHoverCard({ item }: { item: ClaimWorkItem })`.

- [ ] **Step 1: Write the failing test** (env=node → use `renderToStaticMarkup`; the interactive edit is a `useState` client behavior, so test the pure render + an exported `formatFieldValue` helper).

```tsx
// src/components/mitarbeiter/ClaimHoverCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ClaimHoverCard, { formatFieldValue } from './ClaimHoverCard'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'
vi.mock('@/app/mitarbeiter/claim-edit-actions', () => ({ updateClaimField: vi.fn(async () => ({ ok: true })), ALLOWED_CLAIM_FIELDS: ['notizen','interne_notizen','schadens_hoehe_netto'] }))

const item: ClaimWorkItem = {
  kind: 'claim', id: 'c1', fallId: 'f1', claimNummer: 'CLM-1', stage: 'begutachtung', subState: 'gutachten',
  nextActionCode: 'gutachten_ausstehend', ownerRole: 'sv', waitingOn: 'sv', isOverdue: false, overdueSinceDays: null,
  display: { title: 'Müller', kennzeichen: 'K-AB 1', schadenhoehe: 4500 },
}
describe('ClaimHoverCard', () => {
  it('zeigt Titel, Next-Action und einen Fall-öffnen-Link', () => {
    const html = renderToStaticMarkup(<ClaimHoverCard item={item} />)
    expect(html).toContain('Müller')
    expect(html).toContain('Gutachten anfordern')
    expect(html).toContain('/faelle/f1')
  })
  it('formatFieldValue: null → "—", Zahl mit €', () => {
    expect(formatFieldValue('schadens_hoehe_netto', null)).toBe('—')
    expect(formatFieldValue('schadens_hoehe_netto', 4500)).toMatch(/4\.?500/)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `ClaimHoverCard.tsx` (`'use client'`):
- A small card/popover (absolute-positioned; the board attaches it). Shows: header (`item.display.title` + `claimNummer`), the next-best-action pill (`CLAIM_WORKFLOW_META[item.subState].ctaLabel`), a grid of fields — `schadenhoehe` (display), plus the 3 whitelisted editable fields as rows with a ✎ affordance.
- Each editable row: a `useState` toggles between display and an `<input>`; on save call `await updateClaimField(item.id, field, value)`; on `{ok:false}` show the error text; on `{ok:true}` collapse back to display (the action's `revalidatePath` refreshes server data). Keep local optimistic text.
- Export a pure `formatFieldValue(field, value)` helper (null → '—'; `schadens_hoehe_netto` → `Intl.NumberFormat('de-DE')` + ' €'; else String).
- Quick actions row: "Fall öffnen" → `<a href={/faelle/${item.fallId}}>` (or disabled if null). (No other quick actions this phase — keep it lean.)
- Claimondo tokens; Umlaute; no color maps.

- [ ] **Step 4: Run → PASS**; ratchets 0-new; commit.

```bash
git add src/components/mitarbeiter/ClaimHoverCard.tsx src/components/mitarbeiter/ClaimHoverCard.test.tsx
git commit -m "feat(kb): ClaimHoverCard - hover popover with inline fact-editing + next-action"
```

---

### Task 3: Attach the hover to `MeineArbeitBoard` cards

**Files:**
- Modify: `src/components/mitarbeiter/MeineArbeitBoard.tsx`

- [ ] **Step 1: Add the hover to each card**

Wrap each card in a `group relative` container; render `<ClaimHoverCard item={i} />` inside a `hidden group-hover:block absolute z-50 …` wrapper (top-full, left-0, width ~340px). Keep the existing card link/content as the always-visible face. The card itself stays a link to `/faelle/${fallId}`; the hover popover overlays below on hover. (Mirror the interaction from the approved visual-companion mockup.)

- [ ] **Step 2: Verify**

`npx vitest run src/components/mitarbeiter src/app/mitarbeiter` → all green (board's existing tests unaffected; the group-hover wrapper is presentational). `npx tsc --noEmit` (ignore unrelated stale-dep errors). `npm run check:status-registry` + `check:component-set` + `check:token-audit` → 0 new. If `@testing-library` still absent, the hover's interactive edit is covered by the Task-2 render/helper tests + tsc; note it.

- [ ] **Step 3: Commit**

```bash
git add src/components/mitarbeiter/MeineArbeitBoard.tsx
git commit -m "feat(kb): attach ClaimHoverCard hover-split to board cards"
```

---

## Self-Review

**Spec coverage (Phase 1b slice of §6 hover-split + §9 write layer):** hover popover → Task 2+3; inline fact-edit write path → Task 1 (whitelist + owner/admin guard + audit→timeline + revalidate); next-best-action surfaced → Task 2. **Deferred (explicit):** phase-override + `v_claim_phase` COALESCE + `phase_override` column (Phase 1c — isolates the shared-view change); cross-entity edits (vehicle kennzeichen, personen) (Phase 1c); optimistic-UI polish; broader quick-actions.

**Placeholder scan:** none — every step has concrete code or a named concrete requirement.

**Type consistency:** `ALLOWED_CLAIM_FIELDS` (Task 1) reused by `ClaimHoverCard` (Task 2); `updateClaimField` signature consumed in Task 2; `ClaimWorkItem` fields consumed in Tasks 2–3.

**Risk notes:** (1) The action uses `createAdminClient()` after an explicit role+ownership check — this is the sanctioned pattern where table RLS on writes is uncertain; the guard, not RLS, is the gate. (2) Whitelist prevents editing derived/status/ledger columns. (3) No migration, no shared-view touch → zero collision with the `v_claim_*`/payment-ledger/claim-ai sessions. (4) `createAdminClient` is exported from `@/lib/supabase/admin` (verified 2026-07-07); `createClient` from `@/lib/supabase/server`.
