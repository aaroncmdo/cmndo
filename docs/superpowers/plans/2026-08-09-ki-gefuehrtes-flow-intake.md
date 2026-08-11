# KI-gefuehrtes /flow-Intake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine gebrandete KI-Assistentin fuehrt den Kunden im `/flow` dialoggefuehrt durch die deklarative Feststellungs-Erfassung, fuellt dieselben Lead-Felder wie der Wizard und muendet unveraendert in SA/Konto.

**Architecture:** Additive KI-Schicht an den Steps `quali`+`feststellung`. Ein geteiltes Feld-Schema (aus `onboarding_felder`) speist Wizard UND KI. Claude Tool-Use extrahiert Freitext/Chips → Feld-Deltas → persistiert ueber den bestehenden `speichereFeststellungFlow`. Bei KI-Ausfall Fallback auf den klassischen Wizard. Rollout hinter einer Spalte `sachverstaendige.ki_intake_aktiv` (Default false).

**Tech Stack:** Next.js 15 (App Router), TypeScript, `@anthropic-ai/sdk` (Tool-Use), Supabase (service_role via `createAdminClient`), vitest.

## Global Constraints

- **Reuse, nicht neu bauen:** Persistenz ausschliesslich ueber `speichereFeststellungFlow(token, values)` (`src/app/flow/[token]/self-service-feststellung-actions.ts`); Feldmenge ausschliesslich aus `onboarding_felder` (flow_key `lead-erfassung`) gefiltert durch `istFeststellungsFeld` (`src/lib/self-service/feststellung-felder.ts`). NIE eine zweite Feldliste pflegen.
- **Rechtlich Tragendes NIE per KI:** `sa` (Abtretung-Signatur), `account` (Konto/Auth), Datei-Uploads bleiben unveraendert.
- **Server-Actions/Endpoints liefern Result-Objekte** `{ ok: boolean; error?: string }` (kein `throw` fuer erwartbare Fehler); non-critical Sends in try/catch.
- **Frontend-Texte mit echten Umlauten** (`ä/ö/ü/ß`) — UI-Strings, keine ASCII-Ersaetze.
- **Komponenten-Set:** neue UI nutzt `@/components/primitives` (Button) + `@/components/shared` (SectionCard) — kein handgerolltes Button/Card-Markup.
- **DB-Enum-Literale** nur gegen den echten CHECK (flag-drift-Gate) — hier nur relevant, falls Feld-Coercion Enum-Werte schreibt; `coerceLeadErfassungWert` uebernimmt das bereits.
- **DDL nur via `mcp__plugin_supabase_supabase__apply_migration`** (Regel 2), File-Name == getrackte Version.
- **Migration `flow_intake`-Modellwert:** die aktuelle Struktur-Output-Stufe aus `AI_MODELS` (Staging: `claude-sonnet-4-6`) — beim Bau den aktuellen Wert von `AI_MODELS.sv_briefing_struktur` spiegeln.

---

### Task 1: Feststellung-Intake-Schema (geteilte Feld-SoT)

**Files:**
- Create: `src/lib/self-service/feststellung-intake-schema.ts`
- Test: `src/lib/self-service/feststellung-intake-schema.test.ts`

**Interfaces:**
- Consumes: `istFeststellungsFeld` aus `./feststellung-felder`, `createAdminClient` aus `@/lib/supabase/admin`.
- Produces:
  - `type IntakeFeld = { feld_key: string; typ: string; label: string; hint: string | null; optionen: { wert: string; label: string }[] | null; pflicht: boolean; sektion: string | null; spalte: string }`
  - `function normalizeOptionen(raw: unknown): { wert: string; label: string }[] | null`
  - `async function ladeFeststellungIntakeSchema(): Promise<IntakeFeld[]>`

- [ ] **Step 1: Write the failing test (pure normalizer)**

```ts
// src/lib/self-service/feststellung-intake-schema.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeOptionen } from './feststellung-intake-schema'

describe('normalizeOptionen', () => {
  it('nimmt string[]', () => {
    expect(normalizeOptionen(['ja', 'nein'])).toEqual([
      { wert: 'ja', label: 'ja' },
      { wert: 'nein', label: 'nein' },
    ])
  })
  it('nimmt {wert,label}[] und {value,label}[]', () => {
    expect(normalizeOptionen([{ wert: 'a', label: 'A' }])).toEqual([{ wert: 'a', label: 'A' }])
    expect(normalizeOptionen([{ value: 'b', label: 'B' }])).toEqual([{ wert: 'b', label: 'B' }])
  })
  it('null/leer -> null', () => {
    expect(normalizeOptionen(null)).toBeNull()
    expect(normalizeOptionen([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/self-service/feststellung-intake-schema.test.ts`
Expected: FAIL — "normalizeOptionen is not a function".

- [ ] **Step 3: Implement the module**

```ts
// src/lib/self-service/feststellung-intake-schema.ts
// KI-Intake: geteiltes Feld-Schema fuer den Feststellungs-Step. EINE Quelle
// (onboarding_felder, flow_key 'lead-erfassung'), gefiltert wie die Feststellung
// (istFeststellungsFeld). Wizard UND KI-Schicht lesen dasselbe.
import { createAdminClient } from '@/lib/supabase/admin'
import { istFeststellungsFeld } from './feststellung-felder'

export type IntakeFeld = {
  feld_key: string
  typ: string
  label: string
  hint: string | null
  optionen: { wert: string; label: string }[] | null
  pflicht: boolean
  sektion: string | null
  spalte: string
}

export function normalizeOptionen(raw: unknown): { wert: string; label: string }[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out = raw.map((o) => {
    if (typeof o === 'string') return { wert: o, label: o }
    const rec = o as Record<string, unknown>
    const wert = (rec.wert ?? rec.value) as string | undefined
    const label = (rec.label ?? wert) as string | undefined
    return wert ? { wert, label: label ?? wert } : null
  })
  const clean = out.filter((x): x is { wert: string; label: string } => x !== null)
  return clean.length ? clean : null
}

export async function ladeFeststellungIntakeSchema(): Promise<IntakeFeld[]> {
  const admin = createAdminClient()
  const { data: phasen } = await admin
    .from('onboarding_phasen')
    .select('id')
    .eq('flow_key', 'lead-erfassung')
  const phaseIds = ((phasen ?? []) as Array<{ id: string }>).map((p) => p.id)
  if (phaseIds.length === 0) return []

  const { data } = await admin
    .from('onboarding_felder')
    .select('feld_key, typ, label, hint, optionen, pflicht, sektion, db_target, reihenfolge')
    .in('phase_id', phaseIds)
    .order('reihenfolge', { ascending: true })

  const felder: IntakeFeld[] = []
  for (const row of (data ?? []) as Array<{
    feld_key: string; typ: string; label: string | null; hint: string | null
    optionen: unknown; pflicht: boolean | null; sektion: string | null
    db_target: { tabelle?: string; spalte?: string } | null
  }>) {
    if (!istFeststellungsFeld({ feld_key: row.feld_key, typ: row.typ, sektion: row.sektion })) continue
    const t = row.db_target
    if (t?.tabelle !== 'leads' || !t.spalte) continue
    felder.push({
      feld_key: row.feld_key,
      typ: row.typ,
      label: row.label ?? row.feld_key,
      hint: row.hint,
      optionen: normalizeOptionen(row.optionen),
      pflicht: row.pflicht === true,
      sektion: row.sektion,
      spalte: t.spalte,
    })
  }
  return felder
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/self-service/feststellung-intake-schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/self-service/feststellung-intake-schema.ts src/lib/self-service/feststellung-intake-schema.test.ts
git commit -m "feat(flow-intake): geteiltes Feststellung-Feldschema aus onboarding_felder"
```

---

### Task 2: Token→Lead-Helfer extrahieren (shared)

**Files:**
- Create: `src/lib/flow/flow-token.ts`
- Modify: `src/app/flow/[token]/self-service-feststellung-actions.ts` (die private `resolveFlowLeadId` durch den Shared-Import ersetzen)
- Test: `src/lib/flow/flow-token.test.ts`

**Interfaces:**
- Produces: `async function resolveFlowLeadId(token: string): Promise<{ admin: ReturnType<typeof createAdminClient> | null; leadId: string | null; error?: string }>`
- Consumes: `createAdminClient` aus `@/lib/supabase/admin`.

- [ ] **Step 1: Write the failing test (mock admin)**

```ts
// src/lib/flow/flow-token.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingle = vi.fn()
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

import { resolveFlowLeadId } from './flow-token'

beforeEach(() => { maybeSingle.mockReset() })

describe('resolveFlowLeadId', () => {
  it('leerer Token -> Fehler', async () => {
    expect(await resolveFlowLeadId('')).toMatchObject({ leadId: null, error: 'Kein Token.' })
  })
  it('gueltiger flow_link -> leadId', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { lead_id: 'lead-1', expires_at: null } })
    expect(await resolveFlowLeadId('tok')).toMatchObject({ leadId: 'lead-1' })
  })
  it('abgelaufen -> Fehler', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { lead_id: 'lead-1', expires_at: '2000-01-01T00:00:00Z' } })
    expect(await resolveFlowLeadId('tok')).toMatchObject({ leadId: null, error: 'Dieser Link ist abgelaufen.' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/flow/flow-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the shared helper (verbatim aus dem Bestand extrahiert)**

```ts
// src/lib/flow/flow-token.ts
// Geteilt: flow_links-Token -> leadId (mit Ablauf-Check). Extrahiert aus
// self-service-feststellung-actions (Consumer: dort + /api/flow/[token]/intake).
import { createAdminClient } from '@/lib/supabase/admin'

export async function resolveFlowLeadId(token: string): Promise<{
  admin: ReturnType<typeof createAdminClient> | null
  leadId: string | null
  error?: string
}> {
  if (!token) return { admin: null, leadId: null, error: 'Kein Token.' }
  const admin = createAdminClient()
  const { data: flowLink } = await admin
    .from('flow_links')
    .select('lead_id, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (flowLink) {
    if (flowLink.expires_at && new Date(flowLink.expires_at as string).getTime() < Date.now()) {
      return { admin, leadId: null, error: 'Dieser Link ist abgelaufen.' }
    }
    return { admin, leadId: (flowLink.lead_id as string | null) ?? null }
  }
  return { admin, leadId: token } // Backward-compat: Token = lead_id
}
```

- [ ] **Step 4: Modify the existing action to reuse it**

In `src/app/flow/[token]/self-service-feststellung-actions.ts`: die lokale `async function resolveFlowLeadId(...) {...}` (Zeilen 14-33) loeschen und oben ergaenzen:

```ts
import { resolveFlowLeadId } from '@/lib/flow/flow-token'
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/lib/flow/flow-token.test.ts` → PASS.
Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler (bestaetigt, dass der Consumer weiter kompiliert).

- [ ] **Step 6: Commit**

```bash
git add src/lib/flow/flow-token.ts src/lib/flow/flow-token.test.ts "src/app/flow/[token]/self-service-feststellung-actions.ts"
git commit -m "refactor(flow): resolveFlowLeadId in shared flow-token extrahiert"
```

---

### Task 3: Modell-Key `flow_intake`

**Files:**
- Modify: `src/lib/ai/models.ts`

**Interfaces:**
- Produces: `AI_MODELS.flow_intake` (string).

- [ ] **Step 1: Add the key**

In `src/lib/ai/models.ts` im `AI_MODELS`-Objekt ergaenzen (denselben String wie `sv_briefing_struktur` verwenden — die Struktur-Output-Sibling-Stufe):

```ts
  /**
   * KI-gefuehrtes /flow-Intake — konversationelle Feststellungs-Erfassung mit
   * Tool-Use (strukturierte Feld-Extraktion). Kunden-facing, aber Qualitaet der
   * Extraktion > Speed -> Struktur-Output-Stufe (wie sv_briefing_struktur).
   */
  flow_intake: 'claude-sonnet-4-6',
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/models.ts
git commit -m "feat(ai): flow_intake-Modell-Key"
```

---

### Task 4: Prompt-Builder (pure)

**Files:**
- Create: `src/lib/ai/flow-intake/prompt.ts`
- Test: `src/lib/ai/flow-intake/prompt.test.ts`

**Interfaces:**
- Consumes: `IntakeFeld` aus `@/lib/self-service/feststellung-intake-schema`.
- Produces: `function buildIntakeSystemPrompt(p: { firmenname: string | null; schema: IntakeFeld[]; bekannt: Record<string, unknown> }): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ai/flow-intake/prompt.test.ts
import { describe, it, expect } from 'vitest'
import { buildIntakeSystemPrompt } from './prompt'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

const F = (o: Partial<IntakeFeld>): IntakeFeld => ({
  feld_key: 'unfallhergang', typ: 'text', label: 'Unfallhergang', hint: null,
  optionen: null, pflicht: true, sektion: 'unfall', spalte: 'unfallhergang', ...o,
})

describe('buildIntakeSystemPrompt', () => {
  it('nennt den Firmennamen als Persona', () => {
    const p = buildIntakeSystemPrompt({ firmenname: 'KFZ Mueller', schema: [F({})], bekannt: {} })
    expect(p).toContain('KFZ Mueller')
  })
  it('faellt ohne Firmennamen auf Claimondo zurueck', () => {
    const p = buildIntakeSystemPrompt({ firmenname: null, schema: [F({})], bekannt: {} })
    expect(p).toContain('Claimondo')
  })
  it('listet nur noch offene Pflichtfelder', () => {
    const schema = [F({ feld_key: 'unfallhergang' }), F({ feld_key: 'unfallort', label: 'Unfallort', spalte: 'unfallort' })]
    const p = buildIntakeSystemPrompt({ firmenname: null, schema, bekannt: { unfallhergang: 'x' } })
    expect(p).toContain('Unfallort')
    expect(p).not.toContain('- Unfallhergang')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/flow-intake/prompt.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/ai/flow-intake/prompt.ts
// PURE: System-Prompt fuer die KI-Intake-Assistentin. Gebrandet (SV-Firmenname),
// fragt nur nach Schema-Feldern, keine Rechtsberatung, Ausgabe via Tool.
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

export function buildIntakeSystemPrompt(p: {
  firmenname: string | null
  schema: IntakeFeld[]
  bekannt: Record<string, unknown>
}): string {
  const persona = p.firmenname?.trim() || 'Claimondo'
  const offen = p.schema.filter(
    (f) => f.pflicht && (p.bekannt[f.feld_key] === undefined || p.bekannt[f.feld_key] === null || p.bekannt[f.feld_key] === ''),
  )
  const felderText = offen
    .map((f) => `- ${f.label} (feld_key: ${f.feld_key}${f.optionen ? `, Optionen: ${f.optionen.map((o) => o.wert).join('/')}` : ''})`)
    .join('\n')
  return `Du bist die freundliche Schaden-Assistentin von ${persona}. Du hilfst dem Kunden nach einem Kfz-Unfall, seine Angaben Schritt fuer Schritt zu erfassen.

=== DEINE AUFGABE ===
Erfasse im Dialog GENAU die folgenden noch offenen Angaben. Frage locker, EINE Sache pro Nachricht, in einfacher SIE-Form auf Deutsch. Nutze wo moeglich die Optionen als Auswahl.

Noch offen:
${felderText || '(alle Pflichtangaben liegen vor)'}

=== REGELN ===
- Frage NUR nach diesen Feldern. Erfinde keine zusaetzlichen Pflichtangaben.
- KEINE Rechtsberatung, keine Schuld-Bewertung, keine Geld-Zusagen.
- Wenn eine Antwort unklar/mehrdeutig ist, frage nach — rate nicht.
- Gib deine Ausgabe IMMER ueber das Tool "erfasse_felder" zurueck: die extrahierten Werte (nur bekannte feld_keys), die naechste Frage, und ob alle Pflichtangaben vollstaendig sind.
- Sind alle offenen Pflichtfelder erfasst, setze fertig=true und formuliere einen kurzen Abschluss-Satz als naechste_frage.`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/flow-intake/prompt.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/flow-intake/prompt.ts src/lib/ai/flow-intake/prompt.test.ts
git commit -m "feat(flow-intake): gebrandeter System-Prompt-Builder"
```

---

### Task 5: Guard (pure Feld-Filter + Pflicht-Check)

**Files:**
- Create: `src/lib/ai/flow-intake/guard.ts`
- Test: `src/lib/ai/flow-intake/guard.test.ts`

**Interfaces:**
- Consumes: `IntakeFeld`.
- Produces:
  - `function filterDeltas(deltas: Record<string, unknown>, schema: IntakeFeld[]): Record<string, unknown>`
  - `function fehlendePflicht(schema: IntakeFeld[], bekannt: Record<string, unknown>): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ai/flow-intake/guard.test.ts
import { describe, it, expect } from 'vitest'
import { filterDeltas, fehlendePflicht } from './guard'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

const F = (k: string, pflicht = true): IntakeFeld => ({
  feld_key: k, typ: 'text', label: k, hint: null, optionen: null, pflicht, sektion: null, spalte: k,
})

describe('guard', () => {
  it('filterDeltas verwirft unbekannte Keys', () => {
    const schema = [F('unfallort')]
    expect(filterDeltas({ unfallort: 'Koeln', schuldfrage: 'gegner', sa_unterschrieben: true }, schema))
      .toEqual({ unfallort: 'Koeln' })
  })
  it('fehlendePflicht listet leere Pflichtfelder', () => {
    const schema = [F('unfallort'), F('unfalldatum'), F('zeugen', false)]
    expect(fehlendePflicht(schema, { unfallort: 'Koeln', unfalldatum: '' }))
      .toEqual(['unfalldatum'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/flow-intake/guard.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/ai/flow-intake/guard.ts
// PURE: nur Schema-Keys durchlassen (nie Rechts-/Auth-Felder), Pflicht-Luecken finden.
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

export function filterDeltas(deltas: Record<string, unknown>, schema: IntakeFeld[]): Record<string, unknown> {
  const erlaubt = new Set(schema.map((f) => f.feld_key))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(deltas ?? {})) {
    if (erlaubt.has(k) && v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

export function fehlendePflicht(schema: IntakeFeld[], bekannt: Record<string, unknown>): string[] {
  return schema
    .filter((f) => f.pflicht)
    .filter((f) => { const v = bekannt[f.feld_key]; return v === undefined || v === null || v === '' })
    .map((f) => f.feld_key)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/flow-intake/guard.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/flow-intake/guard.ts src/lib/ai/flow-intake/guard.test.ts
git commit -m "feat(flow-intake): Guard (Schema-Feld-Filter + Pflicht-Check)"
```

---

### Task 6: Extractor (Claude Tool-Use, server-only)

**Files:**
- Create: `src/lib/ai/flow-intake/extract.ts`
- Test: `src/lib/ai/flow-intake/extract.test.ts`

**Interfaces:**
- Consumes: `IntakeFeld`, `buildIntakeSystemPrompt`, `AI_MODELS`, `@anthropic-ai/sdk`.
- Produces:
  - `type IntakeTurn = { role: 'user' | 'assistant'; content: string }`
  - `type IntakeTurnResult = { ok: true; deltas: Record<string, unknown>; naechste_frage: string; fertig: boolean } | { ok: false; error: string }`
  - `async function extractIntakeTurn(p: { firmenname: string | null; schema: IntakeFeld[]; bekannt: Record<string, unknown>; historie: IntakeTurn[]; nachricht: string }): Promise<IntakeTurnResult>`

- [ ] **Step 1: Write the failing test (Anthropic gemockt)**

```ts
// src/lib/ai/flow-intake/extract.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create } },
}))
vi.mock('@/lib/ai/models', () => ({ AI_MODELS: { flow_intake: 'test-model' } }))

import { extractIntakeTurn } from './extract'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

const F = (k: string): IntakeFeld => ({ feld_key: k, typ: 'text', label: k, hint: null, optionen: null, pflicht: true, sektion: null, spalte: k })

beforeEach(() => { create.mockReset(); process.env.ANTHROPIC_API_KEY = 'x' })

describe('extractIntakeTurn', () => {
  it('liest tool_use -> deltas/frage/fertig', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'erfasse_felder', input: { deltas: { unfallort: 'Koeln' }, naechste_frage: 'Wann war das?', fertig: false } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    const r = await extractIntakeTurn({ firmenname: null, schema: [F('unfallort')], bekannt: {}, historie: [], nachricht: 'In Koeln' })
    expect(r).toEqual({ ok: true, deltas: { unfallort: 'Koeln' }, naechste_frage: 'Wann war das?', fertig: false })
  })
  it('ohne API-Key -> Fehler', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await extractIntakeTurn({ firmenname: null, schema: [F('unfallort')], bekannt: {}, historie: [], nachricht: 'x' })
    expect(r).toMatchObject({ ok: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/flow-intake/extract.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/ai/flow-intake/extract.ts
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { buildIntakeSystemPrompt } from './prompt'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

export type IntakeTurn = { role: 'user' | 'assistant'; content: string }
export type IntakeTurnResult =
  | { ok: true; deltas: Record<string, unknown>; naechste_frage: string; fertig: boolean }
  | { ok: false; error: string }

const TOOL: Anthropic.Tool = {
  name: 'erfasse_felder',
  description: 'Gib die aus der letzten Kundennachricht extrahierten Feld-Werte, die naechste Frage und ob alle Pflichtangaben vollstaendig sind zurueck.',
  input_schema: {
    type: 'object',
    properties: {
      deltas: { type: 'object', description: 'Map feld_key -> Wert; nur bekannte feld_keys, nur was aus der Nachricht klar hervorgeht.' },
      naechste_frage: { type: 'string', description: 'Die naechste an den Kunden gerichtete Frage (oder Abschluss-Satz).' },
      fertig: { type: 'boolean', description: 'true, wenn alle offenen Pflichtangaben erfasst sind.' },
    },
    required: ['deltas', 'naechste_frage', 'fertig'],
  },
}

export async function extractIntakeTurn(p: {
  firmenname: string | null
  schema: IntakeFeld[]
  bekannt: Record<string, unknown>
  historie: IntakeTurn[]
  nachricht: string
}): Promise<IntakeTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY nicht gesetzt' }
  if (!p.nachricht.trim()) return { ok: false, error: 'Nachricht fehlt' }

  const system = buildIntakeSystemPrompt({ firmenname: p.firmenname, schema: p.schema, bekannt: p.bekannt })
  const messages: IntakeTurn[] = [...p.historie.slice(-12), { role: 'user', content: p.nachricht.trim() }]

  try {
    const anthropic = new Anthropic({ apiKey })
    const res = await anthropic.messages.create({
      model: AI_MODELS.flow_intake,
      max_tokens: 700,
      system: [{ type: 'text', text: system }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'erfasse_felder' },
      messages,
    })
    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return { ok: false, error: 'Keine strukturierte Antwort' }
    const input = block.input as { deltas?: Record<string, unknown>; naechste_frage?: string; fertig?: boolean }
    return {
      ok: true,
      deltas: input.deltas ?? {},
      naechste_frage: input.naechste_frage ?? '',
      fertig: input.fertig === true,
    }
  } catch (err) {
    console.error('[flow-intake] extract fehlgeschlagen:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Claude-API-Fehler' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/flow-intake/extract.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/flow-intake/extract.ts src/lib/ai/flow-intake/extract.test.ts
git commit -m "feat(flow-intake): Claude-Tool-Use-Extractor"
```

---

### Task 7: Rollout-Gate-Spalte (Migration)

**Files:**
- Create: `supabase/migrations/<V>_sachverstaendige_ki_intake_aktiv.sql`

**Interfaces:**
- Produces: Spalte `sachverstaendige.ki_intake_aktiv boolean not null default false`.

- [ ] **Step 1: Migration anwenden (MCP-Plugin)**

`apply_migration({ name: 'sachverstaendige_ki_intake_aktiv', query: ... })` mit:

```sql
alter table public.sachverstaendige
  add column if not exists ki_intake_aktiv boolean not null default false;
comment on column public.sachverstaendige.ki_intake_aktiv is
  'KI-gefuehrtes /flow-Intake fuer die Kunden dieses SV aktiv (Rollout-Gate, Default false).';
```

- [ ] **Step 2: Getrackte Version ablesen + File committen**

`list_migrations` → Version `<V>` ablesen; File exakt als `supabase/migrations/<V>_sachverstaendige_ki_intake_aktiv.sql` mit demselben SQL anlegen (Regel 2, Schritt 3+4).

- [ ] **Step 3: Types regenerieren + committen**

```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
```

- [ ] **Step 4: Verify + Commit**

`execute_sql`: `select column_name from information_schema.columns where table_name='sachverstaendige' and column_name='ki_intake_aktiv';` → 1 Row.

```bash
git add "supabase/migrations/<V>_sachverstaendige_ki_intake_aktiv.sql" src/lib/supabase/database.types.ts
git commit -m "feat(flow-intake): Rollout-Gate sachverstaendige.ki_intake_aktiv (Mig <V>)"
```

---

### Task 8: Turn-Endpoint `/api/flow/[token]/intake`

**Files:**
- Create: `src/app/api/flow/[token]/intake/route.ts`
- Test: `src/app/api/flow/[token]/intake/route.test.ts`

**Interfaces:**
- Consumes: `resolveFlowLeadId` (`@/lib/flow/flow-token`), `ladeFeststellungIntakeSchema` (`@/lib/self-service/feststellung-intake-schema`), `extractIntakeTurn` (`@/lib/ai/flow-intake/extract`), `filterDeltas`/`fehlendePflicht` (`@/lib/ai/flow-intake/guard`), `speichereFeststellungFlow` (`@/app/flow/[token]/self-service-feststellung-actions`), `resolveBrandingFromFlowToken` (`@/lib/branding/token-theme`).
- Produces: `POST` → `{ ok: true; naechste_frage: string; fertig: boolean; fehlend: string[] } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test (Kollaborateure gemockt)**

```ts
// src/app/api/flow/[token]/intake/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const eq = vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: {} }) }))
const admin = { from: vi.fn(() => ({ select: () => ({ eq }) })) }
vi.mock('@/lib/flow/flow-token', () => ({ resolveFlowLeadId: vi.fn().mockResolvedValue({ admin, leadId: 'lead-1' }) }))
vi.mock('@/lib/self-service/feststellung-intake-schema', () => ({
  ladeFeststellungIntakeSchema: vi.fn().mockResolvedValue([{ feld_key: 'unfallort', typ: 'text', label: 'Unfallort', hint: null, optionen: null, pflicht: true, sektion: null, spalte: 'unfallort' }]),
}))
vi.mock('@/lib/branding/token-theme', () => ({ resolveBrandingFromFlowToken: vi.fn().mockResolvedValue({ firmenname: 'KFZ Test' }) }))
vi.mock('@/lib/ai/flow-intake/extract', () => ({ extractIntakeTurn: vi.fn().mockResolvedValue({ ok: true, deltas: { unfallort: 'Koeln', boese: 'x' }, naechste_frage: 'Wann?', fertig: false }) }))
const speichere = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/app/flow/[token]/self-service-feststellung-actions', () => ({ speichereFeststellungFlow: speichere }))

import { POST } from './route'

beforeEach(() => { speichere.mockClear() })

function req(body: unknown) {
  return new Request('http://x/api/flow/t/intake', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST intake', () => {
  it('extrahiert, persistiert nur Schema-Felder, gibt naechste Frage', async () => {
    const res = await POST(req({ nachricht: 'In Koeln', historie: [] }), { params: Promise.resolve({ token: 't' }) })
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, naechste_frage: 'Wann?', fertig: false })
    // Guard: nur 'unfallort' persistiert, nicht 'boese'
    expect(speichere).toHaveBeenCalledWith('t', { unfallort: 'Koeln' })
  })
  it('leere Nachricht -> 400', async () => {
    const res = await POST(req({ nachricht: '' }), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/flow/[token]/intake/route.test.ts"` → FAIL (module not found).

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/flow/[token]/intake/route.ts
// KI-Intake-Turn: Kundennachricht -> Claude-Extraktion -> nur Schema-Felder
// persistieren (speichereFeststellungFlow) -> naechste Frage. Token-autorisiert.
import { NextResponse } from 'next/server'
import { resolveFlowLeadId } from '@/lib/flow/flow-token'
import { ladeFeststellungIntakeSchema } from '@/lib/self-service/feststellung-intake-schema'
import { resolveBrandingFromFlowToken } from '@/lib/branding/token-theme'
import { extractIntakeTurn, type IntakeTurn } from '@/lib/ai/flow-intake/extract'
import { filterDeltas, fehlendePflicht } from '@/lib/ai/flow-intake/guard'
import { speichereFeststellungFlow } from '@/app/flow/[token]/self-service-feststellung-actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Einfacher In-Memory-Turn-Cap pro Token (ein Turn = ein Claude-Call).
const turns = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX = 20
function turnCapped(token: string): boolean {
  const now = Date.now()
  const hits = (turns.get(token) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  turns.set(token, hits)
  return hits.length > MAX
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let body: { nachricht?: string; historie?: IntakeTurn[] }
  try {
    body = (await req.json()) as { nachricht?: string; historie?: IntakeTurn[] }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const nachricht = (body.nachricht ?? '').trim()
  if (!nachricht) return NextResponse.json({ ok: false, error: 'nachricht_fehlt' }, { status: 400 })
  if (turnCapped(token)) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const { admin, leadId, error } = await resolveFlowLeadId(token)
  if (!admin || !leadId) return NextResponse.json({ ok: false, error: error ?? 'ungueltig' }, { status: 403 })

  const schema = await ladeFeststellungIntakeSchema()

  // Bekannte Werte: die Schema-Spalten vom Lead lesen -> feld_key-Map.
  const spalten = schema.map((f) => f.spalte)
  const { data: leadRow } = await admin.from('leads').select(spalten.join(', ')).eq('id', leadId).maybeSingle()
  const bekannt: Record<string, unknown> = {}
  for (const f of schema) bekannt[f.feld_key] = (leadRow as Record<string, unknown> | null)?.[f.spalte] ?? null

  const branding = await resolveBrandingFromFlowToken(token)
  const turn = await extractIntakeTurn({
    firmenname: branding.firmenname,
    schema,
    bekannt,
    historie: Array.isArray(body.historie) ? body.historie.slice(-12) : [],
    nachricht,
  })
  if (!turn.ok) return NextResponse.json({ ok: false, error: turn.error }, { status: 502 })

  const sauber = filterDeltas(turn.deltas, schema)
  if (Object.keys(sauber).length > 0) {
    const saved = await speichereFeststellungFlow(token, sauber)
    if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error ?? 'save_failed' }, { status: 500 })
  }

  const fehlend = fehlendePflicht(schema, { ...bekannt, ...sauber })
  return NextResponse.json({ ok: true, naechste_frage: turn.naechste_frage, fertig: turn.fertig && fehlend.length === 0, fehlend })
}
```

- [ ] **Step 4: Run test + build**

Run: `npx vitest run "src/app/api/flow/[token]/intake/route.test.ts"` → PASS.
Run: `npm run build` (Route-Change → voller Build; falls Fresh-Worktree-OOM: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` + CI-Build als Gate).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/flow/[token]/intake/route.ts" "src/app/api/flow/[token]/intake/route.test.ts"
git commit -m "feat(flow-intake): Turn-Endpoint /api/flow/[token]/intake"
```

---

### Task 9: UI — `FlowAiIntake` (Chat + Chips + Fallback)

**Files:**
- Create: `src/app/flow/[token]/FlowAiIntake.tsx`

**Interfaces:**
- Consumes: `IntakeFeld` (Chips), Props `{ token: string; schema: IntakeFeld[]; onFertig: () => void; onFallback: () => void }`. Ruft `POST /api/flow/[token]/intake`.
- Produces: Client-Komponente `FlowAiIntake`.

- [ ] **Step 1: Implement the component**

```tsx
// src/app/flow/[token]/FlowAiIntake.tsx
'use client'

// KI-gefuehrtes Intake: dialoggefuehrte Feststellungs-Erfassung. Erbt das
// /flow-Brand-Theme (Wrapper der Seite). Bei Fehler -> onFallback (klassischer Wizard).
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

type Turn = { role: 'user' | 'assistant'; content: string }

export default function FlowAiIntake({
  token, schema, onFertig, onFallback,
}: { token: string; schema: IntakeFeld[]; onFertig: () => void; onFallback: () => void }) {
  const [verlauf, setVerlauf] = useState<Turn[]>([
    { role: 'assistant', content: 'Hallo! Ich helfe Ihnen, Ihren Unfall kurz zu schildern. Was ist passiert?' },
  ])
  const [eingabe, setEingabe] = useState('')
  const [busy, setBusy] = useState(false)

  async function senden(text: string) {
    const nachricht = text.trim()
    if (!nachricht || busy) return
    setBusy(true)
    const historie = verlauf
    setVerlauf((v) => [...v, { role: 'user', content: nachricht }])
    setEingabe('')
    try {
      const res = await fetch(`/api/flow/${token}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nachricht, historie }),
      })
      const json = await res.json()
      if (!json.ok) { onFallback(); return }
      setVerlauf((v) => [...v, { role: 'assistant', content: json.naechste_frage }])
      if (json.fertig) onFertig()
    } catch {
      onFallback()
    } finally {
      setBusy(false)
    }
  }

  // Chips: Optionen des zuletzt gefragten Feldes (heuristisch: erstes offenes Feld mit Optionen).
  const chipFeld = schema.find((f) => f.optionen && f.optionen.length > 0)

  return (
    <SectionCard title="Schaden schildern">
      <div className="space-y-3">
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {verlauf.map((t, i) => (
            <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
              <span className={`inline-block rounded-ios-lg px-3 py-2 text-sm ${t.role === 'user' ? 'bg-claimondo-navy text-white' : 'bg-claimondo-bg text-claimondo-navy'}`}>
                {t.content}
              </span>
            </div>
          ))}
        </div>

        {chipFeld?.optionen && (
          <div className="flex flex-wrap gap-2">
            {chipFeld.optionen.map((o) => (
              <Button key={o.wert} variant="ghost" size="sm" disabled={busy} onClick={() => senden(o.label)}>
                {o.label}
              </Button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); void senden(eingabe) }}
          className="flex gap-2"
        >
          <input
            className="flex-1 rounded-ios-lg border border-claimondo-border px-3 py-2 text-sm"
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder="Ihre Antwort…"
            disabled={busy}
          />
          <Button variant="navy" loading={busy} onClick={() => void senden(eingabe)}>Senden</Button>
        </form>

        <button type="button" onClick={onFallback} className="text-xs text-claimondo-ondo underline underline-offset-2">
          Lieber klassisch ausfüllen
        </button>
      </div>
    </SectionCard>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler.

- [ ] **Step 3: Commit**

```bash
git add "src/app/flow/[token]/FlowAiIntake.tsx"
git commit -m "feat(flow-intake): FlowAiIntake-UI (Chat/Chips/Fallback)"
```

---

### Task 10: Verdrahtung in `/flow` (gegated) + Prod-Smoke

**Files:**
- Modify: `src/app/flow/[token]/page.tsx` (SV-`ki_intake_aktiv` laden + an den Wizard reichen)
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (an `quali`/`feststellung` die KI-Variante rendern, wenn gegated + kein Fallback)

**Interfaces:**
- Consumes: `FlowAiIntake`, `ladeFeststellungIntakeSchema`, das Wizard-eigene `fallback`-State + der Step-Dispatch (`FlowWizardKfz.tsx` ~703 `quali` / ~722 `feststellung`).

- [ ] **Step 1: Gate laden (page.tsx)**

In `src/app/flow/[token]/page.tsx`: nach der Lead/SV-Aufloesung den Gate-Wert lesen (der Lead traegt `zugewiesen_an`=SV-profile → `sachverstaendige.ki_intake_aktiv`) und an `FlowWizardKfz` als Prop `kiIntakeAktiv={boolean}` reichen. Konkret (an der Stelle, wo der Wizard gerendert wird):

```tsx
// SV-Gate: ist das KI-Intake fuer den zugewiesenen SV aktiv?
let kiIntakeAktiv = false
if (leadRow?.zugewiesen_an) {
  const { data: svRow } = await admin
    .from('sachverstaendige')
    .select('ki_intake_aktiv')
    .eq('profile_id', leadRow.zugewiesen_an)
    .maybeSingle()
  kiIntakeAktiv = svRow?.ki_intake_aktiv === true
}
// … <FlowWizardKfz … kiIntakeAktiv={kiIntakeAktiv} schemaIntake={await ladeFeststellungIntakeSchema()} />
```

(Signaturen/Variablennamen an die real vorhandene Lead-/SV-Aufloesung in `page.tsx` anpassen; `zugewiesen_an` ist das Lead→SV-Profil-Feld.)

- [ ] **Step 2: Wizard-Dispatch erweitern (FlowWizardKfz.tsx)**

Props `kiIntakeAktiv?: boolean` + `schemaIntake?: IntakeFeld[]` ergaenzen und einen lokalen `const [kiFallback, setKiFallback] = useState(false)`. Am Dispatch der Steps `quali` und `feststellung`: wenn `kiIntakeAktiv && !kiFallback && schemaIntake`, statt der Formular-Steps die KI-Variante rendern:

```tsx
{kiIntakeAktiv && !kiFallback && schemaIntake ? (
  <FlowAiIntake
    token={token}
    schema={schemaIntake}
    onFertig={() => goToStep('zusammenfassung')}
    onFallback={() => setKiFallback(true)}
  />
) : (
  /* bestehende quali/feststellung-Step-Komponenten unveraendert */
)}
```

(`goToStep`/den Weiter-Mechanismus an die real vorhandene Step-Navigation in `FlowWizardKfz.tsx` anpassen — die KI ersetzt nur die Erfassung, der Uebergang zu `zusammenfassung` nutzt den bestehenden Navigations-Helfer.)

- [ ] **Step 3: Build**

Run: `npm run build` (bzw. `tsc --noEmit` 8GB + CI-Build). Expected: 0 Fehler.

- [ ] **Step 4: Commit**

```bash
git add "src/app/flow/[token]/page.tsx" "src/app/flow/[token]/FlowWizardKfz.tsx"
git commit -m "feat(flow-intake): KI-Variante an quali/feststellung (gegated) verdrahtet"
```

- [ ] **Step 5: Rollout + Regel-4 (nach Deploy)**

1. Gate fuer den Test-SV setzen: `execute_sql` → `update sachverstaendige set ki_intake_aktiv = true where id = 'c96b1a58-9441-4446-adc6-26d3169cafdd';`
2. Test-Lead + FlowLink erzeugen (Wegwerf, `telefon = NULL`), `/flow/[token]` oeffnen.
3. Prod-Smoke (Playwright): KI-Dialog fuellt mehrere Feststellungs-Felder → in der DB (`leads`) landen die Spalten → `zusammenfassung` erreichbar → `sa`/`account` unveraendert. Fallback-Button → klassischer Wizard.
4. Artefakte aufraeumen (Termin/FlowLink/Lead/gfa), Gate ggf. wieder aus.

---

## Self-Review

**Spec-Abdeckung:**
- §3/§4 Architektur (KI an quali+feststellung, Schema-SoT, Persistenz-Reuse, Fallback) → Tasks 1, 6, 8, 9, 10. ✓
- §4.1 Schema → Task 1. §4.2 Engine (prompt/extract/guard/models) → Tasks 3-6. §4.3 API → Task 8. §4.4 UI → Task 9. §4.5 Gate → Task 7 + Task 10. ✓
- §5 Datenfluss → Task 8 (extract → guard → speichere → fehlend). ✓
- §6 Degradation (Fallback bei Fehler, Confirm-Gate) → Task 8 (502→Client `onFallback`), Task 9 (Fallback-Button), Task 10 (`onFertig`→`zusammenfassung` = Confirm). ✓
- §7 Entscheidungen (quali+feststellung; hybrid Chips+Text; Gate-Spalte; SV-Firmenname-Persona; `flow_intake`=Struktur-Stufe; ephemer=kein Transcript-Store) → alle umgesetzt. ✓
- **Foto-Vision (§4.2/§7-2)** ist bewusst NICHT in v1 (Phase-2-Follow-up, spec §10 Schritt 5) — reduziert Risiko + haelt den Plan platzhalterfrei. Als naechster Plan.

**Placeholder-Scan:** kein TBD/TODO; jeder Code-Step hat echten Code. Die zwei "an die real vorhandene X anpassen"-Hinweise (Task 10, page.tsx/FlowWizardKfz-Navigation) sind bewusste Integrations-Anker in Bestandsdateien, deren genaue lokale Variablennamen der Implementierer beim Anfassen sieht — kein weglassbares Verhalten.

**Typ-Konsistenz:** `IntakeFeld`/`IntakeTurn`/`IntakeTurnResult` durchgehend gleich; `speichereFeststellungFlow(token, Record<feld_key, unknown>)` und `filterDeltas`-Ausgabe sind feld_key-getastet (kompatibel); `resolveFlowLeadId` liefert `{admin, leadId, error}` konsistent in Tasks 2 + 8.
