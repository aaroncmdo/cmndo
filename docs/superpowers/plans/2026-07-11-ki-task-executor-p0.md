# KI-Task-Executor P0 (Engine + Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein General-KI-Executor, der einen Admin/KB-Task nimmt, per Single-Turn-Tool-Use einen Aktions-Plan komponiert, sichere Aktionen sofort ausführt und konsequente Aktionen (Outbound/Status/SV) zur Bestätigung zurückgibt — alles auditiert. P0 liefert die vollständig getestete Engine + Server-Actions (ohne UI; P1 = Kanban-Button + Confirm-Modal).

**Architecture:** Neuer Consumer der geteilten `claim-ai/engine`. Executor-Verben erweitern `VerbDefinition` um `risk` + `apply` (`ActionVerb`). `planTaskExecution` ruft `callForProposals` (Single-Turn) mit dem vollen Verb-Belt → extrahiert `ActionDraft[]` → `buildPlan` klassifiziert Risk → `applyPlan` führt aus. Plan-Level-Gating: reiner Safe-Plan läuft sofort, jeder consequential-Plan wartet auf `bestaetigeKiAusfuehrung`. Audit in neuer Tabelle `ai_task_executions` + Claim-Timeline.

**Tech Stack:** TypeScript, Next.js 15 (Server-Actions), Supabase (Postgres + RLS), Anthropic SDK (`@anthropic-ai/sdk`), Zod, Vitest.

## Global Constraints

- **Regel 1:** Nie auf `main` pushen. Branch `kitta/ki-task-executor`, PR gegen `staging`.
- **Regel 2:** DDL **nur** via Supabase-Plugin `apply_migration` → dann `list_migrations` → File exakt nach getrackter Version benennen → committen. Projekt-Ref: `paizkjajbuxxksdoycev`. `execute_sql` nur READ.
- **Server-Actions:** Result-Shape `{ ok: boolean; error?: string }` (kein `throw`; kein `success`). Non-critical Sub-Ops (Timeline/Send) in lokalem try/catch.
- **Kein Export von Konstanten/Typen aus `'use server'`-Files** (Client-Bundle macht `undefined`). Typen/Consts leben in `src/lib/task-executor/*` (kein `'use server'`), Actions importieren sie.
- **Kill-Switch:** ENV `TASK_EXECUTOR_ENABLED` (Default aus → Feature liefert `{ ok:false }`).
- **Modell:** `AI_MODELS.task_executor = 'claude-sonnet-4-6'`.
- **Tests:** Vitest (`import { describe, it, expect, vi } from 'vitest'`). Test-File neben Source (`*.test.ts`).
- **DB-Fakten (verifiziert 2026-07-11):** `tasks.typ` ist der Diskriminator (`task_typ` fast leer). `tasks.fall_id`→FK `faelle_claim_bridge`, `tasks.claim_id`→FK `claims`; jeder Task hat **beide oder keins**. `sendFallCommunication`/`transitionFallStatus` nehmen `fallId`; `buildClaimContext` nimmt `claimId`.
- **Umlaute:** nur in nutzersichtbaren Strings Pflicht — P0 hat keine UI; interne Notiz-/Log-Strings dürfen ASCII sein, echte Umlaute schaden nie.

---

## Task 1: Migration `ai_task_executions`

**Files:**
- Create: `supabase/migrations/<recorded-version>_ai_task_executions.sql`

**Interfaces:**
- Produces: Tabelle `public.ai_task_executions` (RLS an, service_role-only) + Partial-Unique-Index auf offene Ausführung je Task.

- [ ] **Step 1: DDL via Plugin anwenden**

Call `mcp__plugin_supabase_supabase__apply_migration` mit `project_id: "paizkjajbuxxksdoycev"`, `name: "ai_task_executions"`, `query`:

```sql
create table public.ai_task_executions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  claim_id uuid references public.claims(id) on delete cascade,
  typ text,
  status text not null default 'geplant'
    check (status in ('geplant','warte_bestaetigung','ausgefuehrt','abgebrochen','fehler')),
  plan jsonb not null default '[]'::jsonb,
  begruendung text,
  modell text not null,
  gestartet_von uuid references auth.users(id),
  bestaetigt_von uuid references auth.users(id),
  erstellt_am timestamptz not null default now(),
  abgeschlossen_am timestamptz,
  fehler text
);
create index ai_task_executions_task_idx on public.ai_task_executions(task_id);
create index ai_task_executions_claim_idx on public.ai_task_executions(claim_id);
create unique index ai_task_executions_offen_idx
  on public.ai_task_executions(task_id) where status in ('geplant','warte_bestaetigung');
alter table public.ai_task_executions enable row level security;
revoke all on public.ai_task_executions from anon, authenticated;
```

- [ ] **Step 2: Getrackte Version ablesen**

Call `mcp__plugin_supabase_supabase__list_migrations` (`project_id: "paizkjajbuxxksdoycev"`). Notiere die neu erschienene Version `<V>` für `ai_task_executions` (Plugin vergibt einen EIGENEN Timestamp).

- [ ] **Step 3: Migration-File committen mit exakt der getrackten Version**

Create `supabase/migrations/<V>_ai_task_executions.sql` mit exakt dem DDL aus Step 1 (Dateiname == `<V>` aus Step 2 — sonst Twin-Drift).

```bash
git add supabase/migrations/<V>_ai_task_executions.sql
git commit -m "feat(ki-task-executor): ai_task_executions audit-tabelle (migration)"
```

- [ ] **Step 4: Verifizieren (READ)**

Call `mcp__plugin_supabase_supabase__execute_sql` (`project_id: "paizkjajbuxxksdoycev"`):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'ai_task_executions' order by ordinal_position;
```
Expected: 13 Spalten inkl. `status`, `plan (jsonb)`, `gestartet_von`, `bestaetigt_von`.

---

## Task 2: Executor-Typen + Verb-Definitionen (validate/tool/risk)

**Files:**
- Create: `src/lib/task-executor/types.ts`
- Create: `src/lib/task-executor/allowed-triggers.ts`
- Create: `src/lib/task-executor/verbs.ts`
- Test: `src/lib/task-executor/verbs.test.ts`

**Interfaces:**
- Consumes: `VerbDefinition<T>`, `validateVerb` from `@/lib/claim-ai/engine/verbs`; `FALL_STATUS_TRANSITIONS` from `@/lib/faelle/state-machine`.
- Produces:
  - `types.ts`: `Risk = 'safe'|'consequential'`; `ActionDraft = { verb: string; args: Record<string,unknown>; begruendung?: string }`; `TaskRow`; `ExecCtx`; `ActionResult`; `ActionVerb = VerbDefinition<ActionDraft> & { risk: Risk; apply: (d: ActionDraft, ctx: ExecCtx) => Promise<ActionResult> }`; `PlanStep`; `ExecutionPlan`.
  - `allowed-triggers.ts`: `ERLAUBTE_COMM_TRIGGER` (readonly string[]).
  - `verbs.ts`: `EXECUTOR_VERBS: ActionVerb[]`, `validateActionCall(name, input)`. Kein Platzhalter: `apply` wird in **Task 3** in `apply.ts` definiert und hier importiert (`applyInterneNotiz` etc. aus `./apply`). **Tasks 2+3 sind eine Commit-Einheit** (verbs.ts importiert apply.ts) — Task 2 hinterlässt bewusst rote Tests, Task 3 macht sie grün und committet beide zusammen.

- [ ] **Step 1: `types.ts` schreiben**

```typescript
// src/lib/task-executor/types.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VerbDefinition } from '@/lib/claim-ai/engine/verbs'

export type Risk = 'safe' | 'consequential'

/** Ein vom LLM komponierter Aktions-Vorschlag (nach validate). `verb` traegt den
 *  Namen, damit Risk + Apply nach der Extraktion auffindbar sind. */
export type ActionDraft = {
  verb: string
  args: Record<string, unknown>
  begruendung?: string
}

/** Minimaler Task-Kontext, den der Executor braucht (frisch server-seitig geladen). */
export type TaskRow = {
  id: string
  typ: string | null
  titel: string
  beschreibung: string | null
  status: string
  claim_id: string | null
  fall_id: string | null
  empfaenger_rolle: string | null
}

export type ExecCtx = {
  db: SupabaseClient
  task: TaskRow
  claimId: string
  fallId: string | null
  userId: string
}

export type ActionResult = { ok: boolean; detail?: string; error?: string }

/** Executor-Verb = Engine-Verb + Risiko-Klasse + Apply-Seiteneffekt. */
export type ActionVerb = VerbDefinition<ActionDraft> & {
  risk: Risk
  apply: (draft: ActionDraft, ctx: ExecCtx) => Promise<ActionResult>
}

export type PlanStep = {
  verb: string
  args: Record<string, unknown>
  risk: Risk
  begruendung?: string
  applied?: boolean
  result?: ActionResult
}

export type ExecutionPlan = {
  steps: PlanStep[]
  begruendung: string
  hatConsequential: boolean
}
```

- [ ] **Step 2: `allowed-triggers.ts` schreiben**

```typescript
// src/lib/task-executor/allowed-triggers.ts
// Kuratierte Teilmenge von COMMUNICATION_REGISTRY-Triggern, die der Executor
// senden darf (Template existiert + geprueft). Bewusst klein; neue Trigger hier
// ergaenzen (nicht im Verb frei-stringen). WhatsApp ist template-gebunden — kein
// Freitext. Verifiziere neue Trigger gegen src/lib/communications/registry.ts.
export const ERLAUBTE_COMM_TRIGGER = [
  'dokumente_nachreichen',
  'dokumente_upload_anfrage',
] as const

export type ErlaubterTrigger = (typeof ERLAUBTE_COMM_TRIGGER)[number]
```

- [ ] **Step 3: Failing test schreiben**

```typescript
// src/lib/task-executor/verbs.test.ts
import { describe, it, expect } from 'vitest'
import { validateActionCall, EXECUTOR_VERBS } from './verbs'

describe('validateActionCall', () => {
  it('akzeptiert gueltige interne_notiz', () => {
    const r = validateActionCall('interne_notiz', { text: 'Kunde erinnert' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft.verb).toBe('interne_notiz')
  })
  it('lehnt zu kurzen Notiz-Text ab', () => {
    const r = validateActionCall('interne_notiz', { text: 'x' })
    expect(r.ok).toBe(false)
  })
  it('akzeptiert sende_kommunikation nur mit erlaubtem Trigger', () => {
    const ok = validateActionCall('sende_kommunikation', { trigger: 'dokumente_nachreichen', variablen: {} })
    expect(ok.ok).toBe(true)
    const bad = validateActionCall('sende_kommunikation', { trigger: 'drop_table', variablen: {} })
    expect(bad.ok).toBe(false)
  })
  it('akzeptiert setze_status nur mit bekanntem Zielstatus', () => {
    const ok = validateActionCall('setze_status', { neuer_status: 'sv-gesucht', grund: 'kein SV' })
    expect(ok.ok).toBe(true)
    const bad = validateActionCall('setze_status', { neuer_status: 'phantasie', grund: 'x' })
    expect(bad.ok).toBe(false)
  })
  it('lehnt unbekanntes Verb ab', () => {
    expect(validateActionCall('rm_rf', {}).ok).toBe(false)
  })
  it('exponiert genau 4 Verben mit korrekten Risk-Klassen', () => {
    const byName = Object.fromEntries(EXECUTOR_VERBS.map((v) => [v.name, v.risk]))
    expect(byName).toEqual({
      interne_notiz: 'safe',
      task_schliessen: 'safe',
      sende_kommunikation: 'consequential',
      setze_status: 'consequential',
    })
  })
})
```

- [ ] **Step 4: Test ausführen — muss fehlschlagen**

Run: `npx vitest run src/lib/task-executor/verbs.test.ts`
Expected: FAIL ("Cannot find module './verbs'").

- [ ] **Step 5: `verbs.ts` schreiben** (validate/tool/risk; `apply` importiert aus `./apply`, das Task 3 baut)

```typescript
// src/lib/task-executor/verbs.ts
import { z } from 'zod'
import { validateVerb } from '@/lib/claim-ai/engine/verbs'
import { FALL_STATUS_TRANSITIONS } from '@/lib/faelle/state-machine'
import { ERLAUBTE_COMM_TRIGGER } from './allowed-triggers'
import { applyInterneNotiz, applyTaskSchliessen, applySendeKommunikation, applySetzeStatus } from './apply'
import type { ActionVerb, ActionDraft } from './types'

const ALLE_STATUS = Object.keys(FALL_STATUS_TRANSITIONS)

const notizSchema = z.object({ text: z.string().min(3), begruendung: z.string().optional() })
const schliessenSchema = z.object({ ergebnis: z.string().min(3), begruendung: z.string().optional() })
const kommSchema = z.object({
  trigger: z.enum(ERLAUBTE_COMM_TRIGGER),
  variablen: z.record(z.string()).default({}),
  begruendung: z.string().optional(),
})
const statusSchema = z.object({
  neuer_status: z.enum(ALLE_STATUS as [string, ...string[]]),
  grund: z.string().min(3),
  begruendung: z.string().optional(),
})

function draft(verb: string, args: Record<string, unknown>, begruendung?: string): ActionDraft {
  return { verb, args, begruendung }
}

export const EXECUTOR_VERBS: ActionVerb[] = [
  {
    name: 'interne_notiz',
    risk: 'safe',
    tool: {
      name: 'interne_notiz',
      description: 'Schreibe eine interne Notiz an den Fall (nur fuer Mitarbeiter sichtbar, kein Outbound).',
      input_schema: {
        type: 'object',
        properties: { text: { type: 'string' }, begruendung: { type: 'string' } },
        required: ['text'],
      },
    },
    validate: (input) => {
      const p = notizSchema.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: draft('interne_notiz', { text: p.data.text }, p.data.begruendung) }
    },
    apply: applyInterneNotiz,
  },
  {
    name: 'task_schliessen',
    risk: 'safe',
    tool: {
      name: 'task_schliessen',
      description: 'Markiere die Aufgabe als erledigt. Nutze dies als LETZTE Aktion, wenn die Aufgabe abgeschlossen ist.',
      input_schema: {
        type: 'object',
        properties: { ergebnis: { type: 'string' }, begruendung: { type: 'string' } },
        required: ['ergebnis'],
      },
    },
    validate: (input) => {
      const p = schliessenSchema.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: draft('task_schliessen', { ergebnis: p.data.ergebnis }, p.data.begruendung) }
    },
    apply: applyTaskSchliessen,
  },
  {
    name: 'sende_kommunikation',
    risk: 'consequential',
    tool: {
      name: 'sende_kommunikation',
      description:
        'Sende eine vordefinierte Nachricht (WhatsApp/Email-Template) an den Empfaenger des Falls. Waehle einen erlaubten Trigger und fuelle dessen Variablen. KEIN Freitext.',
      input_schema: {
        type: 'object',
        properties: {
          trigger: { type: 'string', enum: [...ERLAUBTE_COMM_TRIGGER] },
          variablen: { type: 'object', additionalProperties: { type: 'string' } },
          begruendung: { type: 'string' },
        },
        required: ['trigger'],
      },
    },
    validate: (input) => {
      const p = kommSchema.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: draft('sende_kommunikation', { trigger: p.data.trigger, variablen: p.data.variablen }, p.data.begruendung) }
    },
    apply: applySendeKommunikation,
  },
  {
    name: 'setze_status',
    risk: 'consequential',
    tool: {
      name: 'setze_status',
      description: 'Setze den Fall-Status neu (z.B. sv-gesucht). Nur bei klarer Notwendigkeit aus dem Kontext.',
      input_schema: {
        type: 'object',
        properties: {
          neuer_status: { type: 'string', enum: ALLE_STATUS },
          grund: { type: 'string' },
          begruendung: { type: 'string' },
        },
        required: ['neuer_status', 'grund'],
      },
    },
    validate: (input) => {
      const p = statusSchema.safeParse(input)
      if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
      return { ok: true, draft: draft('setze_status', { neuer_status: p.data.neuer_status, grund: p.data.grund }, p.data.begruendung) }
    },
    apply: applySetzeStatus,
  },
]

export function validateActionCall(name: string, input: unknown) {
  return validateVerb(EXECUTOR_VERBS, name, input)
}
```

- [ ] **Step 6: Test ausführen — muss (noch) an fehlendem `./apply` scheitern, dann nach Task 3 grün**

Run: `npx vitest run src/lib/task-executor/verbs.test.ts`
Expected jetzt: FAIL ("Cannot find module './apply'"). → Task 3 liefert `apply.ts`; danach grün. **Nicht committen bis Task 3 abgeschlossen ist** (Verbs + Apply gehören zusammen, gemeinsamer Commit in Task 3 Step 5).

---

## Task 3: Apply-Wrapper der Verben

**Files:**
- Create: `src/lib/task-executor/apply.ts`
- Test: `src/lib/task-executor/apply.test.ts`

**Interfaces:**
- Consumes: `logFallEvent` from `@/lib/fall/log-event`; `updateTaskStatusCore` from `@/lib/tasks/update-status-core`; `sendFallCommunication` from `@/lib/communications/send-fall`; `transitionFallStatus` from `@/lib/faelle/state-machine`; `ActionDraft`, `ExecCtx`, `ActionResult` from `./types`.
- Produces: `applyInterneNotiz`, `applyTaskSchliessen`, `applySendeKommunikation`, `applySetzeStatus` — je `(draft: ActionDraft, ctx: ExecCtx) => Promise<ActionResult>`. Alle fangen Fehler → `ActionResult` (kein throw).

- [ ] **Step 1: Failing test schreiben**

```typescript
// src/lib/task-executor/apply.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/fall/log-event', () => ({ logFallEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/tasks/update-status-core', () => ({ updateTaskStatusCore: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/communications/send-fall', () => ({ sendFallCommunication: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/faelle/state-machine', () => ({
  transitionFallStatus: vi.fn().mockResolvedValue(undefined),
  FALL_STATUS_TRANSITIONS: { 'ersterfassung': ['sv-gesucht'], 'sv-gesucht': [] },
}))

import { applyInterneNotiz, applyTaskSchliessen, applySendeKommunikation, applySetzeStatus } from './apply'
import { logFallEvent } from '@/lib/fall/log-event'
import { updateTaskStatusCore } from '@/lib/tasks/update-status-core'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import type { ExecCtx } from './types'

const ctx: ExecCtx = {
  db: {} as never,
  task: { id: 't1', typ: 'sa_ausstehend', titel: 'SA', beschreibung: null, status: 'offen', claim_id: 'c1', fall_id: 'f1', empfaenger_rolle: null },
  claimId: 'c1', fallId: 'f1', userId: 'u1',
}

beforeEach(() => vi.clearAllMocks())

describe('apply-wrapper', () => {
  it('interne_notiz ruft logFallEvent mit fallId + actor', async () => {
    const r = await applyInterneNotiz({ verb: 'interne_notiz', args: { text: 'Hallo' } }, ctx)
    expect(r.ok).toBe(true)
    expect(logFallEvent).toHaveBeenCalledWith(ctx.db, expect.objectContaining({ fallId: 'f1', actor: 'u1' }))
  })
  it('task_schliessen ruft updateTaskStatusCore(erledigt)', async () => {
    const r = await applyTaskSchliessen({ verb: 'task_schliessen', args: { ergebnis: 'fertig' } }, ctx)
    expect(r.ok).toBe(true)
    expect(updateTaskStatusCore).toHaveBeenCalledWith(ctx.db, 't1', 'erledigt')
  })
  it('task_schliessen faengt throw ab → ok:false', async () => {
    ;(updateTaskStatusCore as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const r = await applyTaskSchliessen({ verb: 'task_schliessen', args: { ergebnis: 'x' } }, ctx)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('boom')
  })
  it('sende_kommunikation ruft sendFallCommunication(fallId, trigger, variablen)', async () => {
    const r = await applySendeKommunikation({ verb: 'sende_kommunikation', args: { trigger: 'dokumente_nachreichen', variablen: { '1': 'ZB1' } } }, ctx)
    expect(r.ok).toBe(true)
    expect(sendFallCommunication).toHaveBeenCalledWith('f1', 'dokumente_nachreichen', { '1': 'ZB1' })
  })
  it('setze_status ruft transitionFallStatus(fallId, status, {grund,user_id})', async () => {
    const r = await applySetzeStatus({ verb: 'setze_status', args: { neuer_status: 'sv-gesucht', grund: 'kein SV' } }, ctx)
    expect(r.ok).toBe(true)
    expect(transitionFallStatus).toHaveBeenCalledWith('f1', 'sv-gesucht', { grund: 'kein SV', user_id: 'u1' })
  })
  it('sende_kommunikation ohne fallId → ok:false (kein Send)', async () => {
    const r = await applySendeKommunikation({ verb: 'sende_kommunikation', args: { trigger: 'dokumente_nachreichen', variablen: {} } }, { ...ctx, fallId: null })
    expect(r.ok).toBe(false)
    expect(sendFallCommunication).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run src/lib/task-executor/apply.test.ts`
Expected: FAIL ("Cannot find module './apply'").

- [ ] **Step 3: `apply.ts` schreiben**

```typescript
// src/lib/task-executor/apply.ts
import { logFallEvent } from '@/lib/fall/log-event'
import { updateTaskStatusCore } from '@/lib/tasks/update-status-core'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import type { ActionDraft, ExecCtx, ActionResult } from './types'

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export async function applyInterneNotiz(draft: ActionDraft, ctx: ExecCtx): Promise<ActionResult> {
  const text = String(draft.args.text ?? '').trim()
  if (!text) return { ok: false, error: 'Leerer Notiz-Text' }
  if (!ctx.fallId) return { ok: false, error: 'Kein fall_id fuer Timeline-Notiz' }
  try {
    await logFallEvent(ctx.db as never, {
      fallId: ctx.fallId,
      typ: 'system',
      titel: 'KI-Notiz',
      beschreibung: text,
      actor: ctx.userId,
      metadata: { quelle: 'task_executor', task_id: ctx.task.id },
    })
    return { ok: true, detail: 'Notiz gespeichert' }
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Notiz fehlgeschlagen') }
  }
}

export async function applyTaskSchliessen(_draft: ActionDraft, ctx: ExecCtx): Promise<ActionResult> {
  try {
    await updateTaskStatusCore(ctx.db, ctx.task.id, 'erledigt')
    return { ok: true, detail: 'Task erledigt' }
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Task-Schliessen fehlgeschlagen') }
  }
}

export async function applySendeKommunikation(draft: ActionDraft, ctx: ExecCtx): Promise<ActionResult> {
  const trigger = String(draft.args.trigger ?? '')
  const variablen = (draft.args.variablen ?? {}) as Record<string, string>
  if (!ctx.fallId) return { ok: false, error: 'Kein fall_id fuer Kommunikation' }
  if (!trigger) return { ok: false, error: 'Kein Trigger' }
  try {
    await sendFallCommunication(ctx.fallId, trigger, variablen)
    return { ok: true, detail: `Kommunikation gesendet: ${trigger}` }
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Send fehlgeschlagen') }
  }
}

export async function applySetzeStatus(draft: ActionDraft, ctx: ExecCtx): Promise<ActionResult> {
  const neuerStatus = String(draft.args.neuer_status ?? '')
  const grund = String(draft.args.grund ?? '')
  if (!ctx.fallId) return { ok: false, error: 'Kein fall_id fuer Statuswechsel' }
  if (!neuerStatus) return { ok: false, error: 'Kein Zielstatus' }
  try {
    await transitionFallStatus(ctx.fallId, neuerStatus, { grund, user_id: ctx.userId })
    return { ok: true, detail: `Status → ${neuerStatus}` }
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Statuswechsel fehlgeschlagen') }
  }
}
```

- [ ] **Step 4: Beide Test-Files ausführen — grün**

Run: `npx vitest run src/lib/task-executor/apply.test.ts src/lib/task-executor/verbs.test.ts`
Expected: PASS (beide).

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-executor/types.ts src/lib/task-executor/allowed-triggers.ts src/lib/task-executor/verbs.ts src/lib/task-executor/verbs.test.ts src/lib/task-executor/apply.ts src/lib/task-executor/apply.test.ts
git commit -m "feat(ki-task-executor): ActionVerb-Belt (interne_notiz/task_schliessen/sende_kommunikation/setze_status) + apply-wrapper"
```

---

## Task 4: `extractActions` + `buildPlan`

**Files:**
- Create: `src/lib/task-executor/plan.ts`
- Test: `src/lib/task-executor/plan.test.ts`

**Interfaces:**
- Consumes: `validateActionCall`, `EXECUTOR_VERBS` from `./verbs`; `ActionDraft`, `PlanStep`, `ExecutionPlan` from `./types`; `Anthropic.ContentBlock`.
- Produces:
  - `extractActions(content: Anthropic.ContentBlock[]): ActionDraft[]`
  - `buildPlan(drafts: ActionDraft[]): ExecutionPlan` — Risk je Verb aus `EXECUTOR_VERBS`; `task_schliessen` immer als letzter Step; `hatConsequential = steps.some(s => s.risk === 'consequential')`; `begruendung` = zusammengefasste Step-Begruendungen.

- [ ] **Step 1: Failing test**

```typescript
// src/lib/task-executor/plan.test.ts
import { describe, it, expect } from 'vitest'
import { extractActions, buildPlan } from './plan'
import type { ActionDraft } from './types'
import type Anthropic from '@anthropic-ai/sdk'

describe('extractActions', () => {
  it('mappt gueltige tool_use-Bloecke, ueberspringt ungueltige + text', () => {
    const content = [
      { type: 'text', text: 'egal' },
      { type: 'tool_use', id: 'a', name: 'interne_notiz', input: { text: 'Kunde kontaktiert' } },
      { type: 'tool_use', id: 'b', name: 'interne_notiz', input: { text: 'x' } }, // zu kurz → raus
      { type: 'tool_use', id: 'c', name: 'unbekannt', input: {} },                 // unbekannt → raus
    ] as unknown as Anthropic.ContentBlock[]
    const drafts = extractActions(content)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].verb).toBe('interne_notiz')
  })
})

describe('buildPlan', () => {
  it('leerer Plan bei keinen Drafts', () => {
    const plan = buildPlan([])
    expect(plan.steps).toHaveLength(0)
    expect(plan.hatConsequential).toBe(false)
  })
  it('reiner Safe-Plan → hatConsequential=false, schliessen zuletzt', () => {
    const drafts: ActionDraft[] = [
      { verb: 'task_schliessen', args: { ergebnis: 'ok' } },
      { verb: 'interne_notiz', args: { text: 'geprueft' } },
    ]
    const plan = buildPlan(drafts)
    expect(plan.hatConsequential).toBe(false)
    expect(plan.steps.map((s) => s.verb)).toEqual(['interne_notiz', 'task_schliessen'])
  })
  it('mit Outbound → hatConsequential=true', () => {
    const drafts: ActionDraft[] = [
      { verb: 'sende_kommunikation', args: { trigger: 'dokumente_nachreichen', variablen: {} }, begruendung: 'Doks fehlen' },
      { verb: 'task_schliessen', args: { ergebnis: 'gesendet' } },
    ]
    const plan = buildPlan(drafts)
    expect(plan.hatConsequential).toBe(true)
    expect(plan.steps[0].risk).toBe('consequential')
    expect(plan.steps.at(-1)?.verb).toBe('task_schliessen')
    expect(plan.begruendung).toContain('Doks fehlen')
  })
})
```

- [ ] **Step 2: Test ausführen — FAIL** (`Cannot find module './plan'`).

Run: `npx vitest run src/lib/task-executor/plan.test.ts`

- [ ] **Step 3: `plan.ts` schreiben**

```typescript
// src/lib/task-executor/plan.ts
import type Anthropic from '@anthropic-ai/sdk'
import { validateActionCall, EXECUTOR_VERBS } from './verbs'
import type { ActionDraft, ExecutionPlan, PlanStep, Risk } from './types'

const RISK_BY_VERB: Record<string, Risk> = Object.fromEntries(EXECUTOR_VERBS.map((v) => [v.name, v.risk]))

/** Spiegelt extractProposalsFromToolUse: tool_use-Bloecke → validierte ActionDrafts. */
export function extractActions(content: Anthropic.ContentBlock[]): ActionDraft[] {
  const out: ActionDraft[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const r = validateActionCall(block.name, block.input)
    if (r.ok) out.push(r.draft)
  }
  return out
}

/** Klassifiziert Risk, ordnet task_schliessen ans Ende, aggregiert Begruendung. */
export function buildPlan(drafts: ActionDraft[]): ExecutionPlan {
  const steps: PlanStep[] = drafts.map((d) => ({
    verb: d.verb,
    args: d.args,
    risk: RISK_BY_VERB[d.verb] ?? 'consequential', // unbekannt → sicherste Annahme
    begruendung: d.begruendung,
  }))
  const nichtSchliessen = steps.filter((s) => s.verb !== 'task_schliessen')
  const schliessen = steps.filter((s) => s.verb === 'task_schliessen')
  const geordnet = [...nichtSchliessen, ...schliessen]
  const begruendung = geordnet.map((s) => s.begruendung).filter(Boolean).join(' · ') || 'KI-Ausfuehrung'
  return {
    steps: geordnet,
    begruendung,
    hatConsequential: geordnet.some((s) => s.risk === 'consequential'),
  }
}
```

- [ ] **Step 4: Test — PASS.** Run: `npx vitest run src/lib/task-executor/plan.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-executor/plan.ts src/lib/task-executor/plan.test.ts
git commit -m "feat(ki-task-executor): extractActions + buildPlan (risk-aggregation, schliessen-last)"
```

---

## Task 5: `applyPlan`

**Files:**
- Create: `src/lib/task-executor/apply-plan.ts`
- Test: `src/lib/task-executor/apply-plan.test.ts`

**Interfaces:**
- Consumes: `EXECUTOR_VERBS` from `./verbs`; `ExecutionPlan`, `ExecCtx`, `PlanStep` from `./types`.
- Produces: `applyPlan(plan: ExecutionPlan, ctx: ExecCtx): Promise<{ status: 'ausgefuehrt' | 'fehler'; steps: PlanStep[]; fehler?: string }>` — führt Steps in Reihenfolge aus (`verb.apply`), schreibt `applied`/`result` je Step, stoppt beim ersten Fehler (`status='fehler'`), sonst `status='ausgefuehrt'`.

- [ ] **Step 1: Failing test**

```typescript
// src/lib/task-executor/apply-plan.test.ts
import { describe, it, expect, vi } from 'vitest'

const notizApply = vi.fn().mockResolvedValue({ ok: true })
const schliessenApply = vi.fn().mockResolvedValue({ ok: true })
vi.mock('./verbs', () => ({
  EXECUTOR_VERBS: [
    { name: 'interne_notiz', risk: 'safe', apply: notizApply },
    { name: 'task_schliessen', risk: 'safe', apply: schliessenApply },
  ],
}))

import { applyPlan } from './apply-plan'
import type { ExecutionPlan, ExecCtx } from './types'

const ctx = { db: {}, task: { id: 't1' }, claimId: 'c1', fallId: 'f1', userId: 'u1' } as unknown as ExecCtx

describe('applyPlan', () => {
  it('fuehrt alle Steps in Reihenfolge aus → ausgefuehrt', async () => {
    const plan: ExecutionPlan = {
      steps: [
        { verb: 'interne_notiz', args: { text: 'a' }, risk: 'safe' },
        { verb: 'task_schliessen', args: { ergebnis: 'b' }, risk: 'safe' },
      ],
      begruendung: 'x', hatConsequential: false,
    }
    const r = await applyPlan(plan, ctx)
    expect(r.status).toBe('ausgefuehrt')
    expect(r.steps.every((s) => s.applied && s.result?.ok)).toBe(true)
    expect(notizApply).toHaveBeenCalledBefore(schliessenApply as never)
  })
  it('stoppt beim ersten Fehler → fehler, Folge-Step nicht ausgefuehrt', async () => {
    notizApply.mockResolvedValueOnce({ ok: false, error: 'nope' })
    schliessenApply.mockClear()
    const plan: ExecutionPlan = {
      steps: [
        { verb: 'interne_notiz', args: {}, risk: 'safe' },
        { verb: 'task_schliessen', args: {}, risk: 'safe' },
      ],
      begruendung: 'x', hatConsequential: false,
    }
    const r = await applyPlan(plan, ctx)
    expect(r.status).toBe('fehler')
    expect(r.fehler).toContain('nope')
    expect(schliessenApply).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test — FAIL** (`Cannot find module './apply-plan'`). Run: `npx vitest run src/lib/task-executor/apply-plan.test.ts`

- [ ] **Step 3: `apply-plan.ts` schreiben**

```typescript
// src/lib/task-executor/apply-plan.ts
import { EXECUTOR_VERBS } from './verbs'
import type { ExecutionPlan, ExecCtx, PlanStep } from './types'

const VERB_BY_NAME = Object.fromEntries(EXECUTOR_VERBS.map((v) => [v.name, v]))

export async function applyPlan(
  plan: ExecutionPlan,
  ctx: ExecCtx,
): Promise<{ status: 'ausgefuehrt' | 'fehler'; steps: PlanStep[]; fehler?: string }> {
  const steps: PlanStep[] = plan.steps.map((s) => ({ ...s }))
  for (const step of steps) {
    const verb = VERB_BY_NAME[step.verb]
    if (!verb) {
      step.applied = false
      step.result = { ok: false, error: `Unbekanntes Verb: ${step.verb}` }
      return { status: 'fehler', steps, fehler: step.result.error }
    }
    const result = await verb.apply({ verb: step.verb, args: step.args, begruendung: step.begruendung }, ctx)
    step.applied = true
    step.result = result
    if (!result.ok) {
      return { status: 'fehler', steps, fehler: result.error ?? 'Aktion fehlgeschlagen' }
    }
  }
  return { status: 'ausgefuehrt', steps }
}
```

- [ ] **Step 4: Test — PASS.** Run: `npx vitest run src/lib/task-executor/apply-plan.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-executor/apply-plan.ts src/lib/task-executor/apply-plan.test.ts
git commit -m "feat(ki-task-executor): applyPlan (sequenziell, stop-on-error)"
```

---

## Task 6: Executable-Types-Registry + System-Prompt

**Files:**
- Create: `src/lib/task-executor/registry.ts`
- Test: `src/lib/task-executor/registry.test.ts`

**Interfaces:**
- Consumes: `TaskRow` from `./types`.
- Produces:
  - `EXECUTABLE_TYPES: Record<string, { label: string; promptHint: string }>` — Keys = erlaubte `tasks.typ` (v1: `sa_ausstehend`, `allgemein`, `erster-kontakt`, `sla_breach`).
  - `executableTypeFor(task: TaskRow): { label: string; promptHint: string } | null` — null wenn `typ` nicht in der Liste ODER `claim_id` fehlt ODER `status === 'erledigt'`.
  - `EXECUTOR_SYSTEM: string` — Basis-System-Prompt.
  - `buildExecutorSystem(task: TaskRow): string` — Basis + typ-Hint.

- [ ] **Step 1: Failing test**

```typescript
// src/lib/task-executor/registry.test.ts
import { describe, it, expect } from 'vitest'
import { executableTypeFor, buildExecutorSystem } from './registry'
import type { TaskRow } from './types'

const base: TaskRow = { id: 't', typ: 'sa_ausstehend', titel: 'SA', beschreibung: null, status: 'offen', claim_id: 'c1', fall_id: 'f1', empfaenger_rolle: null }

describe('executableTypeFor', () => {
  it('matcht erlaubten typ mit claim_id', () => {
    expect(executableTypeFor(base)?.label).toBeTruthy()
  })
  it('null ohne claim_id', () => {
    expect(executableTypeFor({ ...base, claim_id: null })).toBeNull()
  })
  it('null bei erledigt', () => {
    expect(executableTypeFor({ ...base, status: 'erledigt' })).toBeNull()
  })
  it('null bei nicht-executable typ (reliability)', () => {
    expect(executableTypeFor({ ...base, typ: 'reliability' })).toBeNull()
  })
  it('null bei typ=null', () => {
    expect(executableTypeFor({ ...base, typ: null })).toBeNull()
  })
})

describe('buildExecutorSystem', () => {
  it('enthaelt Basis + typ-Hint', () => {
    const s = buildExecutorSystem(base)
    expect(s).toContain('Schaden-Ops')
    expect(s.length).toBeGreaterThan(base.titel.length)
  })
})
```

- [ ] **Step 2: Test — FAIL.** Run: `npx vitest run src/lib/task-executor/registry.test.ts`

- [ ] **Step 3: `registry.ts` schreiben**

```typescript
// src/lib/task-executor/registry.ts
import type { TaskRow } from './types'

/** Erlaubte tasks.typ (v1). Button erscheint nur hier + wenn claim_id gesetzt + nicht erledigt.
 *  promptHint = was dieser Typ meist braucht. P2 ergaenzt dokument-pruefen (lese_dokument). */
export const EXECUTABLE_TYPES: Record<string, { label: string; promptHint: string }> = {
  sa_ausstehend: {
    label: 'SA ausstehend',
    promptHint:
      'Die Schadensanzeige ist noch nicht unterschrieben. Erinnere den Kunden freundlich per Template (sende_kommunikation) und halte das Ergebnis fest. Schliesse den Task, wenn die Erinnerung raus ist.',
  },
  allgemein: {
    label: 'Allgemein',
    promptHint:
      'Freeform-Aufgabe (oft ein Orchestrator-Vorschlag). Lies Titel + Beschreibung + Kontext und fuehre den naechsten sinnvollen Schritt aus. Wenn nur eine Analyse noetig ist, schreibe eine interne Notiz und schliesse den Task.',
  },
  'erster-kontakt': {
    label: 'Erster Kontakt',
    promptHint:
      'Erstkontakt mit dem Kunden herstellen. Wenn ein passendes Template existiert, sende es (sende_kommunikation); sonst halte den Versuch als Notiz fest.',
  },
  sla_breach: {
    label: 'SLA-Verletzung',
    promptHint:
      'Eine Frist wurde ueberschritten. Beurteile aus dem Kontext, ob eine konkrete Aktion moeglich ist (Erinnerung senden, Status setzen) — sonst dokumentiere den Stand als interne Notiz. Eskaliere nicht blind.',
  },
}

export function executableTypeFor(task: TaskRow) {
  if (!task.typ) return null
  if (!task.claim_id) return null
  if (task.status === 'erledigt') return null
  return EXECUTABLE_TYPES[task.typ] ?? null
}

export const EXECUTOR_SYSTEM = `Du bist ein erfahrener Schaden-Ops-Manager bei einem deutschen KFZ-Gutachter-Dienst.
Dir wird EINE offene Aufgabe (Task) zu einem Fall gezeigt. Erledige sie so weit wie moeglich mit den Tools.
Nutze nur Tools, die wirklich noetig sind — im Zweifel weniger. Konsequente Aktionen (Kommunikation an Kunde,
Statuswechsel) werden einem Menschen zur Bestaetigung vorgelegt, also schlage sie nur bei klarer Notwendigkeit vor.
Wenn die Aufgabe erledigt werden kann, rufe zuletzt task_schliessen mit einem knappen Ergebnis. Wenn du keine
sinnvolle Aktion siehst, rufe KEIN Tool. Begruende jede Aktion knapp und faktenbasiert aus dem Kontext.`

export function buildExecutorSystem(task: TaskRow): string {
  const entry = task.typ ? EXECUTABLE_TYPES[task.typ] : null
  const hint = entry ? `\n\nAufgabentyp „${entry.label}“: ${entry.promptHint}` : ''
  return EXECUTOR_SYSTEM + hint
}
```

- [ ] **Step 4: Test — PASS.** Run: `npx vitest run src/lib/task-executor/registry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-executor/registry.ts src/lib/task-executor/registry.test.ts
git commit -m "feat(ki-task-executor): executable-types-registry (v1 allow-list) + system-prompt"
```

---

## Task 7: `AI_MODELS.task_executor` + Kill-Switch

**Files:**
- Modify: `src/lib/ai/models.ts` (Objekt `AI_MODELS` um einen Key ergänzen)
- Create: `src/lib/task-executor/policy.ts`
- Test: `src/lib/task-executor/policy.test.ts`

**Interfaces:**
- Produces: `AI_MODELS.task_executor` (String `'claude-sonnet-4-6'`); `isExecutorEnabled(): boolean` (ENV `TASK_EXECUTOR_ENABLED === 'true'`).

- [ ] **Step 1: `AI_MODELS.task_executor` ergänzen**

In `src/lib/ai/models.ts` im `AI_MODELS`-Objekt (nach `ki_aufsicht`) hinzufügen:

```typescript
  task_executor: 'claude-sonnet-4-6',
```

- [ ] **Step 2: Failing test für Kill-Switch**

```typescript
// src/lib/task-executor/policy.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { isExecutorEnabled } from './policy'

afterEach(() => { delete process.env.TASK_EXECUTOR_ENABLED })

describe('isExecutorEnabled', () => {
  it('false ohne ENV', () => { expect(isExecutorEnabled()).toBe(false) })
  it('true bei TASK_EXECUTOR_ENABLED=true', () => {
    process.env.TASK_EXECUTOR_ENABLED = 'true'
    expect(isExecutorEnabled()).toBe(true)
  })
  it('false bei anderem Wert', () => {
    process.env.TASK_EXECUTOR_ENABLED = '1'
    expect(isExecutorEnabled()).toBe(false)
  })
})
```

- [ ] **Step 3: Test — FAIL.** Run: `npx vitest run src/lib/task-executor/policy.test.ts`

- [ ] **Step 4: `policy.ts` schreiben**

```typescript
// src/lib/task-executor/policy.ts
// Global-Kill-Switch fuer den KI-Task-Executor. Safe-by-default (aus).
export function isExecutorEnabled(): boolean {
  return process.env.TASK_EXECUTOR_ENABLED === 'true'
}
```

- [ ] **Step 5: Test — PASS + tsc.** Run: `npx vitest run src/lib/task-executor/policy.test.ts && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/models.ts src/lib/task-executor/policy.ts src/lib/task-executor/policy.test.ts
git commit -m "feat(ki-task-executor): AI_MODELS.task_executor + kill-switch policy"
```

---

## Task 8: `planTaskExecution` (LLM-Wiring)

**Files:**
- Create: `src/lib/task-executor/run.ts`
- Test: `src/lib/task-executor/run.test.ts`

**Interfaces:**
- Consumes: `callForProposals` from `@/lib/claim-ai/engine/call`; `buildClaimContext`, `summarizeClaimForPrompt` from `@/lib/orchestrator/context`; `toolsFrom` from `@/lib/claim-ai/engine/verbs`; `EXECUTOR_VERBS` from `./verbs`; `extractActions`, `buildPlan` from `./plan`; `buildExecutorSystem` from `./registry`; `AI_MODELS` from `@/lib/ai/models`; `TaskRow`, `ExecutionPlan` from `./types`.
- Produces: `planTaskExecution(task: TaskRow): Promise<ExecutionPlan>` — baut Claim-Kontext, ruft `callForProposals` (Single-Turn, volles Belt), extrahiert + `buildPlan`. Wirft nie (LLM-Fehler → leerer Plan via `callForProposals` → `[]`).

- [ ] **Step 1: Failing test** (mockt Engine + Context)

```typescript
// src/lib/task-executor/run.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/claim-ai/engine/call', () => ({
  callForProposals: vi.fn(async (input) =>
    input.extract([
      { type: 'tool_use', id: 'a', name: 'sende_kommunikation', input: { trigger: 'dokumente_nachreichen', variablen: {}, begruendung: 'Doks fehlen' } },
      { type: 'tool_use', id: 'b', name: 'task_schliessen', input: { ergebnis: 'Erinnerung raus' } },
    ]),
  ),
}))
vi.mock('@/lib/orchestrator/context', () => ({
  buildClaimContext: vi.fn().mockResolvedValue({ claimId: 'c1', fallId: 'f1', status: 'ersterfassung', phase: 'ersterfassung', letzteAktivitaetAm: null, tageInaktiv: 5, fahrzeug: null, offeneTasks: [], kurzverlauf: [], bereitsVorgeschlagen: [] }),
  summarizeClaimForPrompt: vi.fn().mockReturnValue('KONTEXT'),
}))

import { planTaskExecution } from './run'
import { callForProposals } from '@/lib/claim-ai/engine/call'
import type { TaskRow } from './types'

const task: TaskRow = { id: 't1', typ: 'sa_ausstehend', titel: 'SA ausstehend', beschreibung: 'seit 5 Tagen', status: 'offen', claim_id: 'c1', fall_id: 'f1', empfaenger_rolle: null }

describe('planTaskExecution', () => {
  it('baut aus LLM-tool_use einen consequential-Plan mit schliessen zuletzt', async () => {
    const plan = await planTaskExecution(task)
    expect(plan.hatConsequential).toBe(true)
    expect(plan.steps.map((s) => s.verb)).toEqual(['sende_kommunikation', 'task_schliessen'])
    // ruft die Engine mit dem vollen Belt (4 tools) + task_executor-Endpoint
    const arg = (callForProposals as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.logEndpoint).toBe('task_executor')
    expect(arg.tools).toHaveLength(4)
    expect(arg.userContent).toContain('KONTEXT')
  })
})
```

- [ ] **Step 2: Test — FAIL.** Run: `npx vitest run src/lib/task-executor/run.test.ts`

- [ ] **Step 3: `run.ts` schreiben**

```typescript
// src/lib/task-executor/run.ts
import { callForProposals } from '@/lib/claim-ai/engine/call'
import { buildClaimContext, summarizeClaimForPrompt } from '@/lib/orchestrator/context'
import { toolsFrom } from '@/lib/claim-ai/engine/verbs'
import { AI_MODELS } from '@/lib/ai/models'
import { EXECUTOR_VERBS } from './verbs'
import { extractActions, buildPlan } from './plan'
import { buildExecutorSystem } from './registry'
import type { TaskRow, ExecutionPlan } from './types'

/**
 * Plant die KI-Ausfuehrung einer Aufgabe: baut Claim-Kontext + ruft Claude
 * (Single-Turn, volles Executor-Belt) + extrahiert Aktionen. Wirft nie
 * (callForProposals faengt Fehler → []); leerer Plan ist ein gueltiges Ergebnis.
 */
export async function planTaskExecution(task: TaskRow): Promise<ExecutionPlan> {
  const claimId = task.claim_id
  const ctx = claimId ? await buildClaimContext(claimId) : null
  const kontext = ctx ? summarizeClaimForPrompt(ctx) : 'Kein Claim-Kontext verfuegbar.'
  const userContent = `${kontext}\n\nOFFENE AUFGABE:\nTitel: ${task.titel}\nBeschreibung: ${task.beschreibung ?? '(keine)'}\nTyp: ${task.typ ?? '(unbekannt)'}`

  const drafts = await callForProposals({
    model: AI_MODELS.task_executor,
    system: buildExecutorSystem(task),
    tools: toolsFrom(EXECUTOR_VERBS),
    userContent,
    maxTokens: 1024,
    logEndpoint: 'task_executor',
    logFallId: task.fall_id ?? null,
    extract: extractActions,
  })

  return buildPlan(drafts)
}
```

- [ ] **Step 4: Test — PASS.** Run: `npx vitest run src/lib/task-executor/run.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-executor/run.ts src/lib/task-executor/run.test.ts
git commit -m "feat(ki-task-executor): planTaskExecution (engine-wiring, single-turn, volles belt)"
```

---

## Task 9: Audit-Persistenz (`ai_task_executions`)

**Files:**
- Create: `src/lib/task-executor/audit.ts`
- Test: `src/lib/task-executor/audit.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient`; `ExecutionPlan`, `PlanStep` from `./types`.
- Produces (alle nehmen den Admin-Client als Arg, kein throw → geben Fehler zurück):
  - `insertExecution(db, { taskId, claimId, typ, plan, modell, userId }): Promise<{ id: string } | null>` (status='geplant').
  - `markExecution(db, id, patch: { status; steps?; bestaetigtVon?; fehler? }): Promise<void>` (setzt `abgeschlossen_am` bei Endzustand).
  - `getOffeneExecution(db, taskId): Promise<{ id: string; status: string; plan: PlanStep[] } | null>`.
  - `getExecution(db, id): Promise<{ id: string; task_id: string; claim_id: string | null; status: string; plan: PlanStep[] } | null>`.

- [ ] **Step 1: Failing test** (mock Supabase-Query-Builder minimal)

```typescript
// src/lib/task-executor/audit.test.ts
import { describe, it, expect, vi } from 'vitest'
import { insertExecution } from './audit'
import type { ExecutionPlan } from './types'

function mockDb(returns: unknown) {
  const single = vi.fn().mockResolvedValue({ data: returns, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  return { from: vi.fn().mockReturnValue({ insert }) , _insert: insert }
}

const plan: ExecutionPlan = { steps: [{ verb: 'interne_notiz', args: { text: 'x' }, risk: 'safe' }], begruendung: 'b', hatConsequential: false }

describe('insertExecution', () => {
  it('inserted mit status=geplant + plan.steps + gibt id', async () => {
    const db = mockDb({ id: 'e1' })
    const r = await insertExecution(db as never, { taskId: 't1', claimId: 'c1', typ: 'sa_ausstehend', plan, modell: 'm', userId: 'u1' })
    expect(r?.id).toBe('e1')
    const payload = db._insert.mock.calls[0][0]
    expect(payload).toMatchObject({ task_id: 't1', claim_id: 'c1', status: 'geplant', modell: 'm', gestartet_von: 'u1' })
    expect(payload.plan).toEqual(plan.steps)
  })
})
```

- [ ] **Step 2: Test — FAIL.** Run: `npx vitest run src/lib/task-executor/audit.test.ts`

- [ ] **Step 3: `audit.ts` schreiben**

```typescript
// src/lib/task-executor/audit.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionPlan, PlanStep } from './types'

const ENDZUSTAENDE = new Set(['ausgefuehrt', 'abgebrochen', 'fehler'])

export async function insertExecution(
  db: SupabaseClient,
  args: { taskId: string; claimId: string | null; typ: string | null; plan: ExecutionPlan; modell: string; userId: string },
): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from('ai_task_executions')
    .insert({
      task_id: args.taskId,
      claim_id: args.claimId,
      typ: args.typ,
      status: 'geplant',
      plan: args.plan.steps,
      begruendung: args.plan.begruendung,
      modell: args.modell,
      gestartet_von: args.userId,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[task-executor] insertExecution failed:', error?.message)
    return null
  }
  return { id: (data as { id: string }).id }
}

export async function markExecution(
  db: SupabaseClient,
  id: string,
  patch: { status: string; steps?: PlanStep[]; bestaetigtVon?: string; fehler?: string },
): Promise<void> {
  const update: Record<string, unknown> = { status: patch.status }
  if (patch.steps) update.plan = patch.steps
  if (patch.bestaetigtVon) update.bestaetigt_von = patch.bestaetigtVon
  if (patch.fehler !== undefined) update.fehler = patch.fehler
  if (ENDZUSTAENDE.has(patch.status)) update.abgeschlossen_am = new Date().toISOString()
  const { error } = await db.from('ai_task_executions').update(update).eq('id', id)
  if (error) console.error('[task-executor] markExecution failed:', error.message)
}

export async function getOffeneExecution(
  db: SupabaseClient,
  taskId: string,
): Promise<{ id: string; status: string; plan: PlanStep[] } | null> {
  const { data } = await db
    .from('ai_task_executions')
    .select('id, status, plan')
    .eq('task_id', taskId)
    .in('status', ['geplant', 'warte_bestaetigung'])
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; status: string; plan: PlanStep[] }
  return { id: row.id, status: row.status, plan: row.plan ?? [] }
}

export async function getExecution(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; task_id: string; claim_id: string | null; status: string; plan: PlanStep[] } | null> {
  const { data } = await db
    .from('ai_task_executions')
    .select('id, task_id, claim_id, status, plan')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; task_id: string; claim_id: string | null; status: string; plan: PlanStep[] }
  return { ...row, plan: row.plan ?? [] }
}
```

- [ ] **Step 4: Test — PASS.** Run: `npx vitest run src/lib/task-executor/audit.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-executor/audit.ts src/lib/task-executor/audit.test.ts
git commit -m "feat(ki-task-executor): audit-persistenz (insert/mark/get ai_task_executions)"
```

---

## Task 10: Server-Actions (`starte`/`bestaetige`/`brichAb`)

**Files:**
- Create: `src/app/admin/tasks/ki-actions.ts` (`'use server'`)
- Test: `src/app/admin/tasks/ki-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole` from `@/lib/auth/guards`; `createClient` from `@/lib/supabase/server`; `createAdminClient` from `@/lib/supabase/admin`; `isExecutorEnabled` from `@/lib/task-executor/policy`; `executableTypeFor` from `@/lib/task-executor/registry`; `planTaskExecution` from `@/lib/task-executor/run`; `applyPlan` from `@/lib/task-executor/apply-plan`; `insertExecution`/`markExecution`/`getExecution`/`getOffeneExecution` from `@/lib/task-executor/audit`; `AI_MODELS`; `TaskRow`, `PlanStep`, `ExecutionPlan`, `ExecCtx` from `@/lib/task-executor/types`; `revalidatePath`.
- Produces (Result-Shape `{ ok, ... }`):
  - `starteKiAusfuehrung(taskId: string): Promise<{ ok: boolean; error?: string; execution?: { id: string; status: string; plan: PlanStep[]; begruendung: string } }>`
  - `bestaetigeKiAusfuehrung(execId: string): Promise<{ ok: boolean; error?: string }>`
  - `brichAbKiAusfuehrung(execId: string): Promise<{ ok: boolean; error?: string }>`

**Interne Hilfsfunktion (nicht exportiert — kein Export aus 'use server' ausser async Actions):** `ladeTaskRow(userScoped, taskId)`, `baueExecCtx(adminDb, task, userId)`, `wendeAnUndProtokolliere(...)`.

- [ ] **Step 1: Failing test** (mockt alle Deps; testet Guards + Verzweigung safe/consequential)

```typescript
// src/app/admin/tasks/ki-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/guards', () => ({ requireRole: vi.fn().mockResolvedValue({ success: true, user: { id: 'u1' }, supabase: userScopedDb }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => userScopedDb) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminDb) }))
vi.mock('@/lib/task-executor/policy', () => ({ isExecutorEnabled: vi.fn(() => true) }))
vi.mock('@/lib/task-executor/run', () => ({ planTaskExecution: vi.fn() }))
vi.mock('@/lib/task-executor/apply-plan', () => ({ applyPlan: vi.fn() }))
vi.mock('@/lib/task-executor/audit', () => ({
  insertExecution: vi.fn().mockResolvedValue({ id: 'e1' }),
  markExecution: vi.fn().mockResolvedValue(undefined),
  getOffeneExecution: vi.fn().mockResolvedValue(null),
  getExecution: vi.fn(),
}))

// Minimaler user-scoped Task-Loader: .from('tasks').select().eq().maybeSingle()
const TASK = { id: 't1', typ: 'sa_ausstehend', titel: 'SA', beschreibung: null, status: 'offen', claim_id: 'c1', fall_id: 'f1', empfaenger_rolle: null }
const userScopedDb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: TASK, error: null }) }) }) })) }
const adminDb = {}

import { starteKiAusfuehrung } from './ki-actions'
import { planTaskExecution } from '@/lib/task-executor/run'
import { applyPlan } from '@/lib/task-executor/apply-plan'
import { markExecution } from '@/lib/task-executor/audit'

beforeEach(() => vi.clearAllMocks())

describe('starteKiAusfuehrung', () => {
  it('safe-Plan → sofort ausgefuehrt', async () => {
    ;(planTaskExecution as ReturnType<typeof vi.fn>).mockResolvedValue({ steps: [{ verb: 'interne_notiz', args: {}, risk: 'safe' }], begruendung: 'b', hatConsequential: false })
    ;(applyPlan as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ausgefuehrt', steps: [] })
    const r = await starteKiAusfuehrung('t1')
    expect(r.ok).toBe(true)
    expect(r.execution?.status).toBe('ausgefuehrt')
    expect(applyPlan).toHaveBeenCalled()
  })
  it('consequential-Plan → warte_bestaetigung, kein applyPlan', async () => {
    ;(planTaskExecution as ReturnType<typeof vi.fn>).mockResolvedValue({ steps: [{ verb: 'sende_kommunikation', args: {}, risk: 'consequential' }], begruendung: 'b', hatConsequential: true })
    const r = await starteKiAusfuehrung('t1')
    expect(r.ok).toBe(true)
    expect(r.execution?.status).toBe('warte_bestaetigung')
    expect(applyPlan).not.toHaveBeenCalled()
  })
  it('leerer Plan → ok:false, kein Insert', async () => {
    ;(planTaskExecution as ReturnType<typeof vi.fn>).mockResolvedValue({ steps: [], begruendung: '', hatConsequential: false })
    const r = await starteKiAusfuehrung('t1')
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Test — FAIL.** Run: `npx vitest run src/app/admin/tasks/ki-actions.test.ts`

- [ ] **Step 3: `ki-actions.ts` schreiben**

```typescript
// src/app/admin/tasks/ki-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'
import { isExecutorEnabled } from '@/lib/task-executor/policy'
import { executableTypeFor } from '@/lib/task-executor/registry'
import { planTaskExecution } from '@/lib/task-executor/run'
import { applyPlan } from '@/lib/task-executor/apply-plan'
import { insertExecution, markExecution, getOffeneExecution, getExecution } from '@/lib/task-executor/audit'
import type { TaskRow, PlanStep, ExecCtx, ExecutionPlan } from '@/lib/task-executor/types'

const TASK_COLS = 'id, typ, titel, beschreibung, status, claim_id, fall_id, empfaenger_rolle'

function revalidateTasks() {
  revalidatePath('/admin/tasks')
  revalidatePath('/admin/aufgaben/alle')
  revalidatePath('/admin/meine-tasks')
  revalidatePath('/mitarbeiter/tasks')
}

export async function starteKiAusfuehrung(taskId: string): Promise<{
  ok: boolean
  error?: string
  execution?: { id: string; status: string; plan: PlanStep[]; begruendung: string }
}> {
  if (!isExecutorEnabled()) return { ok: false, error: 'KI-Ausfuehrung ist deaktiviert.' }

  const guard = await requireRole(['admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }
  const userId = guard.user.id

  // RLS-scoped laden: schlaegt der User keinen Zugriff hat → kein Task.
  const userDb = await createClient()
  const { data: taskData } = await userDb.from('tasks').select(TASK_COLS).eq('id', taskId).maybeSingle()
  const task = taskData as TaskRow | null
  if (!task) return { ok: false, error: 'Aufgabe nicht gefunden oder kein Zugriff.' }
  if (!executableTypeFor(task)) return { ok: false, error: 'Diese Aufgabe ist nicht KI-ausfuehrbar.' }

  const adminDb = createAdminClient()

  // Idempotenz: existierende offene Ausfuehrung → die zurueckgeben statt neu planen.
  const offen = await getOffeneExecution(adminDb, taskId)
  if (offen) {
    return { ok: true, execution: { id: offen.id, status: offen.status, plan: offen.plan, begruendung: '' } }
  }

  let plan: ExecutionPlan
  try {
    plan = await planTaskExecution(task)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Planung fehlgeschlagen.' }
  }
  if (plan.steps.length === 0) return { ok: false, error: 'Die KI sieht keine ausfuehrbare Aktion — bitte manuell.' }

  const inserted = await insertExecution(adminDb, {
    taskId, claimId: task.claim_id, typ: task.typ, plan, modell: AI_MODELS.task_executor, userId,
  })
  if (!inserted) return { ok: false, error: 'Konnte Ausfuehrung nicht anlegen (evtl. laeuft bereits eine).' }

  if (plan.hatConsequential) {
    await markExecution(adminDb, inserted.id, { status: 'warte_bestaetigung' })
    revalidateTasks()
    return { ok: true, execution: { id: inserted.id, status: 'warte_bestaetigung', plan: plan.steps, begruendung: plan.begruendung } }
  }

  const ctx: ExecCtx = { db: adminDb, task, claimId: task.claim_id as string, fallId: task.fall_id, userId }
  const applied = await applyPlan(plan, ctx)
  await markExecution(adminDb, inserted.id, { status: applied.status, steps: applied.steps, fehler: applied.fehler })
  revalidateTasks()
  if (applied.status !== 'ausgefuehrt') return { ok: false, error: applied.fehler ?? 'Ausfuehrung fehlgeschlagen.' }
  return { ok: true, execution: { id: inserted.id, status: 'ausgefuehrt', plan: applied.steps, begruendung: plan.begruendung } }
}

export async function bestaetigeKiAusfuehrung(execId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isExecutorEnabled()) return { ok: false, error: 'KI-Ausfuehrung ist deaktiviert.' }
  const guard = await requireRole(['admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }
  const userId = guard.user.id

  const adminDb = createAdminClient()
  const exec = await getExecution(adminDb, execId)
  if (!exec) return { ok: false, error: 'Ausfuehrung nicht gefunden.' }
  if (exec.status !== 'warte_bestaetigung') return { ok: false, error: 'Ausfuehrung ist nicht (mehr) bestaetigbar.' }

  // RLS-Zugriff des Users auf den Task pruefen.
  const userDb = await createClient()
  const { data: taskData } = await userDb.from('tasks').select(TASK_COLS).eq('id', exec.task_id).maybeSingle()
  const task = taskData as TaskRow | null
  if (!task) return { ok: false, error: 'Kein Zugriff auf die Aufgabe.' }

  const ctx: ExecCtx = { db: adminDb, task, claimId: task.claim_id as string, fallId: task.fall_id, userId }
  const applied = await applyPlan({ steps: exec.plan, begruendung: '', hatConsequential: true }, ctx)
  await markExecution(adminDb, execId, { status: applied.status, steps: applied.steps, bestaetigtVon: userId, fehler: applied.fehler })
  revalidateTasks()
  if (applied.status !== 'ausgefuehrt') return { ok: false, error: applied.fehler ?? 'Ausfuehrung fehlgeschlagen.' }
  return { ok: true }
}

export async function brichAbKiAusfuehrung(execId: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }
  const adminDb = createAdminClient()
  const exec = await getExecution(adminDb, execId)
  if (!exec) return { ok: false, error: 'Ausfuehrung nicht gefunden.' }
  if (exec.status !== 'warte_bestaetigung') return { ok: false, error: 'Nur wartende Ausfuehrungen koennen abgebrochen werden.' }
  await markExecution(adminDb, execId, { status: 'abgebrochen' })
  revalidateTasks()
  return { ok: true }
}
```

- [ ] **Step 4: Test — PASS.** Run: `npx vitest run src/app/admin/tasks/ki-actions.test.ts`

- [ ] **Step 5: Voller Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler in `src/lib/task-executor/**` oder `src/app/admin/tasks/ki-actions.ts`. (Bei Supabase-Client-Generics-Mismatch an `logFallEvent`/`updateTaskStatusCore`: `ctx.db as never` bzw. dokumentierten Cast nutzen — siehe apply.ts.)

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/tasks/ki-actions.ts src/app/admin/tasks/ki-actions.test.ts
git commit -m "feat(ki-task-executor): server-actions starte/bestaetige/brichAb (guard+rls+idempotenz+gating)"
```

---

## Task 11: End-to-End-Smoke-Skript (kein UI)

**Files:**
- Create: `scripts/smoke/ki-task-executor-smoke.mjs` (Node-Skript, gitignored-fähig unter scripts/smoke)

**Interfaces:**
- Consumes: nichts aus der App (fährt gegen Prod-DB read-only + ruft NICHT wirklich Anthropic/Send). Zweck: verifizieren, dass die v1-Allow-List Typen echte offene Tasks trifft und dass `executableTypeFor` auf realen Rows greift.

- [ ] **Step 1: Skript schreiben** (READ-only Diagnose gegen echte Task-Rows)

```javascript
// scripts/smoke/ki-task-executor-smoke.mjs
// READ-only Smoke: zeigt, wie viele offene Tasks je v1-executable typ mit claim_id existieren.
// Kein Send, kein LLM. Nutzt Service-Role gegen Prod (nur SELECT).
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt'); process.exit(1) }
const db = createClient(url, key)

const V1 = ['sa_ausstehend', 'allgemein', 'erster-kontakt', 'sla_breach']
const { data, error } = await db
  .from('tasks')
  .select('id, typ, titel, claim_id, status')
  .in('typ', V1)
  .in('status', ['offen', 'in-bearbeitung'])
if (error) { console.error(error.message); process.exit(1) }

const perTyp = {}
for (const t of data) {
  const ok = !!t.claim_id
  perTyp[t.typ] ??= { total: 0, executable: 0 }
  perTyp[t.typ].total++
  if (ok) perTyp[t.typ].executable++
}
console.log('Offene v1-Tasks (executable = mit claim_id):')
console.table(perTyp)
console.log(`\nBeispiel-Task-IDs (executable):`)
console.log(data.filter((t) => t.claim_id).slice(0, 5).map((t) => `${t.typ}: ${t.id} — ${t.titel}`).join('\n'))
```

- [ ] **Step 2: Skript ausführen**

Run (im Worktree, ENV geladen): `node scripts/smoke/ki-task-executor-smoke.mjs`
Expected: Tabelle mit `sa_ausstehend`/`allgemein`/… und `executable > 0` für mindestens einen Typ + ein paar Beispiel-IDs. (Belegt: die Allow-List trifft reale Tasks.)

- [ ] **Step 3: Ergebnis notieren, NICHT committen** (Diagnose-Skript unter scripts/smoke bleibt lokal; falls committet: klar als Smoke markiert).

---

## Task 12: P0-Abschluss — voller Build + Test-Suite + Audit

- [ ] **Step 1: Gesamte Executor-Test-Suite**

Run: `npx vitest run src/lib/task-executor src/app/admin/tasks/ki-actions.test.ts`
Expected: alle grün.

- [ ] **Step 2: Voller Build** (Server-Actions berührt → Pflicht laut Audit-Regel)

Run: `npm run build`
Expected: grün (kein Next-15-Validator-Fehler).

- [ ] **Step 3: Ratchets** (neue Files dürfen keine neuen Verstöße bringen)

Run: `npm run check:knip -- --ratchet ; npm run check:token-audit`
Expected: keine NEUEN Verstöße (P0 hat kein UI/keine Farben; knip sieht neue Files als genutzt, da verkettet + getestet).

- [ ] **Step 4: Abschluss-Commit (falls offene Änderungen) + Push**

```bash
git status
git push -u origin kitta/ki-task-executor
```

---

## P1 & P2 — Folgepläne (nicht in diesem Plan)

**P1 (eigener Plan nach P0-Review):** Button `KiExecuteButton.tsx` (`primitives.Button` + `primitives.Modal`-Confirm) + Einbau in `KanbanBoard.tsx` (`page.tsx`-Query um `claim_id, empfaenger_rolle` erweitern, `Task`-Typ ergänzen) + Playwright-Smoke (Kanban → Button → `sa_ausstehend` → Confirm → Send-Mock → Erledigt + Audit-Row). Sichtbarkeit via `executableTypeFor(task)`.

**P2 (eigener Plan):** `lese_dokument`-Verb (Storage + `AI_MODELS.ocr`) → schaltet `dokument-pruefen` frei · `weise_sv_zu`-Verb · KB-Flächen (`MyTasksClient`, `mitarbeiter/tasks`) · Pro-Typ-Prompt-Hints verfeinern · optional Ausführungs-Graduierung (P3).

## Selbst-Review (Spec-Deckung)

- Hybrid nach Risiko → `Risk` je Verb + Plan-Level-Gating in `starteKiAusfuehrung` ✔
- General-Executor volles Belt → `planTaskExecution` gibt `toolsFrom(EXECUTOR_VERBS)` (alle) ✔
- Executable-Types-Allow-List gatet → `executableTypeFor` (Task 6) + Guard in Action (Task 10) ✔
- Engine-Reuse → `callForProposals`/`buildClaimContext`/`toolsFrom`/`validateVerb` konsumiert ✔
- Comms = Template-Select → `sende_kommunikation` mit `ERLAUBTE_COMM_TRIGGER`-Enum ✔
- ExecCtx aus Task-Row (claim_id+fall_id) → Task 10 baut `ctx` aus geladenem Task ✔
- Audit-Spine → `ai_task_executions` (Task 1) + `audit.ts` (Task 9) + `logFallEvent` in `interne_notiz` ✔
- Kill-Switch + Idempotenz + RLS-Guard → Task 7 + Partial-Unique-Index (Task 1) + `requireRole`+user-scoped-load (Task 10) ✔
- Kein throw aus Actions; apply-Wrapper fangen throw → Task 3 + Task 10 ✔
