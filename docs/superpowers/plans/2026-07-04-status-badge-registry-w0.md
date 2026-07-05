# Status-/Badge-Registry — W0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `src/lib/status` typed registry (single source for status label+color across all roles) plus a dual-mode `StatusBadge`, proven by tests — the shared foundation every later migration wave stacks on.

**Architecture:** Pure, React-free `lib/status` modules define per-domain `Record<code, StatusDef>` maps; a resolver turns `(domain, code, role)` into `{label, slotClass, iconKey}`. Color is always one of 7 token *slots* (never a raw class), so branding + the token-audit ratchet stay intact. `StatusBadge` gains a registry mode (`domain`+`code`) beside its existing `tone`/`colorCls` mode — no renames, no call-site changes. W0 is **purely additive**: only `StatusBadge.tsx` is modified; `statusLabels.ts`/`lifecycle.ts`/`status-mappings.ts` are read, never edited (they become re-export shims in the later cleanup wave).

**Tech Stack:** TypeScript, Next.js (App Router), React, Tailwind v4, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-04-status-badge-registry-design.md`

## Global Constraints

- **Branch/Worktree:** `kitta/status-badge-registry` off `origin/staging`, at `.claude/worktrees/status-badge-registry/`. PR → `staging`. **Never** push `main`.
- **No DDL, no DB.** Code registry only. No migration, no `database.types.ts` change.
- **Color = slot, never raw.** The only color source is `STATUS_SLOT_CLASSES` in `src/lib/status/slots.ts`. Domain defs carry a `slot`, never a Tailwind color string.
- **`lib/status` data files are lucide-free** (server/email/PDF-safe). LucideIcons live only in `src/lib/status/icons.tsx`. Domain files reference icons by string `iconKey` only.
- **Additive only in W0.** Do not edit `statusLabels.ts`, `lifecycle.ts`, `status-mappings.ts`, `FallStatusBadge.tsx`, `ClaimStatusBadge.tsx`, or any portal file. The only modified existing file is `StatusBadge.tsx`.
- **Faithfulness (Merge-Session Multi-Touch-Union audit):** no behavior change to existing badges in W0. New code is reachable-but-not-yet-called (adopted by call-sites in later waves).
- **UI labels: correct Umlauts** (`ä/ö/ü/ß`). Labels are sourced from existing maps, so this holds automatically.
- **Consumers import the barrel** `@/lib/status` (so knip sees `index.ts` as used).
- **Local verification = `npm run typecheck` + targeted `npx vitest run <file>`.** Full `npm run build` is authoritative in CI (local build may OOM with many parallel sessions). W0 touches no routes/layouts, so typecheck+vitest is sufficient locally.
- **ViewerRole** = `'admin' | 'kb' | 'sv' | 'kunde'` (matches `src/lib/claims/timeline-queries.ts`).

---

## File Structure

**New (all under `src/lib/status/`):**
- `types.ts` — `StatusSlot`, `ViewerRole`, `DomainName`, `StatusDef`. Pure types, no imports.
- `slots.ts` — `STATUS_SLOT_CLASSES` (the single color source) + `statusSlotClass(slot)`. Pure.
- `domains/fall-status.ts` — `FALL_STATUS_DEFS` (label+short imported from `statusLabels.ts`, slot owned here). Pure.
- `domains/fall-phase.ts` — `FALL_PHASE_DEFS` (label imported from `lifecycle.ts`, slot owned here), keyed exhaustively by `ClaimSubPhase`. Pure.
- `domains/claims-status.ts` — `CLAIMS_STATUS_DEFS` (11 entries owned here: label, labelByRole.kunde, slot, iconKey, isEndzustand). Pure, lucide-free.
- `registry.ts` — `DOMAINS: Record<DomainName, Record<string, StatusDef>>`. Pure.
- `resolve.ts` — `resolveStatus`, `statusLabel`, `statusBadgeView`. Pure.
- `icons.tsx` — `statusIcon(iconKey)` → `LucideIcon`. The **only** lucide importer.
- `index.ts` — barrel re-exporting resolver + types (+ later: legacy shims).
- Tests: `slots.test.ts`, `domains/fall-status.test.ts`, `domains/fall-phase.test.ts`, `domains/claims-status.test.ts`, `resolve.test.ts`.

**Modified:**
- `src/components/shared/StatusBadge.tsx` — add registry mode (additive).

---

## Task 0: Worktree deps + baseline green

**Files:** none (environment setup).

- [ ] **Step 1: Ensure node_modules in the worktree** (worktrees don't inherit it). Prefer a fast junction to the main checkout's deps; fall back to `npm ci` if the junction path is wrong.

```bash
cd "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/status-badge-registry"
# Windows directory junction (no admin needed). Main repo node_modules is 3 levels up.
cmd /c "if not exist node_modules mklink /J node_modules ..\\..\\..\\node_modules"
```

- [ ] **Step 2: Confirm the toolchain runs**

Run: `npx vitest --version && npx tsc --version`
Expected: both print versions (no "command not found").

- [ ] **Step 3: Confirm a clean typecheck baseline**

Run: `npm run typecheck`
Expected: exits 0 (staging is green). If it errors, STOP — the base is broken, not your change.

---

## Task 1: Types + slot color source

**Files:**
- Create: `src/lib/status/types.ts`
- Create: `src/lib/status/slots.ts`
- Test: `src/lib/status/slots.test.ts`

**Interfaces:**
- Produces: `StatusSlot`, `ViewerRole`, `DomainName`, `StatusDef` (from `types.ts`); `STATUS_SLOT_CLASSES`, `statusSlotClass(slot?: StatusSlot): string` (from `slots.ts`).

- [ ] **Step 1: Write `types.ts`**

```ts
// src/lib/status/types.ts
// Pure types for the status/badge registry. NO React, NO lucide imports.

export type StatusSlot =
  | 'neutral' | 'active' | 'pending' | 'done'
  | 'success' | 'warning' | 'danger'

// Matches src/lib/claims/timeline-queries.ts. Extend the union in a later
// wave if a domain needs makler/werkstatt/etc. label variants.
export type ViewerRole = 'admin' | 'kb' | 'sv' | 'kunde'

// Registry domain keys. Extended per wave.
export type DomainName = 'fall-status' | 'fall-phase' | 'claims-status'

export type StatusDef = {
  /** Default / Fachsprache */
  label: string
  /** Optional role-specific variants (generalizes labelKunde) */
  labelByRole?: Partial<Record<ViewerRole, string>>
  /** Optional short label (tables/kanban) */
  short?: string
  /** Color = a token slot, never a raw class. Omitted → neutral. */
  slot?: StatusSlot
  /** Optional terminal-state flag */
  isEndzustand?: boolean
  /** Optional icon key; the LucideIcon lives in icons.tsx */
  iconKey?: string
}
```

- [ ] **Step 2: Write the failing test for `statusSlotClass`**

```ts
// src/lib/status/slots.test.ts
import { describe, it, expect } from 'vitest'
import { statusSlotClass, STATUS_SLOT_CLASSES } from './slots'

describe('statusSlotClass', () => {
  it('returns the exact token class for each slot', () => {
    expect(statusSlotClass('success')).toBe('bg-success-soft text-success-strong')
    expect(statusSlotClass('danger')).toBe('bg-danger-soft text-danger-strong')
    expect(statusSlotClass('neutral')).toBe('bg-claimondo-bg text-claimondo-ondo')
  })
  it('falls back to neutral when slot is undefined', () => {
    expect(statusSlotClass(undefined)).toBe(STATUS_SLOT_CLASSES.neutral)
  })
  it('covers all 7 slots', () => {
    expect(Object.keys(STATUS_SLOT_CLASSES).sort()).toEqual(
      ['active', 'danger', 'done', 'neutral', 'pending', 'success', 'warning'],
    )
  })
})
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run src/lib/status/slots.test.ts`
Expected: FAIL ("Cannot find module './slots'").

- [ ] **Step 4: Write `slots.ts`** (values copied verbatim from `statusLabels.ts` `STATUS_SLOT_CLASSES` — the single source going forward)

```ts
// src/lib/status/slots.ts
// THE single status-color source. 7 token slots → Tailwind classes.
// Semantic slots use status tokens (bg-success-soft etc.) that rebrand via
// var(--brand-*). Neutral/active/done use Claimondo tokens. pending shares warning.
import type { StatusSlot } from './types'

export const STATUS_SLOT_CLASSES: Record<StatusSlot, string> = {
  neutral: 'bg-claimondo-bg text-claimondo-ondo',
  active:  'bg-claimondo-ondo/10 text-claimondo-ondo',
  pending: 'bg-warning-soft text-warning-strong',
  done:    'bg-claimondo-bg text-claimondo-navy',
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger:  'bg-danger-soft text-danger-strong',
}

export function statusSlotClass(slot: StatusSlot | undefined): string {
  return STATUS_SLOT_CLASSES[slot ?? 'neutral']
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/lib/status/slots.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/status/types.ts src/lib/status/slots.ts src/lib/status/slots.test.ts
git commit -m "feat(status): registry types + slot color source (W0)"
```

---

## Task 2: fall-status domain

**Files:**
- Create: `src/lib/status/domains/fall-status.ts`
- Test: `src/lib/status/domains/fall-status.test.ts`

**Interfaces:**
- Consumes: `StatusDef`, `StatusSlot` (types.ts); `FALL_STATUS_LABELS`, `FALL_STATUS_LABELS_SHORT` (from `@/lib/statusLabels`).
- Produces: `FALL_STATUS_DEFS: Record<string, StatusDef>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/status/domains/fall-status.test.ts
import { describe, it, expect } from 'vitest'
import { FALL_STATUS_DEFS } from './fall-status'
import { FALL_STATUS_LABELS } from '@/lib/statusLabels'

describe('FALL_STATUS_DEFS', () => {
  it('has a def for every FALL_STATUS_LABELS code with the same label', () => {
    for (const code of Object.keys(FALL_STATUS_LABELS)) {
      expect(FALL_STATUS_DEFS[code]?.label).toBe(FALL_STATUS_LABELS[code])
    }
  })
  it('assigns semantic slots to terminal states', () => {
    expect(FALL_STATUS_DEFS['vs-reguliert'].slot).toBe('success')
    expect(FALL_STATUS_DEFS['storniert'].slot).toBe('danger')
    expect(FALL_STATUS_DEFS['abgelehnt'].slot).toBe('danger')
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/status/domains/fall-status.test.ts`
Expected: FAIL ("Cannot find module './fall-status'").

- [ ] **Step 3: Write `fall-status.ts`** (labels/short imported → DRY; slot map owned here, copied verbatim from `FALL_STATUS_SLOT_MAP` in `statusLabels.ts`)

```ts
// src/lib/status/domains/fall-status.ts
// faelle.status registry domain. Label+short imported from the legacy map
// (single source until the cleanup wave); slot mapping owned here.
import type { StatusDef, StatusSlot } from '../types'
import { FALL_STATUS_LABELS, FALL_STATUS_LABELS_SHORT } from '@/lib/statusLabels'

const SLOT: Record<string, StatusSlot> = {
  ersterfassung: 'neutral',
  'flow-gesendet': 'active',
  onboarding: 'neutral',
  erstgespraech: 'active',
  'sv-gesucht': 'active',
  'termin-reserviert': 'pending',
  'besichtigung-laeuft': 'active',
  'gutachten-bearbeitung': 'active',
  'gutachten-erstellt': 'done',
  'akte-uebergeben': 'active',
  'as-vorbereitung': 'active',
  'as-versendet': 'active',
  'warten-auf-vs': 'pending',
  'vs-kuerzt': 'warning',
  'vs-reguliert': 'success',
  klage: 'danger',
  'sv-zugewiesen': 'active',
  'sv-termin': 'pending',
  besichtigung: 'active',
  'begutachtung-laeuft': 'active',
  'gutachten-eingegangen': 'done',
  filmcheck: 'active',
  'qc-pruefung': 'active',
  'kanzlei-uebergeben': 'active',
  anschlussschreiben: 'active',
  'as-gesendet': 'active',
  regulierung: 'success',
  'regulierung-laeuft': 'success',
  'nachbesichtigung-laeuft': 'active',
  'vs-regulierung': 'success',
  'vs-abgelehnt': 'danger',
  'zahlung-eingegangen': 'success',
  abgeschlossen: 'success',
  storniert: 'danger',
  in_bearbeitung: 'pending',
  vs_kontakt: 'pending',
  reguliert: 'success',
  abgelehnt: 'danger',
  kanzlei: 'active',
}

export const FALL_STATUS_DEFS: Record<string, StatusDef> = Object.fromEntries(
  Object.keys(FALL_STATUS_LABELS).map((code) => [
    code,
    {
      label: FALL_STATUS_LABELS[code],
      short: FALL_STATUS_LABELS_SHORT[code],
      slot: SLOT[code] ?? 'neutral',
    } satisfies StatusDef,
  ]),
)
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/status/domains/fall-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/status/domains/fall-status.ts src/lib/status/domains/fall-status.test.ts
git commit -m "feat(status): fall-status domain (W0)"
```

---

## Task 3: fall-phase domain (the color companion lifecycle never had)

**Files:**
- Create: `src/lib/status/domains/fall-phase.ts`
- Test: `src/lib/status/domains/fall-phase.test.ts`

**Interfaces:**
- Consumes: `StatusDef`, `StatusSlot` (types.ts); `ClaimSubPhase`, `SUBPHASE_LABEL` (from `@/lib/claims/lifecycle`).
- Produces: `FALL_PHASE_DEFS: Record<ClaimSubPhase, StatusDef>`.

- [ ] **Step 1: Write the failing test** (exhaustiveness — every subphase has a def with label+slot)

```ts
// src/lib/status/domains/fall-phase.test.ts
import { describe, it, expect } from 'vitest'
import { FALL_PHASE_DEFS } from './fall-phase'
import { SUBPHASE_LABEL } from '@/lib/claims/lifecycle'

describe('FALL_PHASE_DEFS', () => {
  it('covers every ClaimSubPhase with matching label + a slot', () => {
    for (const code of Object.keys(SUBPHASE_LABEL)) {
      const def = FALL_PHASE_DEFS[code as keyof typeof FALL_PHASE_DEFS]
      expect(def, `missing def for ${code}`).toBeDefined()
      expect(def.label).toBe(SUBPHASE_LABEL[code as keyof typeof SUBPHASE_LABEL])
      expect(def.slot).toBeDefined()
    }
  })
  it('maps terminal subphases to semantic slots', () => {
    expect(FALL_PHASE_DEFS.erfolgreich_reguliert.slot).toBe('success')
    expect(FALL_PHASE_DEFS.storniert.slot).toBe('danger')
    expect(FALL_PHASE_DEFS.abgelehnt_final.slot).toBe('danger')
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/status/domains/fall-phase.test.ts`
Expected: FAIL ("Cannot find module './fall-phase'").

- [ ] **Step 3: Write `fall-phase.ts`** (label imported from lifecycle → DRY; slot owned here. The `Record<ClaimSubPhase, ...>` gives compile-time exhaustiveness.)

```ts
// src/lib/status/domains/fall-phase.ts
// Claim subphase registry domain. Gives lifecycle.ts SUBPHASE_LABEL the color
// companion it never had. Keyed by ClaimSubPhase → compiler enforces coverage.
import type { StatusDef, StatusSlot } from '../types'
import { SUBPHASE_LABEL, type ClaimSubPhase } from '@/lib/claims/lifecycle'

const SLOT: Record<ClaimSubPhase, StatusSlot> = {
  sa_offen: 'pending',
  vollmacht_offen: 'pending',
  onboarding_offen: 'pending',
  termin: 'pending',
  besichtigung: 'active',
  gutachten: 'active',
  filmcheck: 'active',
  'qc-pruefung': 'active',
  kanzlei_uebergabe: 'active',
  versicherungskontakt: 'pending',
  auszahlung: 'active',
  nachforderung: 'warning',
  'vs-kuerzt': 'warning',
  anschlussschreiben: 'active',
  'nachbesichtigung-laeuft': 'active',
  erfolgreich_reguliert: 'success',
  storniert: 'danger',
  klage_rechtsstreit: 'warning',
  verjaehrt: 'neutral',
  abgelehnt_final: 'danger',
  an_externe_kanzlei: 'done',
  termin_durchgefuehrt: 'done',
}

export const FALL_PHASE_DEFS: Record<ClaimSubPhase, StatusDef> = Object.fromEntries(
  (Object.keys(SLOT) as ClaimSubPhase[]).map((code) => [
    code,
    { label: SUBPHASE_LABEL[code], slot: SLOT[code] } satisfies StatusDef,
  ]),
) as Record<ClaimSubPhase, StatusDef>
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/status/domains/fall-phase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/status/domains/fall-phase.ts src/lib/status/domains/fall-phase.test.ts
git commit -m "feat(status): fall-phase domain + slot companion (W0)"
```

---

## Task 4: claims-status domain (labelKunde → labelByRole, lucide-free)

**Files:**
- Create: `src/lib/status/domains/claims-status.ts`
- Test: `src/lib/status/domains/claims-status.test.ts`

**Interfaces:**
- Consumes: `StatusDef` (types.ts).
- Produces: `CLAIMS_STATUS_DEFS: Record<string, StatusDef>` (11 entries; owned here to stay lucide-free — do NOT import `status-mappings.ts`, which pulls lucide).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/status/domains/claims-status.test.ts
import { describe, it, expect } from 'vitest'
import { CLAIMS_STATUS_DEFS } from './claims-status'

describe('CLAIMS_STATUS_DEFS', () => {
  it('exposes admin label + kunde variant', () => {
    const d = CLAIMS_STATUS_DEFS.in_kommunikation_vs
    expect(d.label).toBe('Kommunikation mit VS')
    expect(d.labelByRole?.kunde).toBe('Wir verhandeln mit der Versicherung')
  })
  it('flags terminal states and carries an iconKey', () => {
    expect(CLAIMS_STATUS_DEFS.reguliert_vollstaendig.isEndzustand).toBe(true)
    expect(CLAIMS_STATUS_DEFS.reguliert_vollstaendig.iconKey).toBe('check-circle')
    expect(CLAIMS_STATUS_DEFS.dispatch_done.isEndzustand).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/status/domains/claims-status.test.ts`
Expected: FAIL ("Cannot find module './claims-status'").

- [ ] **Step 3: Write `claims-status.ts`** (values mirror `CLAIM_STATUS` in `status-mappings.ts`; `labelKunde`→`labelByRole.kunde`, `tone`→`slot`, `icon`→`iconKey`)

```ts
// src/lib/status/domains/claims-status.ts
// claims.status registry domain. Owns its 11 entries directly to stay
// lucide-free (importing status-mappings.ts would pull lucide into lib/status).
// Mirrors src/components/shared/claims/status-mappings.ts CLAIM_STATUS.
import type { StatusDef } from '../types'

export const CLAIMS_STATUS_DEFS: Record<string, StatusDef> = {
  dispatch_done:        { label: 'Neu', labelByRole: { kunde: 'Neu eingegangen' }, slot: 'active', iconKey: 'play-circle', isEndzustand: false },
  in_bearbeitung:       { label: 'In Bearbeitung', slot: 'active', iconKey: 'user-check', isEndzustand: false },
  in_kommunikation_vs:  { label: 'Kommunikation mit VS', labelByRole: { kunde: 'Wir verhandeln mit der Versicherung' }, slot: 'active', iconKey: 'phone-call', isEndzustand: false },
  reguliert:            { label: 'Reguliert', slot: 'success', iconKey: 'check-circle', isEndzustand: true },
  reguliert_vollstaendig: { label: 'Erfolgreich reguliert', slot: 'success', iconKey: 'check-circle', isEndzustand: true },
  abgelehnt:            { label: 'VS-Ablehnung (Nachforderung)', labelByRole: { kunde: 'Versicherung hat abgelehnt' }, slot: 'warning', iconKey: 'x-circle', isEndzustand: false },
  abgelehnt_final:      { label: 'Abgelehnt (final)', labelByRole: { kunde: 'Abgelehnt' }, slot: 'danger', iconKey: 'x-circle', isEndzustand: true },
  klage_rechtsstreit:   { label: 'Klage / Rechtsstreit', labelByRole: { kunde: 'Im Rechtsstreit' }, slot: 'warning', iconKey: 'scale', isEndzustand: true },
  verjaehrt:            { label: 'Verjährt', slot: 'neutral', iconKey: 'clock', isEndzustand: true },
  an_externe_kanzlei_uebergeben: { label: 'An externe Kanzlei', labelByRole: { kunde: 'An deine Kanzlei übergeben' }, slot: 'done', iconKey: 'scale', isEndzustand: true },
  storniert:            { label: 'Storniert', labelByRole: { kunde: 'Gestoppt' }, slot: 'neutral', iconKey: 'pause-circle', isEndzustand: true },
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/status/domains/claims-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/status/domains/claims-status.ts src/lib/status/domains/claims-status.test.ts
git commit -m "feat(status): claims-status domain, labelKunde->labelByRole (W0)"
```

---

## Task 5: registry + resolver

**Files:**
- Create: `src/lib/status/registry.ts`
- Create: `src/lib/status/resolve.ts`
- Test: `src/lib/status/resolve.test.ts`

**Interfaces:**
- Consumes: `FALL_STATUS_DEFS`, `FALL_PHASE_DEFS`, `CLAIMS_STATUS_DEFS`; `StatusDef`, `DomainName`, `ViewerRole`; `statusSlotClass`.
- Produces: `DOMAINS`; `resolveStatus(domain, code)`, `statusLabel(domain, code, role?)`, `statusBadgeView(domain, code, role?): { label: string; slotClass: string; iconKey?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/status/resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolveStatus, statusLabel, statusBadgeView } from './resolve'

describe('resolveStatus', () => {
  it('resolves a known code', () => {
    expect(resolveStatus('fall-status', 'vs-reguliert').label).toBe('VS reguliert vollständig')
  })
  it('falls back to the code as label + neutral slot for unknown codes', () => {
    expect(resolveStatus('fall-status', 'total-unknown')).toEqual({ label: 'total-unknown', slot: 'neutral' })
  })
  it('falls back to em-dash for empty/null code', () => {
    expect(resolveStatus('fall-status', null).label).toBe('—')
    expect(resolveStatus('fall-status', '').label).toBe('—')
  })
})

describe('statusLabel', () => {
  it('returns the role variant when present', () => {
    expect(statusLabel('claims-status', 'in_kommunikation_vs', 'kunde')).toBe('Wir verhandeln mit der Versicherung')
  })
  it('falls back to the base label when the role has no variant', () => {
    expect(statusLabel('claims-status', 'in_kommunikation_vs', 'admin')).toBe('Kommunikation mit VS')
    expect(statusLabel('claims-status', 'in_kommunikation_vs')).toBe('Kommunikation mit VS')
  })
})

describe('statusBadgeView', () => {
  it('returns label + slotClass + iconKey', () => {
    expect(statusBadgeView('fall-status', 'vs-reguliert')).toEqual({
      label: 'VS reguliert vollständig',
      slotClass: 'bg-success-soft text-success-strong',
      iconKey: undefined,
    })
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/status/resolve.test.ts`
Expected: FAIL ("Cannot find module './resolve'").

- [ ] **Step 3: Write `registry.ts`**

```ts
// src/lib/status/registry.ts
import type { DomainName, StatusDef } from './types'
import { FALL_STATUS_DEFS } from './domains/fall-status'
import { FALL_PHASE_DEFS } from './domains/fall-phase'
import { CLAIMS_STATUS_DEFS } from './domains/claims-status'

export const DOMAINS: Record<DomainName, Record<string, StatusDef>> = {
  'fall-status': FALL_STATUS_DEFS,
  'fall-phase': FALL_PHASE_DEFS,
  'claims-status': CLAIMS_STATUS_DEFS,
}
```

- [ ] **Step 4: Write `resolve.ts`**

```ts
// src/lib/status/resolve.ts
import type { DomainName, StatusDef, ViewerRole } from './types'
import { DOMAINS } from './registry'
import { statusSlotClass } from './slots'

export function resolveStatus(domain: DomainName, code: string | null | undefined): StatusDef {
  const hit = code ? DOMAINS[domain]?.[code] : undefined
  if (hit) return hit
  return { label: code && code.length > 0 ? code : '—', slot: 'neutral' }
}

export function statusLabel(
  domain: DomainName,
  code: string | null | undefined,
  role?: ViewerRole,
): string {
  const def = resolveStatus(domain, code)
  if (role && def.labelByRole?.[role]) return def.labelByRole[role] as string
  return def.label
}

export function statusBadgeView(
  domain: DomainName,
  code: string | null | undefined,
  role?: ViewerRole,
): { label: string; slotClass: string; iconKey?: string } {
  const def = resolveStatus(domain, code)
  return {
    label: role && def.labelByRole?.[role] ? (def.labelByRole[role] as string) : def.label,
    slotClass: statusSlotClass(def.slot),
    iconKey: def.iconKey,
  }
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/lib/status/resolve.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Commit**

```bash
git add src/lib/status/registry.ts src/lib/status/resolve.ts src/lib/status/resolve.test.ts
git commit -m "feat(status): registry + resolver (resolveStatus/statusLabel/statusBadgeView) (W0)"
```

---

## Task 6: icons companion (client boundary)

**Files:**
- Create: `src/lib/status/icons.tsx`

**Interfaces:**
- Produces: `statusIcon(iconKey?: string): LucideIcon | null`.

- [ ] **Step 1: Write `icons.tsx`** (the ONLY lucide importer in lib/status; keys must match the `iconKey`s in `claims-status.ts`)

```tsx
// src/lib/status/icons.tsx
// The ONLY lucide importer in lib/status — keeps the data modules server-safe.
import type { LucideIcon } from 'lucide-react'
import {
  PlayCircleIcon, UserCheckIcon, PhoneCallIcon, CheckCircleIcon,
  XCircleIcon, ScaleIcon, ClockIcon, PauseCircleIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'play-circle': PlayCircleIcon,
  'user-check': UserCheckIcon,
  'phone-call': PhoneCallIcon,
  'check-circle': CheckCircleIcon,
  'x-circle': XCircleIcon,
  scale: ScaleIcon,
  clock: ClockIcon,
  'pause-circle': PauseCircleIcon,
}

export function statusIcon(iconKey?: string): LucideIcon | null {
  return iconKey ? (ICONS[iconKey] ?? null) : null
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/status/icons.tsx
git commit -m "feat(status): icons companion (client-only lucide map) (W0)"
```

---

## Task 7: barrel index

**Files:**
- Create: `src/lib/status/index.ts`

**Interfaces:**
- Produces: public API of `@/lib/status` (types + resolver + slots + icons).

- [ ] **Step 1: Write `index.ts`**

```ts
// src/lib/status/index.ts
// Public entry point. Consumers import from '@/lib/status'.
// (Legacy-constant re-export shims are added in the cleanup wave.)
export type { StatusSlot, ViewerRole, DomainName, StatusDef } from './types'
export { STATUS_SLOT_CLASSES, statusSlotClass } from './slots'
export { resolveStatus, statusLabel, statusBadgeView } from './resolve'
export { statusIcon } from './icons'
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/status/index.ts
git commit -m "feat(status): barrel index for @/lib/status (W0)"
```

---

## Task 8: dual-mode StatusBadge (registry mode, additive)

**Files:**
- Modify: `src/components/shared/StatusBadge.tsx`

**Interfaces:**
- Consumes: `statusBadgeView`, `statusIcon`, `DomainName`, `ViewerRole` (from `@/lib/status`).
- Produces: `StatusBadge` accepting an additive registry mode (`domain`+`code`+`role`+`withIcon`) alongside the existing `tone`/`colorCls` mode.

- [ ] **Step 1: Read the current file** to preserve the existing tone/colorCls behavior exactly.

Run: `sed -n '1,80p' src/components/shared/StatusBadge.tsx` (reference only)

- [ ] **Step 2: Replace the file** with the dual-mode version (existing behavior untouched; new registry branch added at the top of the render)

```tsx
// AAR-769 Phase 3: Wrapper über <Badge>-Primitive.
//
// Dual-Mode (Status-Registry, W0):
//   • Registry-Modus: <StatusBadge domain="fall-status" code={s} role="kunde" />
//     → zieht Label+Slot-Farbe aus @/lib/status (Soft-Slot-Pille).
//   • Legacy-Modus: tone/colorCls/children wie bisher (unverändert).

import type { ReactNode } from 'react'
import { Badge } from '@/components/primitives'
import type { BadgeTone, BadgeSize } from '@/components/primitives/Badge/Badge.types'
import { statusBadgeView, statusIcon, type DomainName, type ViewerRole } from '@/lib/status'

export type StatusBadgeTone =
  | 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'ondo'

const TONE_TO_BADGE: Record<StatusBadgeTone, BadgeTone> = {
  neutral: 'neutral', info: 'info', success: 'success', warning: 'warning',
  danger: 'danger', brand: 'navy', ondo: 'ondo',
}

const SIZE_TO_BADGE: Record<'xs' | 'sm', BadgeSize> = { xs: 'sm', sm: 'md' }

const REGISTRY_SIZE_CLS: Record<'xs' | 'sm', string> = {
  xs: 'text-[10px] px-2 py-0.5',
  sm: 'text-xs px-2.5 py-1',
}

type StatusBadgeProps = {
  // Registry mode
  domain?: DomainName
  code?: string | null
  role?: ViewerRole
  withIcon?: boolean
  // Legacy mode
  tone?: StatusBadgeTone
  colorCls?: string
  children?: ReactNode
  // Shared
  size?: 'xs' | 'sm'
  className?: string
}

export function StatusBadge({
  domain,
  code,
  role,
  withIcon = false,
  tone = 'neutral',
  size = 'xs',
  colorCls,
  className = '',
  children,
}: StatusBadgeProps) {
  // ── Registry mode ── label + slot color from @/lib/status (soft-slot pill).
  if (domain) {
    const { label, slotClass, iconKey } = statusBadgeView(domain, code, role)
    const Icon = withIcon ? statusIcon(iconKey) : null
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${REGISTRY_SIZE_CLS[size]} ${slotClass} ${className}`}
      >
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </span>
    )
  }

  // ── Legacy escape-hatch: eigene Tailwind-Klassen → eigener Span.
  if (colorCls) {
    const sizeCls = size === 'xs' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeCls} ${colorCls} ${className}`}
      >
        {children}
      </span>
    )
  }

  // ── Legacy standard path: <Badge> primitive.
  void className
  return (
    <Badge tone={TONE_TO_BADGE[tone]} size={SIZE_TO_BADGE[size]}>
      {children}
    </Badge>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (If a caller passed no `children` before, it was already optional-safe; `children` stays optional.)

- [ ] **Step 4: Run the full status test suite + confirm nothing else broke**

Run: `npx vitest run src/lib/status`
Expected: PASS (all status tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/StatusBadge.tsx
git commit -m "feat(status): StatusBadge dual-mode (registry domain/code/role) (W0)"
```

---

## Task 9: full verification + PR to staging

**Files:** none (gates + PR).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 2: Full status suite**

Run: `npx vitest run src/lib/status`
Expected: all PASS.

- [ ] **Step 3: Guard scripts (must not introduce new violations)**

Run: `npm run check:token-audit ; npm run check:component-set ; npm run check:knip`
Expected: no NEW violations attributable to `src/lib/status` or `StatusBadge.tsx`. (New files use slots/tokens only; `index.ts` is imported by `StatusBadge`; StatusBadge stays a shared component.) If knip flags `icons.tsx`/`index.ts` as unused, verify `StatusBadge.tsx` imports from `@/lib/status` (Step-of-Task-8) — that import is what makes the barrel reachable.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin kitta/status-badge-registry
```

- [ ] **Step 5: Open the PR against staging** (the Merge-Session batches it once build=pass + MERGEABLE)

```bash
gh pr create --base staging --head kitta/status-badge-registry \
  --title "feat(status): W0 — lib/status registry foundation + dual-mode StatusBadge" \
  --body "$(cat <<'EOF'
## W0 Foundation — Status-/Badge-Registry

Erste Welle der Badge-Normalisierung (Spec: docs/superpowers/specs/2026-07-04-status-badge-registry-design.md).

**Purely additive.** Neue `src/lib/status/*` (types, slots, 3 Domains fall-status/fall-phase/claims-status, registry, resolver, icons, barrel) + `StatusBadge` bekommt einen additiven Registry-Modus (`domain`/`code`/`role`). Kein bestehendes Badge ändert sich sichtbar; kein Portal-File, keine DDL. `statusLabels.ts`/`lifecycle.ts`/`status-mappings.ts` werden nur gelesen.

- Farbe = 1 von 7 Token-Slots (token-audit-safe, rebrandet via var(--brand-*)).
- `labelByRole` verallgemeinert das bestehende `labelKunde` (claims-status).
- `lib/status`-Daten lucide-frei (Server/Email/PDF-safe); Icons nur in icons.tsx.
- fall-phase bekommt die Farb-Companion, die lifecycle.ts nie hatte.

**Tests:** slots, 3 Domains (inkl. ClaimSubPhase-Exhaustiveness), resolver (Rollen-Präzedenz + Fallback). `npm run typecheck` grün.

Audit:
- Build: CI (typecheck lokal grün; keine Routen/Layouts berührt)
- UI: kein sichtbarer Change (Foundation; Call-Sites adoptieren ab W1)
- Redundanz: konsolidiert ~95 Maps sukzessive; W0 legt die eine Registry an
- Dead-Code: barrel via StatusBadge konsumiert
- Spec: W0-Scope aus Spec, additiv
- Inkonsistenz: Slots/Tokens + ViewerRole = timeline-queries-Wert
- Regression: additiv, bestehende StatusBadge-Pfade unverändert

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Confirm PR is build-poll-ready** (do NOT self-merge; the Merge-Session picks it up)

Run: `gh pr checks --watch` (or report the PR URL). Expected: build check runs; when green + MERGEABLE the release lane batches it.

---

## Subsequent Waves (separate plans, per spec §5)

- **W1** — faithful re-wire of `FallStatusBadge` + `ClaimStatusBadge` onto the registry (visual smoke), Termin-status domain (7 copies → 1), first raw-pill migrations. Fold `KUNDE_SUBSTATE_LABEL` into `fall-phase` `labelByRole.kunde`.
- **W2** — Reklamation-status (3 copies) + small status domains + `sv-status.ts` raw→slots.
- **W3** — label-lookup domains (rolle, dokument-typ, paket, …).
- **W4** — collision-deferred: abrechnung/provision (after `kanonische-abrechnung`), lead/finder (after `aar-956`).
- **W5** — cleanup: delete legacy `tone`/`colorCls` escape-hatch, invert the `statusLabels.ts` shim, lower component-set/token-audit/knip baselines.

## Self-Review

- **Spec coverage:** W0 items (registry infra, slot-only color, labelByRole, dual-mode StatusBadge, 3 canonical domains, server-safe icons, tests) each map to Tasks 1–8. Later spec sections → Subsequent Waves. ✓
- **Placeholders:** none — every file has complete code. ✓
- **Type consistency:** `statusBadgeView` return shape `{label, slotClass, iconKey}` is consumed identically in `StatusBadge` (Task 8). `ViewerRole`/`DomainName`/`StatusDef` defined in Task 1, used consistently in Tasks 2–8. `iconKey` strings in `claims-status.ts` (Task 4) match keys in `icons.tsx` (Task 6). ✓
- **Faithfulness:** W0 changes no existing rendered output (registry branch only fires when a caller passes `domain=`, which no W0 call-site does). ✓
