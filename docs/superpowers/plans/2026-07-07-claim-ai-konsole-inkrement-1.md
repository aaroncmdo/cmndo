# Claim-AI-Konsole — Inkrement 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein interaktiver Admin-Copilot in der Claim-View (`/faelle/[id]`), der per Tool-Use freigabepflichtige Aktions-Vorschläge erzeugt; Admin gibt frei → Hybrid-Executor (task/auto/draft); Konversation + Aktionen persistent + rollen-lesbar.

**Architecture:** Konvergiert auf den bestehenden Orchestrator-Spine `ai_claim_proposals` (additiv erweitert), importiert dessen Executor (`buildTaskFromProposal`/`decideProposal`), spiegelt dessen Tool-Use-Muster (`tools.ts`). Neuer Code liegt isoliert in `src/lib/claim-ai/*` + `src/app/api/admin/claim-copilot/` + `faelle/[id]/`. Konversation persistiert in der wiederbelebten `ki_gespraeche` (claim_id-keyed).

**Tech Stack:** Next.js 15 (App Router), Supabase (service_role Admin-Client), Anthropic SDK (`messages.stream` + Tool-Use), Zod, Vitest (env=node), React (Client-Component + Component-Set).

## Global Constraints

- **Migrationen NUR via Supabase-Plugin** `apply_migration` (AGENTS.md Regel 2): DDL → apply_migration → `list_migrations` Version `<V>` ablesen → File committen als `supabase/migrations/<V>_<name>.sql` → `execute_sql` (READ) verifizieren. Nie CLI/raw-DDL.
- **Nie auf `main` pushen** — Branch `kitta/claim-ai-konsole`, PR gegen `staging`.
- **NICHT anfassen:** `src/lib/orchestrator/*`, `src/app/admin/ai-vorschlaege/*` (nur importieren). Einziger geteilter Edit: `src/lib/ai/models.ts` (+1 Key, additive Zeile).
- **Server-Actions Result-Object** `{ ok: boolean; error?: string }`, kein `throw`; `revalidatePath` nach jeder Mutation. Non-critical Sub-Ops (Timeline, Sends) in `try/catch`.
- **Keine Konstanten/Types aus `'use server'`-Files exportieren** (Client-Bundle macht `undefined`). Verb-Registry ist KEIN `'use server'`.
- **Umlaute-Pflicht** in ALLEN UI-Strings (Buttons/Labels/Toasts): echte `ä/ö/ü/ß`.
- **Component-Set:** `shared/SectionCard`, `primitives.Button` (`variant=navy|ondo|ghost|bare|danger|success`, `onClick`, `loading`) — kein handgerolltes `<button className>`. **Status-Registry:** Badges aus `src/lib/status/` — keine inline Status-Farb-Maps. **Token-Audit:** keine bracket-/inline-Hex.
- **id-Dualität (KRITISCH):** `ai_claim_proposals.claim_id` = **Claim-ID**; `ki_gespraeche.claim_id` = **Claim-ID**; `tasks.fall_id` = **Claim-ID** (createLinkedTask); aber **`timeline.fall_id` = Fall-ID** (`logFallEvent`). Route-Param `/faelle/[id]` = **Fall-ID**. Claim-ID via `resolveClaimId(admin, fallId)`. Executor braucht BEIDE.
- **Service_role liest Basis-Tabellen**, nie `v_claim_*` (auth-gated → 0 Zeilen für Admin-Client).
- **DSGVO Art. 22:** Admin-Freigabe = menschliche Letztentscheidung. Outbound (`draft_message`) NIE auto-versendet — nur Entwurf, Senden = 2. Klick.

### Verifizierte Fakten (Signaturen/Schema — gegen Prod `paizkjajbuxxksdoycev` + Code geprüft 07.07.)

- `ai_claim_proposals` Spalten: `id, claim_id, erstellt_am, vorschlag_typ, ziel_rolle, payload jsonb, begruendung, modell, dedupe_key, status, entschieden_von, entschieden_am, feedback, auto_ausgefuehrt, erzeugte_task_id`. CHECKs: `status ∈ {offen,angenommen,verworfen,bearbeitet}`, `vorschlag_typ ∈ {task,escalation,next_step}`, `ziel_rolle ∈ {sachverstaendiger,kundenbetreuer,admin}`. RLS: nur `service_role`.
- `ki_gespraeche` Spalten: `id, rolle, user_id, nachrichten jsonb '[]', created_at, updated_at, claim_id`. CHECK `rolle ∈ {kunde,kundenbetreuer,makler}`. Kein Unique-Index auf (claim_id,rolle,user_id).
- `buildTaskFromProposal(payload: TaskProposalPayload, zielRolle: string|null, claimId: string, triggerEvent: string): Promise<{task_id: string|null}>` — `@/lib/orchestrator/task-from-proposal` (kein `'use server'`, import-safe).
- `decideProposal(id: string, status: 'angenommen'|'verworfen'|'bearbeitet', userId: string, feedback?: string): Promise<{ok: boolean; error?: string}>` — `@/lib/orchestrator/proposals`.
- `logFallEvent(db, { fallId: string, typ: TimelineTyp, titel: string, beschreibung?: string, actor?: string|null, metadata?: Record<string,unknown> }): Promise<void>` — `@/lib/fall/log-event`. `TimelineTyp` inkl. `'system'`.
- `sendFallCommunication(...)` — `@/lib/communications/send-fall.ts:15` (Signatur in Task 7 Schritt 0 lesen).
- `resolveClaimId(admin, fallId): Promise<string>` — `@/lib/claims/get-claim-for-role`.
- `AI_MODELS` — `@/lib/ai/models`; `logAiUsage({endpoint, model, fallId, usage:{input_tokens, output_tokens}})` — `@/lib/ai/usage-log`.
- Tool-Use-Vorbild: `ORCHESTRATOR_TOOLS`/`validateToolCall` in `src/lib/orchestrator/tools.ts`; `extractProposalsFromToolUse` in `run.ts`.
- Admin-Guard-Muster (spiegeln): lokal `requireAdminUserId()` → `profiles.rolle === 'admin' ? user.id : null`.

---

## Task 1: Additive Migration (Spine + ki_gespraeche erweitern)

**Files:**
- Create (via Plugin): `supabase/migrations/<V>_claim_ai_copilot_extend.sql`

**Interfaces:**
- Produces: Spalten `ai_claim_proposals.quelle` ('orchestrator'|'copilot', default 'orchestrator'), `ai_claim_proposals.ausfuehrung_ergebnis jsonb`; `vorschlag_typ` erlaubt zusätzlich `draft_message`,`add_note`; `ki_gespraeche.rolle` erlaubt zusätzlich `admin`.

- [ ] **Step 1: DDL via `apply_migration`** (Plugin, name `claim_ai_copilot_extend`, project `paizkjajbuxxksdoycev`)

```sql
alter table public.ai_claim_proposals
  add column if not exists quelle text not null default 'orchestrator',
  add column if not exists ausfuehrung_ergebnis jsonb;

alter table public.ai_claim_proposals drop constraint if exists ai_claim_proposals_quelle_check;
alter table public.ai_claim_proposals add constraint ai_claim_proposals_quelle_check
  check (quelle in ('orchestrator','copilot'));

alter table public.ai_claim_proposals drop constraint if exists ai_claim_proposals_vorschlag_typ_check;
alter table public.ai_claim_proposals add constraint ai_claim_proposals_vorschlag_typ_check
  check (vorschlag_typ in ('task','escalation','next_step','draft_message','add_note'));

alter table public.ki_gespraeche drop constraint if exists ki_gespraeche_rolle_check;
alter table public.ki_gespraeche add constraint ki_gespraeche_rolle_check
  check (rolle in ('kunde','kundenbetreuer','makler','admin'));
```

- [ ] **Step 2: Version ablesen** — `list_migrations` → höchste neue Version `<V>` notieren.
- [ ] **Step 3: File committen** als `supabase/migrations/<V>_claim_ai_copilot_extend.sql` (Inhalt == Step-1-DDL). Dateiname EXAKT == `<V>` (Twin-Drift-Regel).
- [ ] **Step 4: Verifizieren** (`execute_sql` READ):

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.ai_claim_proposals'::regclass and conname like '%vorschlag_typ%' or conname like '%quelle%';
```
Expected: `vorschlag_typ`-CHECK enthält `draft_message`,`add_note`; `quelle`-CHECK vorhanden.

- [ ] **Step 5: Commit** `git -C <worktree> add supabase/migrations/<V>_claim_ai_copilot_extend.sql && git commit -m "feat(claim-ai): additive Migration — quelle/ausfuehrung_ergebnis + Aktions-Verben + ki_gespraeche admin-Rolle"`

---

## Task 2: Verb-Registry `src/lib/claim-ai/verbs.ts`

**Files:**
- Create: `src/lib/claim-ai/verbs.ts`
- Test: `src/lib/claim-ai/verbs.test.ts`

**Interfaces:**
- Produces:
  - `type ClaimAiVorschlagTyp = 'task' | 'draft_message' | 'add_note'`
  - `type ClaimAiDraft = { vorschlagTyp: ClaimAiVorschlagTyp; zielRolle: 'sachverstaendiger'|'kundenbetreuer'|'admin'|null; payload: Record<string, unknown>; begruendung: string }`
  - `const CLAIM_AI_TOOLS: Anthropic.Tool[]`
  - `function validateClaimAiToolCall(name: string, input: unknown): { ok: true; draft: ClaimAiDraft } | { ok: false; error: string }`
  - `function extractClaimAiDrafts(content: Anthropic.ContentBlock[]): ClaimAiDraft[]`
  - `const VERB_KIND: Record<ClaimAiVorschlagTyp, 'task'|'auto'|'draft'>` = `{ task:'task', add_note:'auto', draft_message:'draft' }`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { validateClaimAiToolCall, extractClaimAiDrafts, VERB_KIND } from './verbs'

describe('validateClaimAiToolCall', () => {
  it('parst propose_task zu task-draft', () => {
    const r = validateClaimAiToolCall('propose_task', {
      ziel_rolle: 'kundenbetreuer', titel: 'Kunde anrufen', begruendung: 'seit 5 Tagen keine Antwort',
    })
    expect(r).toEqual({ ok: true, draft: { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', payload: { titel: 'Kunde anrufen' }, begruendung: 'seit 5 Tagen keine Antwort' } })
  })
  it('parst propose_draft_message zu draft_message-draft', () => {
    const r = validateClaimAiToolCall('propose_draft_message', {
      kanal: 'email', text: 'Sehr geehrte…', begruendung: 'Nachfrage Unterlagen',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft.vorschlagTyp).toBe('draft_message')
  })
  it('lehnt zu kurzen Titel ab', () => {
    const r = validateClaimAiToolCall('propose_task', { ziel_rolle: 'admin', titel: 'x', begruendung: 'y' })
    expect(r.ok).toBe(false)
  })
  it('lehnt unbekanntes Tool ab', () => {
    expect(validateClaimAiToolCall('foo', {}).ok).toBe(false)
  })
  it('extractClaimAiDrafts filtert text-Bloecke + invalide raus', () => {
    const drafts = extractClaimAiDrafts([
      { type: 'text', text: 'hallo' },
      { type: 'tool_use', id: '1', name: 'propose_add_note', input: { titel: 'Notiz', text: 'geprüft', begruendung: 'Doku vollständig' } },
      { type: 'tool_use', id: '2', name: 'propose_task', input: { ziel_rolle: 'admin' } }, // invalide
    ] as never)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].vorschlagTyp).toBe('add_note')
  })
  it('VERB_KIND mappt korrekt', () => {
    expect(VERB_KIND).toEqual({ task: 'task', add_note: 'auto', draft_message: 'draft' })
  })
})
```

- [ ] **Step 2: Run — verify FAIL** — `npx vitest run src/lib/claim-ai/verbs.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `src/lib/claim-ai/verbs.ts`**

```ts
// Verb-Registry der Claim-AI-Konsole. Spiegelt src/lib/orchestrator/tools.ts,
// aber fuer den interaktiven Copilot + Aktions-Verben. KEIN 'use server'.
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'

const ROLLEN = ['sachverstaendiger', 'kundenbetreuer', 'admin'] as const
const PRIOS = ['niedrig', 'normal', 'hoch'] as const
const KANAELE = ['email', 'sms', 'whatsapp'] as const

export type ClaimAiVorschlagTyp = 'task' | 'draft_message' | 'add_note'
export type ClaimAiDraft = {
  vorschlagTyp: ClaimAiVorschlagTyp
  zielRolle: (typeof ROLLEN)[number] | null
  payload: Record<string, unknown>
  begruendung: string
}

export const VERB_KIND: Record<ClaimAiVorschlagTyp, 'task' | 'auto' | 'draft'> = {
  task: 'task',
  add_note: 'auto',
  draft_message: 'draft',
}

const proposeTask = z.object({
  ziel_rolle: z.enum(ROLLEN),
  titel: z.string().min(3),
  beschreibung: z.string().optional(),
  prioritaet: z.enum(PRIOS).optional(),
  faellig_in_tagen: z.number().int().min(0).max(30).optional(),
  begruendung: z.string().min(3),
})
const proposeDraftMessage = z.object({
  kanal: z.enum(KANAELE),
  text: z.string().min(10),
  begruendung: z.string().min(3),
})
const proposeAddNote = z.object({
  titel: z.string().min(3),
  text: z.string().min(3),
  begruendung: z.string().min(3),
})

export const CLAIM_AI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_task',
    description: 'Schlage einen konkreten Task fuer eine interne Rolle vor (wird NICHT automatisch angelegt — Admin gibt frei).',
    input_schema: {
      type: 'object',
      properties: {
        ziel_rolle: { type: 'string', enum: [...ROLLEN] },
        titel: { type: 'string' },
        beschreibung: { type: 'string' },
        prioritaet: { type: 'string', enum: [...PRIOS] },
        faellig_in_tagen: { type: 'integer', minimum: 0, maximum: 30 },
        begruendung: { type: 'string' },
      },
      required: ['ziel_rolle', 'titel', 'begruendung'],
    },
  },
  {
    name: 'propose_draft_message',
    description: 'Entwirf eine Nachricht an den Kunden/Gegner (wird NICHT gesendet — Admin gibt frei, dann bewusster Sende-Klick).',
    input_schema: {
      type: 'object',
      properties: {
        kanal: { type: 'string', enum: [...KANAELE] },
        text: { type: 'string' },
        begruendung: { type: 'string' },
      },
      required: ['kanal', 'text', 'begruendung'],
    },
  },
  {
    name: 'propose_add_note',
    description: 'Schlage eine interne Timeline-Notiz vor (z.B. erkannter Widerspruch/Hinweis).',
    input_schema: {
      type: 'object',
      properties: {
        titel: { type: 'string' },
        text: { type: 'string' },
        begruendung: { type: 'string' },
      },
      required: ['titel', 'text', 'begruendung'],
    },
  },
]

export function validateClaimAiToolCall(
  name: string,
  input: unknown,
): { ok: true; draft: ClaimAiDraft } | { ok: false; error: string } {
  if (name === 'propose_task') {
    const p = proposeTask.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    const { ziel_rolle, begruendung, ...rest } = p.data
    return { ok: true, draft: { vorschlagTyp: 'task', zielRolle: ziel_rolle, payload: rest, begruendung } }
  }
  if (name === 'propose_draft_message') {
    const p = proposeDraftMessage.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    return { ok: true, draft: { vorschlagTyp: 'draft_message', zielRolle: null, payload: { kanal: p.data.kanal, text: p.data.text }, begruendung: p.data.begruendung } }
  }
  if (name === 'propose_add_note') {
    const p = proposeAddNote.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    return { ok: true, draft: { vorschlagTyp: 'add_note', zielRolle: null, payload: { titel: p.data.titel, text: p.data.text }, begruendung: p.data.begruendung } }
  }
  return { ok: false, error: `unbekanntes Tool: ${name}` }
}

export function extractClaimAiDrafts(content: Anthropic.ContentBlock[]): ClaimAiDraft[] {
  const out: ClaimAiDraft[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const r = validateClaimAiToolCall(block.name, block.input)
    if (r.ok) out.push(r.draft)
  }
  return out
}
```

- [ ] **Step 4: Run — verify PASS** — `npx vitest run src/lib/claim-ai/verbs.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(claim-ai): Verb-Registry (propose_task/draft_message/add_note) + Zod-Validierung"`

---

## Task 3: Proposals-Persistenz `src/lib/claim-ai/proposals.ts`

**Files:**
- Create: `src/lib/claim-ai/proposals.ts`
- Test: `src/lib/claim-ai/proposals.test.ts`

**Interfaces:**
- Consumes: `ClaimAiDraft` (Task 2), `createAdminClient` (`@/lib/supabase/admin`).
- Produces:
  - `type ClaimProposalRow = { id, claim_id, erstellt_am, vorschlag_typ, ziel_rolle, payload, begruendung, status, quelle, ausfuehrung_ergebnis, entschieden_am }`
  - `async function persistCopilotProposals(claimId: string, modell: string, drafts: ClaimAiDraft[]): Promise<string[]>` (gibt neue IDs zurück, `quelle='copilot'`)
  - `async function listClaimProposals(claimId: string): Promise<ClaimProposalRow[]>` (alle Status, für die Claim-View)

- [ ] **Step 1: Failing test** (Admin-Client gemockt)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertSpy = vi.fn()
const selects: Record<string, unknown> = {}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: unknown) => { insertSpy(row); return { select: () => ({ single: () => ({ data: { id: 'new-id' }, error: null }) }) } },
      select: () => ({ eq: () => ({ order: () => ({ data: selects.rows ?? [], error: null }) }) }),
    }),
  }),
}))

import { persistCopilotProposals } from './proposals'

beforeEach(() => insertSpy.mockClear())

it('persistiert draft mit quelle=copilot', async () => {
  const ids = await persistCopilotProposals('claim-1', 'claude-sonnet-4-6', [
    { vorschlagTyp: 'add_note', zielRolle: null, payload: { titel: 'X', text: 'Y' }, begruendung: 'z' },
  ])
  expect(ids).toEqual(['new-id'])
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
    claim_id: 'claim-1', vorschlag_typ: 'add_note', quelle: 'copilot', begruendung: 'z',
  }))
})
```

- [ ] **Step 2: Run — verify FAIL.**
- [ ] **Step 3: Implement**

```ts
// Copilot-Proposals in den geteilten Spine ai_claim_proposals (quelle='copilot').
import { createHash, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClaimAiDraft } from './verbs'

export type ClaimProposalRow = {
  id: string
  claim_id: string
  erstellt_am: string
  vorschlag_typ: string
  ziel_rolle: string | null
  payload: Record<string, unknown>
  begruendung: string
  status: 'offen' | 'angenommen' | 'verworfen' | 'bearbeitet'
  quelle: string
  ausfuehrung_ergebnis: Record<string, unknown> | null
  entschieden_am: string | null
}

// Interaktive Vorschlaege sind bewusst NICHT content-deduped (jeder Klick zaehlt) —
// randomUUID im Key umgeht den Partial-Unique-Index (dedupe_key WHERE status=offen).
function copilotDedupeKey(claimId: string, d: ClaimAiDraft): string {
  return createHash('sha256')
    .update(claimId + d.vorschlagTyp + JSON.stringify(d.payload) + randomUUID())
    .digest('hex')
    .slice(0, 32)
}

export async function persistCopilotProposals(
  claimId: string,
  modell: string,
  drafts: ClaimAiDraft[],
): Promise<string[]> {
  if (!drafts.length) return []
  const db = createAdminClient()
  const ids: string[] = []
  for (const d of drafts) {
    const { data, error } = await db
      .from('ai_claim_proposals')
      .insert({
        claim_id: claimId,
        vorschlag_typ: d.vorschlagTyp,
        ziel_rolle: d.zielRolle,
        payload: d.payload,
        begruendung: d.begruendung,
        modell,
        dedupe_key: copilotDedupeKey(claimId, d),
        quelle: 'copilot',
      })
      .select('id')
      .single()
    if (!error && data?.id) ids.push(data.id as string)
    else if (error) console.error('[claim-ai] persist proposal failed:', error.message)
  }
  return ids
}

export async function listClaimProposals(claimId: string): Promise<ClaimProposalRow[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('ai_claim_proposals')
    .select('id, claim_id, erstellt_am, vorschlag_typ, ziel_rolle, payload, begruendung, status, quelle, ausfuehrung_ergebnis, entschieden_am')
    .eq('claim_id', claimId)
    .order('erstellt_am', { ascending: false })
  return (data as ClaimProposalRow[] | null) ?? []
}
```

- [ ] **Step 4: Run — verify PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(claim-ai): persistCopilotProposals + listClaimProposals (quelle=copilot)"`

---

## Task 4: Thread-Persistenz `src/lib/claim-ai/threads.ts`

**Files:**
- Create: `src/lib/claim-ai/threads.ts`
- Test: `src/lib/claim-ai/threads.test.ts`

**Interfaces:**
- Produces:
  - `type ThreadMessage = { role: 'user'|'assistant'; content: string; ts: string }`
  - `async function loadThread(claimId: string, rolle: string, userId: string): Promise<ThreadMessage[]>`
  - `async function appendTurns(claimId: string, rolle: string, userId: string, neu: ThreadMessage[]): Promise<void>` (Read-modify-write auf `ki_gespraeche.nachrichten`; kein Unique-Index → select-then-update/insert)

- [ ] **Step 1: Failing test** (insert-Pfad wenn kein Row existiert)

```ts
import { describe, it, expect, vi } from 'vitest'
const insertSpy = vi.fn(); const updateSpy = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }) }) }),
      insert: (row: unknown) => { insertSpy(row); return { error: null } },
      update: (row: unknown) => { updateSpy(row); return { eq: () => ({ error: null }) } },
    }),
  }),
}))
import { appendTurns } from './threads'
it('inserted neuen Thread wenn keiner existiert', async () => {
  await appendTurns('claim-1', 'admin', 'user-1', [{ role: 'user', content: 'hi', ts: '2026-07-07T10:00:00Z' }])
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ claim_id: 'claim-1', rolle: 'admin', user_id: 'user-1' }))
  expect(updateSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run — verify FAIL.**
- [ ] **Step 3: Implement**

```ts
// Konversations-Persistenz in der wiederbelebten ki_gespraeche (claim_id-keyed).
// Kein Unique-Index auf (claim_id,rolle,user_id) -> Read-modify-write.
import { createAdminClient } from '@/lib/supabase/admin'

export type ThreadMessage = { role: 'user' | 'assistant'; content: string; ts: string }

export async function loadThread(claimId: string, rolle: string, userId: string): Promise<ThreadMessage[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('ki_gespraeche')
    .select('nachrichten')
    .eq('claim_id', claimId)
    .eq('rolle', rolle)
    .eq('user_id', userId)
    .maybeSingle()
  return ((data?.nachrichten as ThreadMessage[] | undefined) ?? [])
}

export async function appendTurns(
  claimId: string,
  rolle: string,
  userId: string,
  neu: ThreadMessage[],
): Promise<void> {
  const db = createAdminClient()
  const { data } = await db
    .from('ki_gespraeche')
    .select('id, nachrichten')
    .eq('claim_id', claimId)
    .eq('rolle', rolle)
    .eq('user_id', userId)
    .maybeSingle()
  const nachrichten = [...((data?.nachrichten as ThreadMessage[] | undefined) ?? []), ...neu]
  if (data?.id) {
    const { error } = await db.from('ki_gespraeche').update({ nachrichten, updated_at: new Date().toISOString() }).eq('id', data.id)
    if (error) console.error('[claim-ai] thread update failed:', error.message)
  } else {
    const { error } = await db.from('ki_gespraeche').insert({ claim_id: claimId, rolle, user_id: userId, nachrichten })
    if (error) console.error('[claim-ai] thread insert failed:', error.message)
  }
}
```

- [ ] **Step 4: Run — verify PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(claim-ai): ki_gespraeche-Thread-Persistenz (revive, claim-keyed, read-modify-write)"`

---

## Task 5: Context-Builder `src/lib/claim-ai/context.ts`

**Files:**
- Create: `src/lib/claim-ai/context.ts`
- Test: `src/lib/claim-ai/context.test.ts`
- Reference (nicht ändern): `src/app/faelle/[id]/ai-actions.ts` (der Loader, den wir spiegeln — lädt `v_faelle_mit_aktuellem_termin`, `leads`, `fall_dokumente`, `timeline`, `nachrichten`, `gutachter_termine`, `pflichtdokumente`, `tasks`)

**Interfaces:**
- Produces:
  - `type ClaimAiContext = { claimNummer, status, fahrzeug, unfallhergang, gegner, tageInaktiv, dokumente: string[], pflichtdokumente: {typ,status}[], termine: {start,status}[], letzteNachrichten: string[], letzteTimeline: string[], offeneTasks: string[] }`
  - `function summarizeClaimAiContext(ctx: ClaimAiContext): string` (Prompt-Text, pure)
  - `async function buildClaimAiContext(fallId: string): Promise<ClaimAiContext | null>` (Admin-Client, Basis-Tabellen)

- [ ] **Step 1: Failing test** (pure `summarizeClaimAiContext`)

```ts
import { describe, it, expect } from 'vitest'
import { summarizeClaimAiContext } from './context'
it('rendert die Kernfakten in den Prompt', () => {
  const s = summarizeClaimAiContext({
    claimNummer: 'CL-123', status: 'in_bearbeitung', fahrzeug: 'BMW 320d', unfallhergang: 'Auffahrunfall',
    gegner: 'HUK', tageInaktiv: 7, dokumente: ['gutachten.pdf'], pflichtdokumente: [{ typ: 'zb1', status: 'offen' }],
    termine: [], letzteNachrichten: ['Kunde: Wann kommt der Gutachter?'], letzteTimeline: ['SV zugewiesen'], offeneTasks: ['KVA prüfen'],
  })
  expect(s).toContain('CL-123'); expect(s).toContain('7 Tage'); expect(s).toContain('zb1'); expect(s).toContain('BMW 320d')
})
```

- [ ] **Step 2: Run — verify FAIL.**
- [ ] **Step 3: Implement** — `summarizeClaimAiContext` als deterministischer Markdown-Text (Muster wie `summarizeClaimForPrompt` in orchestrator/context.ts, aber reichhaltiger). `buildClaimAiContext(fallId)` spiegelt den `Promise.all`-Loader aus `ai-actions.ts` (Basis-Tabellen via `createAdminClient`), berechnet `tageInaktiv` aus jüngstem `timeline.created_at`, mappt in `ClaimAiContext`. (Vollständige Feldliste siehe Interfaces; Loader-Query 1:1 aus `ai-actions.ts` Zeilen 28–50.)

- [ ] **Step 4: Run — verify PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(claim-ai): Context-Builder (Basis-Tabellen, gespiegelt aus ai-actions Loader)"`

---

## Task 6: Copilot-Endpoint `src/app/api/admin/claim-copilot/route.ts` (+ Modell-Key)

**Files:**
- Create: `src/app/api/admin/claim-copilot/route.ts`
- Modify: `src/lib/ai/models.ts` (+ `claim_copilot: 'claude-sonnet-4-6'`)
- Test: `src/app/api/admin/claim-copilot/route.test.ts`

**Interfaces:**
- Consumes: `CLAIM_AI_TOOLS`/`extractClaimAiDrafts` (Task 2), `persistCopilotProposals` (Task 3), `appendTurns`/`loadThread` (Task 4), `buildClaimAiContext`/`summarizeClaimAiContext` (Task 5), `AI_MODELS`, `logAiUsage`, `resolveClaimId`.
- Produces: `POST` — Body `{ fallId: string; messages: {role,content}[]; modus?: 'chat'|'diagnose' }`. Streamt Text; nach `finalMessage` → Proposals + Thread persistiert. Guard: Admin.

- [ ] **Step 1: Failing test** — Validierung (kein Admin → 401; fehlende fallId → 400). (Anthropic gemockt.)

```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
import { POST } from './route'
it('401 ohne Login', async () => {
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ fallId: 'f1', messages: [{ role: 'user', content: 'hi' }] }) }) as never)
  expect(res.status).toBe(401)
})
```

- [ ] **Step 2: Run — verify FAIL.**
- [ ] **Step 3: Implement** — Muster aus Makler-Copilot (`src/app/api/makler/copilot/route.ts`: Streaming via `anthropic.messages.stream`, ReadableStream, Text-Deltas) KOMBINIERT mit Orchestrator-Tool-Use:
  - `requireAdminUserId()` lokal (spiegeln): `createClient().auth.getUser()` → `profiles.rolle==='admin'`. Kein Admin → 401.
  - `fallId` validieren (400 sonst). `claimId = await resolveClaimId(admin, fallId)`.
  - System-Prompt: Ops-Manager-Rolle (wie orchestrator `SYSTEM`), + bei `modus==='diagnose'` Diagnose-Preset (Spec §15: Datenlücken/SLA/Widersprüche/Stall/Kommunikations-Gap/Compliance → passende `propose_*`-Tools). Kontext via `summarizeClaimAiContext(await buildClaimAiContext(fallId))` als erste System/User-Message.
  - `anthropic.messages.stream({ model: AI_MODELS.claim_copilot, max_tokens: 2048, system, tools: CLAIM_AI_TOOLS, messages })`. Text-Deltas → Stream an Client. Nach `finalMessage()`: `extractClaimAiDrafts(final.content)` → `persistCopilotProposals(claimId, model, drafts)`; `appendTurns(claimId, 'admin', userId, [userMsg, assistantMsg])`; `logAiUsage(...)`. Alle Persistenz-Calls non-critical (try/catch).
- Modell-Key: in `src/lib/ai/models.ts` additive Zeile `claim_copilot: 'claude-sonnet-4-6',` mit JSDoc (analog `claim_orchestrator`).

- [ ] **Step 4: Run — verify PASS** (+ `npx tsc --noEmit` für die Route).
- [ ] **Step 5: Commit** `git commit -m "feat(claim-ai): Admin-Copilot-Endpoint (Streaming + Tool-Use + Persistenz) + models.claim_copilot"`

---

## Task 7: Freigabe-Executor `src/app/faelle/[id]/claim-ai-actions.ts`

**Files:**
- Create: `src/app/faelle/[id]/claim-ai-actions.ts` (`'use server'`)
- Test: `src/app/faelle/[id]/claim-ai-actions.test.ts`

**Interfaces:**
- Consumes: `buildTaskFromProposal`, `decideProposal` (orchestrator, import), `logFallEvent`, `sendFallCommunication`, `createAdminClient`, `createClient`, `VERB_KIND`.
- Produces (alle Result-Object):
  - `freigebenClaimAiVorschlag(proposalId: string, fallId: string)` — Idempotenz (`status==='offen'`); `task`→buildTaskFromProposal; `add_note`→logFallEvent; `draft_message`→`ausfuehrung_ergebnis={kind:'draft'}` (kein Send); dann `decideProposal(id,'angenommen',userId)`; Timeline-Event; revalidate.
  - `verwerfenClaimAiVorschlag(proposalId: string, fallId: string, feedback?: string)` — `decideProposal(id,'verworfen',userId,feedback)`; revalidate.
  - `sendeClaimAiEntwurf(proposalId: string, fallId: string)` — nur `draft_message` & bereits freigegeben; ruft `sendFallCommunication`; `ausfuehrung_ergebnis={kind:'draft',sent_at,...}`; revalidate.

- [ ] **Step 0: Signatur lesen** — `src/lib/communications/send-fall.ts:15` (`sendFallCommunication`-Parameter) für Schritt 3 exakt übernehmen.
- [ ] **Step 1: Failing test** (`draft_message` sendet NICHT bei Freigabe; `add_note` ruft logFallEvent; Idempotenz)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const decideSpy = vi.fn(async () => ({ ok: true })); const taskSpy = vi.fn(async () => ({ task_id: 't1' }))
const logSpy = vi.fn(async () => {}); const sendSpy = vi.fn(async () => ({ success: true }))
let proposalRow: Record<string, unknown> = { id: 'p1', claim_id: 'c1', vorschlag_typ: 'draft_message', ziel_rolle: null, payload: { kanal: 'email', text: '…' }, status: 'offen' }
vi.mock('@/lib/orchestrator/proposals', () => ({ decideProposal: decideSpy }))
vi.mock('@/lib/orchestrator/task-from-proposal', () => ({ buildTaskFromProposal: taskSpy }))
vi.mock('@/lib/fall/log-event', () => ({ logFallEvent: logSpy }))
vi.mock('@/lib/communications/send-fall', () => ({ sendFallCommunication: sendSpy }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: 'admin' } }) }) }) }) }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: proposalRow }) }) }), update: () => ({ eq: async () => ({ error: null }) }) }) }) }))
import { freigebenClaimAiVorschlag } from './claim-ai-actions'
beforeEach(() => { decideSpy.mockClear(); sendSpy.mockClear(); logSpy.mockClear() })
it('draft_message: Freigabe sendet NICHT, markiert angenommen', async () => {
  const r = await freigebenClaimAiVorschlag('p1', 'fall-1')
  expect(r.ok).toBe(true)
  expect(sendSpy).not.toHaveBeenCalled()
  expect(decideSpy).toHaveBeenCalledWith('p1', 'angenommen', 'admin-1')
})
it('Idempotenz: bereits bearbeiteter Vorschlag wird abgelehnt', async () => {
  proposalRow = { ...proposalRow, status: 'angenommen' }
  const r = await freigebenClaimAiVorschlag('p1', 'fall-1')
  expect(r.ok).toBe(false)
})
```

- [ ] **Step 2: Run — verify FAIL.**
- [ ] **Step 3: Implement** — `'use server'`; `requireAdminUserId()` lokal; Proposal laden (`ausfuehrung_ergebnis`, `payload`, `vorschlag_typ`, `claim_id`, `status`); Idempotenz-Guard `status==='offen'`; nach `VERB_KIND[typ]`:
  - `task` → `buildTaskFromProposal(payload, ziel_rolle, claim_id, 'claim_ai_copilot')`; bei `!task_id` → `{ok:false}`.
  - `auto` (add_note) → `logFallEvent(admin, { fallId, typ:'system', titel: payload.titel, beschreibung: payload.text })`.
  - `draft` (draft_message) → `update ai_claim_proposals set ausfuehrung_ergebnis={kind:'draft'}` (kein Send).
  - `decideProposal(id,'angenommen',userId)`; Timeline `logFallEvent(admin,{fallId,typ:'system',titel:'KI-Vorschlag freigegeben', beschreibung:begruendung, actor:userId})` (try/catch); `revalidatePath('/faelle/'+fallId)`; `{ok:true}`.
  - `sendeClaimAiEntwurf`: Guard `vorschlag_typ==='draft_message' && status==='angenommen'`; `sendFallCommunication(...)` (Signatur aus Step 0); `ausfuehrung_ergebnis={kind:'draft',sent_at:new Date().toISOString()}`; revalidate.

- [ ] **Step 4: Run — verify PASS** (+ `tsc --noEmit`).
- [ ] **Step 5: Commit** `git commit -m "feat(claim-ai): Freigabe-Executor (hybrid: task/add_note auto, draft_message Entwurf+2.Klick-Send)"`

---

## Task 8: In-Claim-Panel + Mount `ClaimAiPanel.tsx`

**Files:**
- Create: `src/app/faelle/[id]/_components/ClaimAiPanel.tsx` (Client)
- Create: `src/app/faelle/[id]/_components/ClaimAiPanel.server.tsx` (Server-Loader: `listClaimProposals(claimId)` + `loadThread`) ODER Daten im page.tsx laden und als Props reichen.
- Modify: `src/app/faelle/[id]/page.tsx` (bei ~Zeile 1018, neben `<FaqBotAnalyseCard>`, admin-gated `<ClaimAiPanel claimId={…} fallId={id} initialProposals={…} initialThread={…} />`)

**Interfaces:**
- Consumes: `/api/admin/claim-copilot` (fetch stream), `freigebenClaimAiVorschlag`/`verwerfenClaimAiVorschlag`/`sendeClaimAiEntwurf` (Task 7), `listClaimProposals`/`loadThread` (initial data).

- [ ] **Step 1: Panel bauen** — `shared/SectionCard` als Rahmen; Copilot-Eingabe (`ui/textarea` + `primitives.Button variant="navy"`), **„Fall prüfen"-Button** (`variant="ondo"`, POST `modus:'diagnose'`), Streaming-Antwort anzeigen (fetch + ReadableStream lesen, wie Makler-`MaklerCopilotTab`). Vorschlags-Karten (`SectionCard` je Vorschlag): `vorschlag_typ` + `begruendung` + Payload-Vorschau; Buttons `[Freigeben]`(navy)/`[Verwerfen]`(ghost); bei `draft_message`+angenommen zusätzlich Entwurf-Text + `[Senden]`(success). Status via `<StatusBadge>` aus `src/lib/status/` (kein inline Farb-Map). Alle Strings mit Umlauten („Fall prüfen", „Freigeben", „Verwerfen", „Senden", „Entwurf bereit").
- [ ] **Step 2: Mount** in `page.tsx` neben `FaqBotAnalyseCard`, gegated auf Admin-Rolle (bestehende Rollen-Variable der Seite nutzen).
- [ ] **Step 3: Verify** — `npm run build` (Route + Server-Action-Validator); `npm run check:component-set -- --warn`, `check:status-registry -- --warn`, `check:token-audit` → 0 neue Verstöße.
- [ ] **Step 4: Commit** `git commit -m "feat(claim-ai): In-Claim-Panel (Copilot + Fall-pruefen + Freigabe-Karten) in /faelle/[id]"`

---

## Task 9: Full Build + 7-Punkte-Audit + PR

- [ ] **Step 1:** `npm run build` grün (Routen/Server-Actions → voller Build, nicht nur tsc).
- [ ] **Step 2:** `npx vitest run src/lib/claim-ai src/app/api/admin/claim-copilot src/app/faelle/[id]/claim-ai-actions.test.ts` → alle grün.
- [ ] **Step 3:** 7-Punkte-Audit dokumentieren (Build/UI-Erreichbarkeit=Panel in /faelle/[id]/Redundanz=Orchestrator-Executor importiert/Dead-Code/Spec-Treue Ink.1/Inkonsistenz=Umlaute+Tokens+id-Dualität/Regression=orchestrator+admin/ai-vorschlaege unberührt).
- [ ] **Step 4:** `git push -u origin kitta/claim-ai-konsole`; PR gegen `staging` mit Audit-Body. Prod-Smoke (frischer SW-freier Browser, test-admin): Copilot fragen → Vorschlag → Freigeben → Timeline-Event; „Fall prüfen" → Findings.

---

## Self-Review (gegen Spec)

**Spec-Coverage:** §3 Konvergenz→T1(Migration additiv)+T3(import). §4 Units→T2/T3/T4/T5/T6/T7/T8. §5 Datenmodell→T1. §6 Verben(Ink.1: create_task/draft_message/add_note)→T2/T7. §7 Hybrid-Executor→T7. §8 Persistenz/Rollen→T3/T4/T8. §9 Sicherheit(Idempotenz/Outbound-draft/Admin-Guard)→T7. §15 „Fall prüfen"→T6/T8. **Auto-Graduierungs-Ausschluss**: unsere `draft_message`/`add_note` sind kein `vorschlag_typ='task'`; Copilot-`task`-Vorschläge werden vom Cron-Auto-Pfad (`run.ts`, nur eigene Run-Drafts) nicht angefasst — als Kommentar in T3 festhalten.

**Placeholder-Scan:** Task 5 & 8 verweisen auf konkrete Vorbild-Dateien/Zeilen statt Code komplett zu duplizieren (Loader 1:1 aus ai-actions.ts; Panel-Muster aus MaklerCopilotTab) — bewusst, da lange Vorlagen existieren; keine „TODO".

**Typ-Konsistenz:** `ClaimAiDraft` (T2) → `persistCopilotProposals` (T3) → `extractClaimAiDrafts` (T6). `VERB_KIND` (T2) → `freigebenClaimAiVorschlag` (T7). Signaturen 1:1 aus verifizierten Fakten.

**Offen für Ink. 2:** `assign_sv`/`set_status`/`request_document`, Makler-/Kunde-Sicht-Slices (ziel_rolle-CHECK-Erweiterung + RLS-Review), strukturierte Findings mit `schweregrad`, Auto-Scan beim Öffnen.
