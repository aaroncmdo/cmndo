# Data-Integrity-Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei neue read-only Health-Checks, die verletzte Daten-Invarianten (fehlende Pflichtdokument-Slots, fehlende Termin-Reminder, fehlende geschädigte Partei) gegen Prod detektieren und über das bestehende Health-Check-System alerten.

**Architecture:** Jeder Check ist ein self-contained `HealthCheck`-Const im bestehenden `src/lib/health/checks/`-Framework. Da der supabase-js-Client kein `NOT EXISTS` kann und keine der 11 bestehenden Checks einen echten Cross-Table-Anti-Join macht, nutzt jeder Check ein **2-Query-Set-Difference-Muster**: Query 1 lädt Kandidaten-IDs (mit Filtern), Query 2 lädt via `.in(fk, ids)` die abgedeckten IDs, die Differenz in JS = Verletzungen. Schwellen (`≥1 warn`, `≥3 crit`) + bis zu 5 `sampleIds` inline. Registrierung: je 1 Import + 1 Array-Eintrag in `checks/index.ts`.

**Tech Stack:** TypeScript, supabase-js (PostgREST), vitest. Kein DDL, keine Migration, keine neue Infra.

## Global Constraints

- **Read-only:** Checks führen ausschließlich `.select()`-Queries über den injizierten `ctx.supabase`-Client aus. Keine Writes.
- **Muster-Referenz:** `src/lib/health/checks/reminders-overdue.ts` (Check-Struktur) + `src/lib/health/checks/__tests__/reminders-overdue.test.ts` (Test-/Mock-Struktur).
- **CheckResult-Shape:** `{ status: 'ok'|'warn'|'crit'|'error', metric?: number, detail: string, sampleIds?: string[] }`. `sampleIds` ≤ 5. DB-Fehler → `{ status: 'error', detail: 'DB-Fehler beim …: ${error.message}' }`.
- **Schwellen (alle drei Checks identisch):** `metric === 0 → ok`; `metric >= 1 && < 3 → warn`; `metric >= 3 → crit`.
- **Kalibrierte Baselines (Prod 2026-07-07, alle 0):** Check 1 `missing_14d=0` (candidates_14d=14), Check 2 `missing_reminders=0` (future_bestaetigt=2), Check 3 `missing_geschaedigter=0` (active_claims_total=25). `claims`-Tabelle hat nur 25 Zeilen total → keine Paginierung/kein 1000-Row-Limit-Problem.
- **Verifizierte Spalten/Tabellen (Queries liefen clean):** `claims.id/abgeschlossen_am/deaktiviert_am/created_at`, `pflichtdokumente.fall_id`, `gutachter_termine.id/start_zeit/status`, `termin_reminders.termin_id`, `claim_parties.claim_id/rolle`.
- **Umlaute:** `/admin/health` ist admin-intern → Umlaute optional, aber bestehende Checks nutzen echte Umlaute in `detail` ("überfällige", "prüfen"). Neue `detail`-Strings folgen dem (echte `ä/ö/ü/ß`).
- **Kein Ratchet-Impact:** reine TS-Logik (kein JSX/Farben/Status-Maps) → token-audit/component-set/status-registry N/A; neue Files sind von `index.ts` importiert → knip clean.

---

### Task 1: Check `claims-missing-pflichtdokumente`

**Files:**
- Create: `src/lib/health/checks/claims-missing-pflichtdokumente.ts`
- Test: `src/lib/health/checks/__tests__/claims-missing-pflichtdokumente.test.ts`
- Modify: `src/lib/health/checks/index.ts` (add import + array entry)

**Interfaces:**
- Consumes: `HealthCheck`, `CheckResult` from `@/lib/health/types`; `CheckCtx` (test) from `@/lib/health/types`.
- Produces: `export const claimsMissingPflichtdokumenteCheck: HealthCheck` (id `claims-missing-pflichtdokumente`, category `funnel`).

- [ ] **Step 1: Write the failing test**

`src/lib/health/checks/__tests__/claims-missing-pflichtdokumente.test.ts`:

```typescript
// TDD-Tests fuer claims-missing-pflichtdokumente Health-Check.
// Muster: reminders-overdue.test.ts (Fake-CheckCtx, sequentielle .from()-Aufrufe).
// Query 1 (claims):          .select('id').is().is().gt()  -> Kandidaten-Rows {id}
// Query 2 (pflichtdokumente): .select('fall_id').in()       -> abgedeckte Rows {fall_id}
import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { claimsMissingPflichtdokumenteCheck } from '../claims-missing-pflichtdokumente'

function makeCtx(candidateIds: string[], coveredFallIds: string[]): CheckCtx {
  let call = 0
  const supabase = {
    from(_table: string) {
      call++
      if (call === 1) {
        return {
          select: () => ({
            is: () => ({
              is: () => ({
                gt: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          in: () => Promise.resolve({ data: coveredFallIds.map((fall_id) => ({ fall_id })), error: null }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ1ErrCtx(msg: string): CheckCtx {
  const supabase = {
    from() {
      return {
        select: () => ({
          is: () => ({ is: () => ({ gt: () => Promise.resolve({ data: null, error: { message: msg } }) }) }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ2ErrCtx(candidateIds: string[], msg: string): CheckCtx {
  let call = 0
  const supabase = {
    from() {
      call++
      if (call === 1) {
        return {
          select: () => ({
            is: () => ({ is: () => ({ gt: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }) }) }),
          }),
        }
      }
      return { select: () => ({ in: () => Promise.resolve({ data: null, error: { message: msg } }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('claimsMissingPflichtdokumenteCheck', () => {
  it('hat korrekte id und category', () => {
    expect(claimsMissingPflichtdokumenteCheck.id).toBe('claims-missing-pflichtdokumente')
    expect(claimsMissingPflichtdokumenteCheck.category).toBe('funnel')
  })

  it('ok wenn keine Kandidaten (leeres 14d-Fenster)', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx([], []))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('ok wenn alle Kandidaten Slots haben', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx(['a', 'b'], ['a', 'b']))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('warn wenn 1 Kandidat ohne Slots', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx(['a', 'b'], ['a']))
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.sampleIds).toEqual(['b'])
  })

  it('crit wenn >= 3 Kandidaten ohne Slots', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx(['a', 'b', 'c', 'd'], ['a']))
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(3)
  })

  it('sampleIds bei > 5 Verletzungen auf 5 begrenzt', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx(ids, []))
    expect(result.metric).toBe(7)
    expect(result.sampleIds).toHaveLength(5)
  })

  it('error bei DB-Fehler in Query 1', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeQ1ErrCtx('timeout'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('timeout')
  })

  it('error bei DB-Fehler in Query 2', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeQ2ErrCtx(['a'], 'boom'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('boom')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/health/checks/__tests__/claims-missing-pflichtdokumente.test.ts`
Expected: FAIL — `Cannot find module '../claims-missing-pflichtdokumente'`.

- [ ] **Step 3: Write the check**

`src/lib/health/checks/claims-missing-pflichtdokumente.ts`:

```typescript
// Health-Check: Claims-Missing-Pflichtdokumente
// Erkennt aktive, recente Claims ohne Pflichtdokument-Slots (pflichtdokumente-Zeilen).
// Ohne Slots kann der Kunde keine Pflicht-Dokumente hochladen -> Slot-Init im
// Claim-Erstell-Pfad ist fehlgeschlagen. 14-Tage-Fenster haelt die Baseline sauber
// (10 historische slot-lose Alt-Claims sind <=2026-06-15; nur Regressionen sollen feuern).
// Read-only: claims.id/abgeschlossen_am/deaktiviert_am/created_at + pflichtdokumente.fall_id.
// Spec: docs/superpowers/specs/2026-07-07-data-integrity-guard-design.md
import type { HealthCheck, CheckResult } from '@/lib/health/types'

const WINDOW_TAGE = 14
const CRIT_SCHWELLE = 3

type ClaimIdRow = { id: string }
type FallIdRow = { fall_id: string }

export const claimsMissingPflichtdokumenteCheck: HealthCheck = {
  id: 'claims-missing-pflichtdokumente',
  category: 'funnel',
  title: 'Claims ohne Pflichtdokument-Slots',

  async run(ctx): Promise<CheckResult> {
    const cutoff = new Date(Date.now() - WINDOW_TAGE * 86_400_000).toISOString()

    // Query 1: recente aktive Claims (Kandidaten)
    const { data: claimData, error: claimError } = await ctx.supabase
      .from('claims')
      .select('id')
      .is('abgeschlossen_am', null)
      .is('deaktiviert_am', null)
      .gt('created_at', cutoff)

    if (claimError) {
      return { status: 'error', detail: `DB-Fehler beim Laden recenter Claims: ${claimError.message}` }
    }

    const candidateIds = ((claimData ?? []) as ClaimIdRow[]).map((r) => r.id)
    if (candidateIds.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine recenten aktiven Claims vorhanden.' }
    }

    // Query 2: welche Kandidaten HABEN Pflichtdokument-Slots
    const { data: pdData, error: pdError } = await ctx.supabase
      .from('pflichtdokumente')
      .select('fall_id')
      .in('fall_id', candidateIds)

    if (pdError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Pflichtdokumente: ${pdError.message}` }
    }

    const mitSlots = new Set(((pdData ?? []) as FallIdRow[]).map((r) => r.fall_id))
    const fehlend = candidateIds.filter((id) => !mitSlots.has(id))
    const n = fehlend.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: `Alle ${candidateIds.length} recenten aktiven Claims haben Pflichtdokument-Slots.`,
      }
    }

    return {
      status: n >= CRIT_SCHWELLE ? 'crit' : 'warn',
      metric: n,
      detail: `${n} recente aktive Claims ohne Pflichtdokument-Slots — Slot-Init im Claim-Erstell-Pfad fehlgeschlagen, Kunde kann keine Pflicht-Doku hochladen.`,
      sampleIds: fehlend.slice(0, 5),
    }
  },
}
```

- [ ] **Step 4: Register in `checks/index.ts`**

Add import after the `orchestratorPipelineCheck` import (line 16):

```typescript
import { claimsMissingPflichtdokumenteCheck } from './claims-missing-pflichtdokumente'
```

Add array entry after `orchestratorPipelineCheck,` (last entry, before the closing `]`):

```typescript
  claimsMissingPflichtdokumenteCheck,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/health/checks/__tests__/claims-missing-pflichtdokumente.test.ts`
Expected: PASS (8/8).

- [ ] **Step 6: Commit**

```bash
git add src/lib/health/checks/claims-missing-pflichtdokumente.ts \
        src/lib/health/checks/__tests__/claims-missing-pflichtdokumente.test.ts \
        src/lib/health/checks/index.ts
git commit  # message per AGENTS.md 7-Punkte-Audit-Block
```

---

### Task 2: Check `termine-missing-reminders`

**Files:**
- Create: `src/lib/health/checks/termine-missing-reminders.ts`
- Test: `src/lib/health/checks/__tests__/termine-missing-reminders.test.ts`
- Modify: `src/lib/health/checks/index.ts` (add import + array entry)

**Interfaces:**
- Consumes: `HealthCheck`, `CheckResult`, `CheckCtx` from `@/lib/health/types`.
- Produces: `export const termineMissingRemindersCheck: HealthCheck` (id `termine-missing-reminders`, category `cron`).

- [ ] **Step 1: Write the failing test**

`src/lib/health/checks/__tests__/termine-missing-reminders.test.ts`:

```typescript
// TDD-Tests fuer termine-missing-reminders Health-Check.
// Query 1 (gutachter_termine): .select('id').gt('start_zeit').eq('status') -> {id}
// Query 2 (termin_reminders):  .select('termin_id').in()                   -> {termin_id}
import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { termineMissingRemindersCheck } from '../termine-missing-reminders'

function makeCtx(candidateIds: string[], coveredTerminIds: string[]): CheckCtx {
  let call = 0
  const supabase = {
    from(_table: string) {
      call++
      if (call === 1) {
        return {
          select: () => ({
            gt: () => ({
              eq: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          in: () => Promise.resolve({ data: coveredTerminIds.map((termin_id) => ({ termin_id })), error: null }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ1ErrCtx(msg: string): CheckCtx {
  const supabase = {
    from() {
      return { select: () => ({ gt: () => ({ eq: () => Promise.resolve({ data: null, error: { message: msg } }) }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ2ErrCtx(candidateIds: string[], msg: string): CheckCtx {
  let call = 0
  const supabase = {
    from() {
      call++
      if (call === 1) {
        return {
          select: () => ({ gt: () => ({ eq: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }) }) }),
        }
      }
      return { select: () => ({ in: () => Promise.resolve({ data: null, error: { message: msg } }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('termineMissingRemindersCheck', () => {
  it('hat korrekte id und category', () => {
    expect(termineMissingRemindersCheck.id).toBe('termine-missing-reminders')
    expect(termineMissingRemindersCheck.category).toBe('cron')
  })

  it('ok wenn keine bestätigten Zukunfts-Termine', async () => {
    const result = await termineMissingRemindersCheck.run(makeCtx([], []))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('ok wenn alle Termine Reminder haben', async () => {
    const result = await termineMissingRemindersCheck.run(makeCtx(['t1', 't2'], ['t1', 't2']))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('warn wenn 1 Termin ohne Reminder', async () => {
    const result = await termineMissingRemindersCheck.run(makeCtx(['t1', 't2'], ['t1']))
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.sampleIds).toEqual(['t2'])
  })

  it('crit wenn >= 3 Termine ohne Reminder', async () => {
    const result = await termineMissingRemindersCheck.run(makeCtx(['t1', 't2', 't3', 't4'], ['t1']))
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(3)
  })

  it('sampleIds bei > 5 Verletzungen auf 5 begrenzt', async () => {
    const ids = ['t1', 't2', 't3', 't4', 't5', 't6']
    const result = await termineMissingRemindersCheck.run(makeCtx(ids, []))
    expect(result.metric).toBe(6)
    expect(result.sampleIds).toHaveLength(5)
  })

  it('error bei DB-Fehler in Query 1', async () => {
    const result = await termineMissingRemindersCheck.run(makeQ1ErrCtx('timeout'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('timeout')
  })

  it('error bei DB-Fehler in Query 2', async () => {
    const result = await termineMissingRemindersCheck.run(makeQ2ErrCtx(['t1'], 'boom'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('boom')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/health/checks/__tests__/termine-missing-reminders.test.ts`
Expected: FAIL — `Cannot find module '../termine-missing-reminders'`.

- [ ] **Step 3: Write the check**

`src/lib/health/checks/termine-missing-reminders.ts`:

```typescript
// Health-Check: Termine-Missing-Reminders
// Erkennt bestaetigte Zukunfts-Gutachter-Termine ohne Kunden-Reminder
// (termin_reminders). Ohne Reminder kein Erinnerungs-Versand -> No-Show-Risiko:
// der Queuer (generateReminderForTermin) feuerte beim Buchen/Bestaetigen nicht.
// dispatch_pending/storniert/verschoben/abgeschlossen sind bewusst ausgeschlossen
// (nur 'bestaetigt' erwartet einen Reminder).
// Read-only: gutachter_termine.id/start_zeit/status + termin_reminders.termin_id.
// Spec: docs/superpowers/specs/2026-07-07-data-integrity-guard-design.md
import type { HealthCheck, CheckResult } from '@/lib/health/types'

const CRIT_SCHWELLE = 3

type TerminIdRow = { id: string }
type ReminderRow = { termin_id: string }

export const termineMissingRemindersCheck: HealthCheck = {
  id: 'termine-missing-reminders',
  category: 'cron',
  title: 'Bestätigte Termine ohne Reminder',

  async run(ctx): Promise<CheckResult> {
    const nowIso = new Date().toISOString()

    // Query 1: bestaetigte Zukunfts-Termine (Kandidaten)
    const { data: terminData, error: terminError } = await ctx.supabase
      .from('gutachter_termine')
      .select('id')
      .gt('start_zeit', nowIso)
      .eq('status', 'bestaetigt')

    if (terminError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Termine: ${terminError.message}` }
    }

    const candidateIds = ((terminData ?? []) as TerminIdRow[]).map((r) => r.id)
    if (candidateIds.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine bestätigten Zukunfts-Termine vorhanden.' }
    }

    // Query 2: welche Kandidaten HABEN Reminder
    const { data: reminderData, error: reminderError } = await ctx.supabase
      .from('termin_reminders')
      .select('termin_id')
      .in('termin_id', candidateIds)

    if (reminderError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Termin-Reminder: ${reminderError.message}` }
    }

    const mitReminder = new Set(((reminderData ?? []) as ReminderRow[]).map((r) => r.termin_id))
    const fehlend = candidateIds.filter((id) => !mitReminder.has(id))
    const n = fehlend.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: `Alle ${candidateIds.length} bestätigten Zukunfts-Termine haben Reminder.`,
      }
    }

    return {
      status: n >= CRIT_SCHWELLE ? 'crit' : 'warn',
      metric: n,
      detail: `${n} bestätigte Zukunfts-Termine ohne Reminder — der Queuer (generateReminderForTermin) feuerte beim Buchen/Bestätigen nicht, Kunde bekommt keine Termin-Erinnerung.`,
      sampleIds: fehlend.slice(0, 5),
    }
  },
}
```

- [ ] **Step 4: Register in `checks/index.ts`**

Add import:

```typescript
import { termineMissingRemindersCheck } from './termine-missing-reminders'
```

Add array entry after `claimsMissingPflichtdokumenteCheck,`:

```typescript
  termineMissingRemindersCheck,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/health/checks/__tests__/termine-missing-reminders.test.ts`
Expected: PASS (8/8).

- [ ] **Step 6: Commit** (message per AGENTS.md 7-Punkte-Audit-Block).

---

### Task 3: Check `claims-missing-geschaedigter`

**Files:**
- Create: `src/lib/health/checks/claims-missing-geschaedigter.ts`
- Test: `src/lib/health/checks/__tests__/claims-missing-geschaedigter.test.ts`
- Modify: `src/lib/health/checks/index.ts` (add import + array entry)

**Interfaces:**
- Consumes: `HealthCheck`, `CheckResult`, `CheckCtx` from `@/lib/health/types`.
- Produces: `export const claimsMissingGeschaedigterCheck: HealthCheck` (id `claims-missing-geschaedigter`, category `funnel`).

- [ ] **Step 1: Write the failing test**

`src/lib/health/checks/__tests__/claims-missing-geschaedigter.test.ts`:

```typescript
// TDD-Tests fuer claims-missing-geschaedigter Health-Check.
// Query 1 (claims):        .select('id').is('deaktiviert_am', null)          -> {id}
// Query 2 (claim_parties): .select('claim_id').eq('rolle',…).in('claim_id',…) -> {claim_id}
import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { claimsMissingGeschaedigterCheck } from '../claims-missing-geschaedigter'

function makeCtx(candidateIds: string[], coveredClaimIds: string[]): CheckCtx {
  let call = 0
  const supabase = {
    from(_table: string) {
      call++
      if (call === 1) {
        return {
          select: () => ({
            is: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: coveredClaimIds.map((claim_id) => ({ claim_id })), error: null }),
          }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ1ErrCtx(msg: string): CheckCtx {
  const supabase = {
    from() {
      return { select: () => ({ is: () => Promise.resolve({ data: null, error: { message: msg } }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ2ErrCtx(candidateIds: string[], msg: string): CheckCtx {
  let call = 0
  const supabase = {
    from() {
      call++
      if (call === 1) {
        return { select: () => ({ is: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }) }) }
      }
      return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: null, error: { message: msg } }) }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('claimsMissingGeschaedigterCheck', () => {
  it('hat korrekte id und category', () => {
    expect(claimsMissingGeschaedigterCheck.id).toBe('claims-missing-geschaedigter')
    expect(claimsMissingGeschaedigterCheck.category).toBe('funnel')
  })

  it('ok wenn keine aktiven Claims', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx([], []))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('ok wenn alle Claims eine geschädigte Partei haben', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx(['c1', 'c2'], ['c1', 'c2']))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('warn wenn 1 Claim ohne geschädigte Partei', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx(['c1', 'c2'], ['c1']))
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.sampleIds).toEqual(['c2'])
  })

  it('crit wenn >= 3 Claims ohne geschädigte Partei', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx(['c1', 'c2', 'c3', 'c4'], ['c1']))
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(3)
  })

  it('sampleIds bei > 5 Verletzungen auf 5 begrenzt', async () => {
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx(ids, []))
    expect(result.metric).toBe(6)
    expect(result.sampleIds).toHaveLength(5)
  })

  it('error bei DB-Fehler in Query 1', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeQ1ErrCtx('timeout'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('timeout')
  })

  it('error bei DB-Fehler in Query 2', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeQ2ErrCtx(['c1'], 'boom'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('boom')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/health/checks/__tests__/claims-missing-geschaedigter.test.ts`
Expected: FAIL — `Cannot find module '../claims-missing-geschaedigter'`.

- [ ] **Step 3: Write the check**

`src/lib/health/checks/claims-missing-geschaedigter.ts`:

```typescript
// Health-Check: Claims-Missing-Geschaedigter
// Erkennt aktive Claims ohne geschaedigte Partei (claim_parties rolle='geschaedigter').
// Ohne diese Partei laufen Kunde-/Halter-Edits in der Fallakte ins Leere:
// die Claim-Erstellung hat keine geschaedigter-Zeile angelegt. Harte Invariante,
// kein Zeitfenster -> jede Verletzung = echte Regression.
// Read-only: claims.id/deaktiviert_am + claim_parties.claim_id/rolle.
// Spec: docs/superpowers/specs/2026-07-07-data-integrity-guard-design.md
import type { HealthCheck, CheckResult } from '@/lib/health/types'

const CRIT_SCHWELLE = 3

type ClaimIdRow = { id: string }
type PartyRow = { claim_id: string }

export const claimsMissingGeschaedigterCheck: HealthCheck = {
  id: 'claims-missing-geschaedigter',
  category: 'funnel',
  title: 'Claims ohne geschädigte Partei',

  async run(ctx): Promise<CheckResult> {
    // Query 1: alle aktiven Claims (Kandidaten)
    const { data: claimData, error: claimError } = await ctx.supabase
      .from('claims')
      .select('id')
      .is('deaktiviert_am', null)

    if (claimError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Claims: ${claimError.message}` }
    }

    const candidateIds = ((claimData ?? []) as ClaimIdRow[]).map((r) => r.id)
    if (candidateIds.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine aktiven Claims vorhanden.' }
    }

    // Query 2: welche Kandidaten HABEN eine geschaedigter-Partei
    const { data: partyData, error: partyError } = await ctx.supabase
      .from('claim_parties')
      .select('claim_id')
      .eq('rolle', 'geschaedigter')
      .in('claim_id', candidateIds)

    if (partyError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der claim_parties: ${partyError.message}` }
    }

    const mitPartei = new Set(((partyData ?? []) as PartyRow[]).map((r) => r.claim_id))
    const fehlend = candidateIds.filter((id) => !mitPartei.has(id))
    const n = fehlend.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: `Alle ${candidateIds.length} aktiven Claims haben eine geschädigte Partei.`,
      }
    }

    return {
      status: n >= CRIT_SCHWELLE ? 'crit' : 'warn',
      metric: n,
      detail: `${n} Claims ohne geschädigte Partei — Claim-Erstellung hat keine geschaedigter-claim_parties-Zeile angelegt, Kunde-/Halter-Edits in der Fallakte greifen nicht.`,
      sampleIds: fehlend.slice(0, 5),
    }
  },
}
```

- [ ] **Step 4: Register in `checks/index.ts`**

Add import:

```typescript
import { claimsMissingGeschaedigterCheck } from './claims-missing-geschaedigter'
```

Add array entry after `termineMissingRemindersCheck,`:

```typescript
  claimsMissingGeschaedigterCheck,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/health/checks/__tests__/claims-missing-geschaedigter.test.ts`
Expected: PASS (8/8).

- [ ] **Step 6: Commit** (message per AGENTS.md 7-Punkte-Audit-Block).

---

### Task 4: Full verification + PR

**Files:** none (gates only).

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in the 6 new files (pre-existing repo/env noise ignored; CI is authoritative).

- [ ] **Step 2: Full health-suite tests**

Run: `npx vitest run src/lib/health`
Expected: all green (11 existing + 3 new check test files, 24 new assertions).

- [ ] **Step 3: Ratchets (0 new violations)**

Run: `npm run check:token-audit && npm run check:component-set && npm run check:knip && npm run check:status-registry`
Expected: 0 new violations (pure-logic files, no styling/components/status-maps; new files imported by index.ts → knip clean).

- [ ] **Step 4: Confirm all 3 registered**

Verify `ALL_CHECKS` in `src/lib/health/checks/index.ts` contains all three new consts (now 14 checks).

- [ ] **Step 5: Push branch + open PR against `staging`**

PR title: `feat(health): Data-Integrity-Guard — 3 Invarianten-Checks (Ship-Safety P1)`. Body summarizes the 3 checks, calibrated baselines (all 0), no-DDL/no-infra, links the spec.

## Self-Review

**1. Spec coverage:** Check 1 (`claims-missing-pflichtdokumente`, funnel, 14d) → Task 1. Check 2 (`termine-missing-reminders`, cron) → Task 2. Check 3 (`claims-missing-geschaedigter`, funnel) → Task 3. Error-handling (`status:'error'` on DB error) → every check Step 3 + tested. Testing (violation/clean/error scenarios) → every test Step 1, extended with empty-candidates + sampleIds-cap. Registration → each task Step 4. Rollout (auto via ALL_CHECKS cron) → Task 4 Step 4. YAGNI exclusions (no PREVENT, no backfill, no extra invariants) → not built. **No gaps.**

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output. Clean.

**3. Type consistency:** `HealthCheck`/`CheckResult`/`CheckCtx` used identically to `types.ts` + existing checks. Const names match between check file, test import, and `index.ts` registration (`claimsMissingPflichtdokumenteCheck`, `termineMissingRemindersCheck`, `claimsMissingGeschaedigterCheck`). `metric` numeric, `sampleIds` string[], threshold `>= 3 crit` else `warn`. Mock builder chains match each check's exact `.select()...` call order. Consistent.
