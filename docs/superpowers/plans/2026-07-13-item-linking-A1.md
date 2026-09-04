# Slice A1 — Task/Update Item → Detail Linking (all roles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`. This plan was written from the recon map + spec (not fresh reads of every surface); **RE-VERIFY every file:line before each edit** against this worktree (`kitta/notif-badges-item-linking`, off staging).

**Goal:** Make every task/update list item fully clickable so a click opens the item's entity detail view — across all roles — without breaking the inline controls those items carry.

**Architecture:** The update feed (`UpdateItem`) is already a full-item button; the gap is the **task** lists, whose items have inline controls (status `<select>`, drag handle, action buttons) so they can't be a naive `<Link>`/`<button>`. Reuse the existing `ClickableTr` (DataTable set) for **table** surfaces; add ONE small shared **`ClickableItemRow`** wrapper (role=link div + click-through guard + keyboard a11y) for **card/row** surfaces. Each surface passes the target route it already computes (routes are role-correct because each surface lives in its own portal) — no central resolver change needed for A1.

**Tech Stack:** Next.js 15 App Router, TypeScript, React client components, Tailwind (claimondo tokens), vitest.

## Global Constraints
- Regel 1: never push `main`; feature branch `kitta/notif-badges-item-linking` → PR → `staging`.
- New components use `@/components/primitives/*` + `src/lib/design-tokens.ts` / claimondo token classes — NO handrolled Tailwind buttons/cards, NO raw hex or raw Tailwind status/accent colors (token-audit + component-set ratchets → must show `0 neu`). The `ClickableItemRow` is a **navigation wrapper** (role=link `<div>`), not a Button/Card reimplementation — keep it that way so the component-set ratchet doesn't trip.
- UI strings: real Umlaute (ä/ö/ü/ß). `aria-label`s are user-facing → Umlaute.
- Every commit body ends with a 7-Punkte-Audit block + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Typecheck (PowerShell — tsc OOMs at default heap): `$env:NODE_OPTIONS='--max-old-space-size=8192'; npx tsc --noEmit`. Tests: `npx vitest run <file>`.
- knip ratchet `0 neu`; the new wrapper must have ≥1 real consumer (it will, from Task 3+).
- ⚠ **Coordination:** nav/shell files overlap with the active `portal-header-phase2` lane (session 7ca8e37c). This slice touches **task-list item rendering**, not header/nav layout. If a surface edit would touch a shell/nav layout file, prefer editing the inner list/card component; if unavoidable, RE-VERIFY against their branch and note it in the commit. Marker: `COORDINATION-notif-badges-item-linking`.

---

## Task 1 — Shared `ClickableItemRow` wrapper (card/row surfaces)

**Files:** Create `src/components/shared/ClickableItemRow.tsx`; Create `src/components/shared/ClickableItemRow.test.ts`.

**RE-VERIFY first:**
- [ ] `grep -rn "ClickableTr" src/components/shared/` — confirm the DataTable `ClickableTr` exists (reused in Task 4 for the table surface). Confirm there is NO existing card/row click-wrapper we should reuse instead of creating one (grep `ClickableRow|ClickableCard|role="link"`). If an equivalent exists, use it and skip creating a new file.

**Interfaces — Produces:**
```ts
// The click-through guard predicate — PURE, unit-testable without a router.
// Returns false when the click originated on an interactive control (so the row must NOT navigate).
export function isInteractiveTarget(el: EventTarget | null): boolean
export function ClickableItemRow(props: {
  href: string
  children: React.ReactNode
  className?: string
  ariaLabel?: string
}): JSX.Element
```

- [ ] **Step 1 — failing test** `ClickableItemRow.test.ts` (pure guard predicate; no DOM/router needed):
```ts
import { describe, it, expect } from 'vitest'
import { isInteractiveTarget } from './ClickableItemRow'

// Minimal fake element whose closest() mimics the DOM: returns a match when the
// selector should hit an interactive ancestor.
function fakeEl(matches: boolean) {
  return { closest: (_sel: string) => (matches ? {} : null) } as unknown as EventTarget
}

describe('isInteractiveTarget', () => {
  it('true when the target is inside an interactive control (guard blocks nav)', () => {
    expect(isInteractiveTarget(fakeEl(true))).toBe(true)
  })
  it('false for a plain content click (nav allowed)', () => {
    expect(isInteractiveTarget(fakeEl(false))).toBe(false)
  })
  it('false for null target', () => {
    expect(isInteractiveTarget(null)).toBe(false)
  })
})
```
- [ ] **Step 2** — `npx vitest run src/components/shared/ClickableItemRow.test.ts` → RED (module missing).
- [ ] **Step 3 — implement** `ClickableItemRow.tsx`:
```tsx
'use client'
import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'

const INTERACTIVE_SELECTOR =
  'button, a, select, input, textarea, label, [role="button"], [data-no-nav]'

/** Pure: did this click originate on an interactive control? If so, the row must NOT navigate. */
export function isInteractiveTarget(el: EventTarget | null): boolean {
  const node = el as { closest?: (s: string) => unknown } | null
  return !!(node && typeof node.closest === 'function' && node.closest(INTERACTIVE_SELECTOR))
}

/** Makes a whole card/row navigate on click/Enter/Space, without stealing clicks from inner controls. */
export function ClickableItemRow({
  href,
  children,
  className,
  ariaLabel,
}: {
  href: string
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  const router = useRouter()
  const go = () => router.push(href)
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(e.target)) return
    go()
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      go()
    }
  }
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
```
- [ ] **Step 4** — `npx vitest run src/components/shared/ClickableItemRow.test.ts` → GREEN.
- [ ] **Step 5** — `$env:NODE_OPTIONS='--max-old-space-size=8192'; npx tsc --noEmit` → clean.
- [ ] **Step 6 — commit** `feat(A1): shared ClickableItemRow wrapper (click-through guard + a11y)` + 7-Punkte-Audit + Co-Authored-By. (knip: the wrapper is consumed starting Task 3 — land Task 1+3 close together, or note the consumer follows.)

---

## Task 2 — (Deferred / not needed for A1)
No central `routeForKontext` change: each surface already computes its role-correct target. Skip. (Documented so a reader doesn't hunt for it.)

---

## Task 3 — Gutachter task cards → clickable (`src/app/gutachter/tasks/page.tsx`)

**Files:** Modify `src/app/gutachter/tasks/page.tsx`.

**RE-VERIFY:** open the file; the task cards are static `<div>` (~:88-131) with an inner `<Link href={/gutachter/fall/${task.fall_id}}>` (~:111-115). Confirm the fall_id-derived target.

- [ ] **Step 1 — source-guard test** `src/app/gutachter/tasks/page.test.ts` (mirror `src/app/api/cron/send-lead-reminders/route.test.ts`): assert the source imports `ClickableItemRow` and no longer renders a bare non-navigating card for a task with a `fall_id`. (`readFileSync` + `toContain('ClickableItemRow')`.)
- [ ] **Step 2** — vitest → RED.
- [ ] **Step 3 — implement:** wrap each task card body in `<ClickableItemRow href={task.fall_id ? \`/gutachter/fall/${task.fall_id}\` : ...}>`; drop the now-redundant inner `<Link>` (or keep it but ensure it still works via the guard). For a task WITHOUT a `fall_id` → render a plain non-clickable card (no wrapper, no dead link). Keep any inner action buttons — the guard protects them.
- [ ] **Step 4** — vitest GREEN; tsc clean.
- [ ] **Step 5 — commit** `feat(A1): gutachter task cards open the Fall on click` + Audit.

---

## Task 4 — Admin "Meine Tasks" rows → full-row clickable (`src/app/admin/meine-tasks/MyTasksClient.tsx`)

**Files:** Modify `src/app/admin/meine-tasks/MyTasksClient.tsx`.

**RE-VERIFY:** it's a table; today only the Fall-cell is a `<Link href={/faelle/${fall_id}}>` (~:103) and there's an inline status `<select>`. Confirm it uses the DataTable `ClickableTr` set or a raw `<tr>`.

- [ ] **Step 1 — source-guard test**: assert the source uses `ClickableTr` (or `ClickableItemRow`) for the row and that the inline status `<select>` remains (`toContain('ClickableTr')` + `toContain('select')`).
- [ ] **Step 2** — RED.
- [ ] **Step 3 — implement:** make the whole row navigate to `/faelle/${fall_id}` using the existing **`ClickableTr`** (reuse — do NOT duplicate) if the table is a DataTable; else wrap the row content in `ClickableItemRow`. The inline status `<select>` and any buttons must keep working — they are covered by the guard (`select` is in `INTERACTIVE_SELECTOR`). Rows with no `fall_id` → not clickable.
- [ ] **Step 4** — vitest GREEN; tsc clean.
- [ ] **Step 5 — commit** `feat(A1): admin Meine-Tasks full-row opens the Fall` + Audit.

---

## Task 5 — Admin Kanban TaskCard → card-body clickable (`src/app/admin/tasks/KanbanBoard.tsx`)

**Files:** Modify `src/app/admin/tasks/KanbanBoard.tsx`.

**RE-VERIFY:** `TaskCard` (~:477-499) renders `<Link href={link.href}>` for the entity cell and is **draggable** (drag handle) with status controls. Confirm `link.href` is the entity target.

- [ ] **Step 1 — source-guard test**: assert the card body navigates via `ClickableItemRow`/`link.href` AND the drag + status controls are still present (`toContain('draggable')` or the drag lib call unchanged).
- [ ] **Step 2** — RED.
- [ ] **Step 3 — implement:** wrap the card content in `ClickableItemRow href={link.href}` (when `link.href` exists), preserving the drag handle and status controls (guard: drag handles/buttons carry `[data-no-nav]` if they are plain divs, or are `button`/`[role=button]`). ⚠ Verify dragging still works (the drag lib's pointer handlers must not be swallowed — if the drag handle is a non-interactive element, add `data-no-nav` to it). Card without an entity target → not clickable.
- [ ] **Step 4** — vitest GREEN; tsc clean; **manual note in commit:** dragging + status change re-verified unaffected.
- [ ] **Step 5 — commit** `feat(A1): admin Kanban task card opens its entity on click` + Audit.

---

## Task 6 — Dispatch Rückrufe rows → clickable (`src/app/dispatch/rueckrufe/page.tsx`)

**Files:** Modify `src/app/dispatch/rueckrufe/page.tsx`.

**RE-VERIFY:** rows (~:171-176) have a name-cell `<Link href={/dispatch/leads/${lead.id}}>` + inline action buttons.

- [ ] **Step 1 — source-guard test**: row navigates via `ClickableItemRow`/`ClickableTr` to `/dispatch/leads/${lead.id}`; action buttons preserved.
- [ ] **Step 2** — RED.
- [ ] **Step 3 — implement:** full-row → `/dispatch/leads/${lead.id}`; action buttons keep working via the guard.
- [ ] **Step 4** — vitest GREEN; tsc clean.
- [ ] **Step 5 — commit** `feat(A1): dispatch Rückrufe row opens the Lead on click` + Audit.

---

## Task 7 — Sweep remaining per-role task/update lists + kill dead links

**Files:** whatever the sweep finds (makler/werkstatt/kanzlei/kunde/flotte task or update lists).

- [ ] **Step 1 — RE-VERIFY sweep:** `grep -rn "href=\"#\"" src/` (dead links) and `grep -rn "tasks\|aufgaben\|updates" src/app/**/(makler|werkstatt|kanzlei|kunde|flotte)*` for list surfaces that render task/update items without full-item navigation. Build a list.
- [ ] **Step 2 — implement** per surface: apply `ClickableItemRow`/`ClickableTr` with the surface's existing role-correct target; replace every `href="#"` with either a real target or an explicitly non-clickable render (no wrapper, cursor default). One commit per surface (or one grouped commit if trivial), each with Audit.
- [ ] **Step 3** — vitest (source-guards) + tsc per surface.

---

## Task 8 — Full build + ratchets + regression + prod smoke + PR

- [ ] `npm run build` green (heap-bumped: `$env:NODE_OPTIONS='--max-old-space-size=8192'; npm run build`).
- [ ] `npx vitest run src/components/shared/ClickableItemRow.test.ts` + all new source-guards → green.
- [ ] `npm run check:component-set -- --ratchet`, `npm run check:token-audit`, `npm run check:knip -- --ratchet` → `0 neu`.
- [ ] Regression grep: `rg "ClickableItemRow|ClickableTr" src/` → confirm consumers wired; confirm no `href="#"` dead links remain in touched surfaces.
- [ ] **Prod Playwright smoke** (mandate; `PLAYWRIGHT_BASE_URL=https://app.claimondo.de`, test accounts `test-*@claimondo.de`/`<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` or `aaron.sprafke`/`<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`): for ≥2 roles, open a task list → click a task item → land on the correct entity detail; click an inline control (status select / action button) → it acts and does NOT navigate. Document results.
- [ ] Session-Abschluss-Checkliste: `git status` clean, `git stash list` empty, all commits pushed.
- [ ] Open PR → `staging`. Body ends with the Claude Code footer + the 7-Punkte-Audit summary.

---

## Self-Review
- **Spec coverage:** A1 = "every task/update item fully clickable → detail; remove dead links; keep inline controls." Tasks 1 (wrapper) + 3-7 (apply + dead-link removal) cover it. Update feed already clickable (no change). ✓
- **Reuse:** `ClickableTr` reused for tables (redundancy audit); ONE new wrapper for cards/rows. ✓
- **Type consistency:** `ClickableItemRow({href, children, className?, ariaLabel?})` + `isInteractiveTarget(EventTarget|null)` used consistently across tasks. ✓
- **No central resolver:** each surface uses its own role-correct target — documented (Task 2 skipped). ✓
- **Risk:** Kanban drag vs. click-guard (Task 5) — the one real integration risk; the plan calls out re-verifying drag + adding `data-no-nav` to non-interactive drag handles.
