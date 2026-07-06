# AI-Claim-Orchestrator — Phase-1-PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Shadow-Mode-Cron-Agent, der stagnierende Fälle liest, per Claude-Tool-Use den nächsten Schritt (Task an Rolle / Eskalation / Hinweis) **vorschlägt** und die Vorschläge in `ai_claim_proposals` materialisiert; ein Admin liest sie und nimmt sie an/verwirft sie. Kein automatischer Fall-Write.

**Architecture:** Deterministische Engine bleibt unberührt (Boden + Fallback). Der Orchestrator ist eine additive Schicht: `Cron → buildClaimContext → reviewClaim (Claude + validierte Tool-Defs) → extractProposals → persist (ai_claim_proposals) → Admin-Surface → decide`. Claude **entscheidet nur** (Judgment); Ausführung passiert erst bei Mensch-Approval über die *bestehende* `createLinkedTask`. Reine Logik (Stagnation, Summarizer, Tool-Validierung, Dedup, Proposal-Extraktion, Health-Klassifikation) wird als testbare Funktionen extrahiert; DB/Anthropic-Aufrufe sind dünne Wrapper drumherum.

**Tech Stack:** Next.js 15 (App Router, Route Handlers), TypeScript, Supabase (service_role via `createAdminClient`), `@anthropic-ai/sdk` (Messages + Tool-Use), Zod, Vitest.

## Global Constraints

- **DDL nur via `mcp__plugin_supabase_supabase__apply_migration`** (Regel 2). `execute_sql` nur READ. Migration-File-Name == getrackte Version (Twin-Drift-Regel). Additiv (kein Drop) → darf vor Code-Merge appliziert werden.
- **Kein Push auf `main`.** Arbeit bleibt auf Branch `kitta/ai-claim-orchestrator-spec`. PR gegen `staging`.
- **Neue Server-Actions liefern `{ ok: boolean; error?: string }`** (nicht `throw`, nicht `success`). Non-kritische Sub-Ops (Timeline/Emit) in `try/catch`.
- **Jede mutierende Action revalidiert die betroffene Route** (`/admin/ai-vorschlaege`).
- **UI-Strings mit echten Umlauten** (ä/ö/ü/ß). Design-Tokens `claimondo-*` + `primitives.Button`/`shared/SectionCard` — kein handgerolltes Button/Card-Markup, keine Inline-Hex.
- **Health-Check-Pattern:** `HealthCheck = { id, category, title, run(ctx) }` → `CheckResult = { status:'ok'|'warn'|'crit'|'error', metric?, detail, sampleIds? }`; Registrierung in `src/lib/health/checks/index.ts` (`ALL_CHECKS`). Pure Klassifikation exportiert + TDD.
- **Compliance (Art. 22 DSGVO, `datenschutz.md:343`):** Phase 1 schreibt NUR Vorschläge. Approve führt eine *interne* Task-Erzeugung aus (kein Art.-22-Einzelfall-Entscheid). Keine Auto-Ausführung.
- **`ziel_rolle` ist auf interne Ops-Rollen begrenzt:** `sachverstaendiger | kundenbetreuer | admin` (Validierungs-Guard in Task 4).
- **Modell:** `AI_MODELS.claim_orchestrator = 'claude-sonnet-4-6'`.
- **TDD:** Jede pure Funktion: Test zuerst, fehlschlagen sehen, minimal grün. DRY, YAGNI, häufige Commits.

---

## ⚠️ Schema-Verifikation (2026-07-05) — VERBINDLICH (überschreibt anderslautenden Task-Code)

Vor Ausführung wurde das Schema gegen Prod (`paizkjajbuxxksdoycev`) verifiziert. **Diese Korrekturen gelten und schlagen den ursprünglichen Task-Code:**

**(1) KEINE `v_claim_*`-Views im Orchestrator.** `v_claim_full`/`v_claim_phase` sind auth-gated (`auth.uid()`) und liefern für `service_role` (Cron ohne User) **0 Zeilen** (verifiziert: `claims`=20, `v_claim_full`=0, `v_claim_phase`=0). Der Orchestrator liest **ausschließlich Basis-Tabellen**.

**(2) Exakte Quellen (alle service_role-lesbar):**
- `claims` (by `id`): `id, status, operative_status, work_state, vehicle_id, updated_at, status_changed_at, created_at, ist_aktiv, abgeschlossen_am, prioritaet, fahrzeugschaden_beschreibung, sachschaden_beschreibung, hergang_kunde_text, kundenbetreuer_id, sv_id`
- `vehicles` (by `claims.vehicle_id`): `hersteller` (best-effort Fahrzeug-Name)
- `timeline` (Aktivität + Kurzverlauf): `.select('titel, created_at').or('claim_id.eq.<id>,fall_id.eq.<id>').order('created_at',{ascending:false}).limit(8)` — Timestamp ist **`created_at`**
- `tasks` (offene Tasks): `.select('titel, empfaenger_rolle, faellig_am').eq('fall_id', <claimId>).eq('status','offen')` — `fall_id` == `claims.id` (verifiziert)
- `cron_jobs_audit` (Health): Timestamp **`started_at`**, plus `status`, `error_message`, `job_name`

**(3) `isStagnant`-Signatur (Task 2) — phase-frei; Test entsprechend anpassen:**
```typescript
export const STAGNATION = { tageSchwelle: 5 } as const
export function isStagnant(
  row: { istAktiv: boolean; abgeschlossenAm: string | null; letzteAktivitaetAm: string | null },
  now: Date,
): boolean {
  if (!row.istAktiv || row.abgeschlossenAm) return false
  if (!row.letzteAktivitaetAm) return true
  return (now.getTime() - new Date(row.letzteAktivitaetAm).getTime()) / 86400000 >= STAGNATION.tageSchwelle
}
```
(Terminale-Phasen-Liste entfällt — Terminierung kommt aus `ist_aktiv`/`abgeschlossen_am`.)

**(4) Cron-Kandidaten-Query (Task 7) — Basis-Tabelle:**
```sql
select c.id, c.updated_at,
  (select max(t.created_at) from timeline t where t.claim_id = c.id or t.fall_id = c.id) as last_activity
from claims c
where c.ist_aktiv = true and c.abgeschlossen_am is null
```
Pro Zeile `isStagnant({ istAktiv:true, abgeschlossenAm:null, letzteAktivitaetAm: last_activity ?? updated_at }, new Date())` → nur für stagnierende `buildClaimContext` + `reviewClaim`. Cron loggt am Ende `cron_jobs_audit` mit `job_name='claim-orchestrator'` (für Task 9).

**(5) `ClaimContext.phase`** bleibt im Typ, befüllt aus `claims.operative_status ?? claims.status` (kein gated View). `summarizeClaimForPrompt` unverändert.

Betroffen: Tasks 2, 3, 6, 7, 9 (gegen diese Quellen schreiben). Tasks 1, 4, 5, 8 unverändert (FK `claims(id)` gültig; `tasks.fall_id==claims.id` für Task 8 bestätigt).

---

## File Structure

**Neu:**
- `src/lib/orchestrator/types.ts` — Typen (`ProposalTyp`, `ZielRolle`, `ClaimContext`, `ProposalDraft`, `AiProposal`).
- `src/lib/orchestrator/stagnation.ts` — pure `isStagnant` + `STAGNATION`-Config.
- `src/lib/orchestrator/context.ts` — `buildClaimContext` (DB) + pure `summarizeClaimForPrompt`.
- `src/lib/orchestrator/tools.ts` — Anthropic-Tool-Defs + pure `validateToolCall`.
- `src/lib/orchestrator/run.ts` — `reviewClaim` (Anthropic) + pure `extractProposalsFromToolUse`.
- `src/lib/orchestrator/proposals.ts` — pure `dedupeKey` + `persistProposals`/`listOpenProposals`/`decideProposal` (DB).
- `src/lib/health/checks/orchestrator-pipeline.ts` — pure `classifyOrchestratorHealth` + `HealthCheck`.
- `src/app/api/cron/claim-orchestrator/route.ts` — Cron-Trigger.
- `src/app/admin/ai-vorschlaege/page.tsx` + `AiVorschlaegeClient.tsx` + `actions.ts` — Admin-Surface.
- Tests neben jeder Logik-Datei (`*.test.ts`).

**Modifiziert:**
- `src/lib/ai/models.ts` — `claim_orchestrator`-Key ergänzen.
- `src/lib/health/checks/index.ts` — Check registrieren.
- `supabase/migrations/<V>_ai_claim_proposals.sql` — Migration-File (Name == getrackte Version).

---

### Task 1: Migration + Typen

**Files:**
- Migration (via `apply_migration`, name `ai_claim_proposals`), dann File: `supabase/migrations/<V>_ai_claim_proposals.sql`
- Create: `src/lib/orchestrator/types.ts`

**Interfaces:**
- Produces: `ProposalTyp = 'task'|'escalation'|'next_step'`; `ZielRolle = 'sachverstaendiger'|'kundenbetreuer'|'admin'`; `ClaimContext`, `ProposalDraft`, `AiProposal` (siehe unten).

- [ ] **Step 1: DDL via Plugin applizieren**

`apply_migration({ name: "ai_claim_proposals", query: <DDL> })` mit:

```sql
create table public.ai_claim_proposals (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  vorschlag_typ text not null check (vorschlag_typ in ('task','escalation','next_step')),
  ziel_rolle text check (ziel_rolle in ('sachverstaendiger','kundenbetreuer','admin')),
  payload jsonb not null default '{}'::jsonb,
  begruendung text not null,
  modell text not null,
  dedupe_key text not null,
  status text not null default 'offen' check (status in ('offen','angenommen','verworfen','bearbeitet')),
  entschieden_von uuid references auth.users(id),
  entschieden_am timestamptz,
  feedback text
);
create index ai_claim_proposals_claim_idx on public.ai_claim_proposals(claim_id);
create unique index ai_claim_proposals_dedupe_open_idx
  on public.ai_claim_proposals(dedupe_key) where status = 'offen';
alter table public.ai_claim_proposals enable row level security;
revoke all on public.ai_claim_proposals from anon, authenticated;
```

Begründung: RLS an + kein anon/authenticated-Grant → nur `service_role` (Admin-Surface liest via `createAdminClient` nach Admin-Guard). Partial-Unique-Index = Idempotenz (kein zweiter *offener* Vorschlag mit gleichem `dedupe_key`).

- [ ] **Step 2: Getrackte Version ablesen + File committen**

`list_migrations` → Version `<V>` ablesen → File `supabase/migrations/<V>_ai_claim_proposals.sql` mit exakt der DDL anlegen (Name == `<V>`). Twin-Drift vermeiden.

- [ ] **Step 3: Verifizieren (READ)**

`execute_sql("select column_name, data_type from information_schema.columns where table_name='ai_claim_proposals' order by ordinal_position")` → alle Spalten vorhanden.

- [ ] **Step 4: Typen anlegen**

`src/lib/orchestrator/types.ts`:

```typescript
// AI-Claim-Orchestrator — gemeinsame Typen (Phase-1-PoC).
export type ProposalTyp = 'task' | 'escalation' | 'next_step'
export type ZielRolle = 'sachverstaendiger' | 'kundenbetreuer' | 'admin'
export type TaskPrio = 'niedrig' | 'normal' | 'hoch'

/** Kompakter, prompt-tauglicher Fall-Kontext (aus buildClaimContext). */
export type ClaimContext = {
  claimId: string
  fallId: string | null
  status: string | null
  phase: string | null
  letzteAktivitaetAm: string | null // ISO
  tageInaktiv: number
  fahrzeug: string | null
  offeneTasks: Array<{ titel: string; rolle: string | null; faelligAm: string | null }>
  kurzverlauf: string[] // letzte Timeline-Titel, max 8
}

/** Ein vom Modell vorgeschlagener Schritt, vor Persistenz. */
export type ProposalDraft = {
  vorschlagTyp: ProposalTyp
  zielRolle: ZielRolle | null
  payload: Record<string, unknown> // z.B. { titel, beschreibung, prioritaet, faelligInTagen }
  begruendung: string
}

/** Persistierte Zeile (Subset für die UI). */
export type AiProposal = {
  id: string
  claim_id: string
  erstellt_am: string
  vorschlag_typ: ProposalTyp
  ziel_rolle: ZielRolle | null
  payload: Record<string, unknown>
  begruendung: string
  status: 'offen' | 'angenommen' | 'verworfen' | 'bearbeitet'
}
```

- [ ] **Step 5: tsc + Commit**

Run: `npx tsc --noEmit` → 0 Fehler. Dann:
```bash
git add supabase/migrations src/lib/orchestrator/types.ts
git commit -m "feat(orchestrator): ai_claim_proposals migration + core types"
```

---

### Task 2: Stagnations-Prädikat

**Files:**
- Create: `src/lib/orchestrator/stagnation.ts`
- Test: `src/lib/orchestrator/stagnation.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `STAGNATION = { tageSchwelle: number; terminalePhasen: string[] }`; `isStagnant(row: { phase: string | null; letzteAktivitaetAm: string | null }, now: Date): boolean`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { isStagnant, STAGNATION } from './stagnation'

const NOW = new Date('2026-07-05T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()

describe('isStagnant', () => {
  it('flaggt Fall ohne Aktivität über der Schwelle in offener Phase', () => {
    expect(isStagnant({ phase: 'begutachtung', letzteAktivitaetAm: daysAgo(6) }, NOW)).toBe(true)
  })
  it('flaggt NICHT wenn Aktivität jünger als Schwelle', () => {
    expect(isStagnant({ phase: 'begutachtung', letzteAktivitaetAm: daysAgo(2) }, NOW)).toBe(false)
  })
  it('flaggt NICHT in terminaler Phase, egal wie alt', () => {
    expect(isStagnant({ phase: STAGNATION.terminalePhasen[0], letzteAktivitaetAm: daysAgo(90) }, NOW)).toBe(false)
  })
  it('flaggt bei fehlender Aktivität (null) in offener Phase', () => {
    expect(isStagnant({ phase: 'begutachtung', letzteAktivitaetAm: null }, NOW)).toBe(true)
  })
})
```

- [ ] **Step 2: Verify fails**

Run: `npx vitest run src/lib/orchestrator/stagnation.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implement**

```typescript
// Welche Fälle „brauchen einen Blick": offene Phase + N Tage ohne Aktivität.
// Schwelle + terminale Phasen bewusst hier zentral (später DB-Config).
export const STAGNATION = {
  tageSchwelle: 5,
  terminalePhasen: ['fall_geschlossen', 'storniert', 'reguliert', 'abgelehnt'],
} as const

export function isStagnant(
  row: { phase: string | null; letzteAktivitaetAm: string | null },
  now: Date,
): boolean {
  if (row.phase && STAGNATION.terminalePhasen.includes(row.phase)) return false
  if (!row.letzteAktivitaetAm) return true
  const tage = (now.getTime() - new Date(row.letzteAktivitaetAm).getTime()) / 86400000
  return tage >= STAGNATION.tageSchwelle
}
```

- [ ] **Step 4: Verify passes**

Run: `npx vitest run src/lib/orchestrator/stagnation.test.ts` → PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestrator/stagnation.ts src/lib/orchestrator/stagnation.test.ts
git commit -m "feat(orchestrator): isStagnant Prädikat (5d + offene Phase)"
```

---

### Task 3: Context-Builder + Summarizer

**Files:**
- Create: `src/lib/orchestrator/context.ts`
- Test: `src/lib/orchestrator/context.test.ts`

**Interfaces:**
- Consumes: `ClaimContext` (Task 1).
- Produces: `buildClaimContext(claimId: string): Promise<ClaimContext | null>` (DB); `summarizeClaimForPrompt(ctx: ClaimContext): string` (pure).

**Hinweis für den Implementer:** Die exakten Spaltennamen der Claim-Projektion gegen `v_claim_full`/`v_claim_base` prüfen (Reader-Muster: `createAdminClient().from('v_claim_full').select(...).eq('id', claimId).maybeSingle()`). Offene Tasks: `from('tasks').select('titel, empfaenger_rolle, faellig_am').eq('fall_id', fallId).eq('status','offen')`. Kurzverlauf: die bestehende Fall-Event-Tabelle (die `logFallEvent` schreibt) nach `fall_id`, `order by erstellt_am desc limit 8`, nur `titel`. Fehlen Spalten, konservativ `null`/`[]` setzen — nie werfen.

- [ ] **Step 1: Failing test (nur Summarizer — pure)**

```typescript
import { describe, it, expect } from 'vitest'
import { summarizeClaimForPrompt } from './context'
import type { ClaimContext } from './types'

const ctx: ClaimContext = {
  claimId: 'c1', fallId: 'f1', status: 'in_bearbeitung', phase: 'begutachtung',
  letzteAktivitaetAm: '2026-06-29T00:00:00Z', tageInaktiv: 6,
  fahrzeug: 'VW Golf', offeneTasks: [{ titel: 'Gutachten prüfen', rolle: 'kundenbetreuer', faelligAm: null }],
  kurzverlauf: ['Fall angelegt', 'SV zugewiesen'],
}

describe('summarizeClaimForPrompt', () => {
  it('enthält Phase, Inaktivität, offene Tasks und Verlauf', () => {
    const s = summarizeClaimForPrompt(ctx)
    expect(s).toContain('begutachtung')
    expect(s).toContain('6')
    expect(s).toContain('Gutachten prüfen')
    expect(s).toContain('SV zugewiesen')
  })
  it('kommt mit leeren Tasks/Verlauf klar', () => {
    const s = summarizeClaimForPrompt({ ...ctx, offeneTasks: [], kurzverlauf: [] })
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Verify fails**

Run: `npx vitest run src/lib/orchestrator/context.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClaimContext } from './types'

export function summarizeClaimForPrompt(ctx: ClaimContext): string {
  const tasks = ctx.offeneTasks.length
    ? ctx.offeneTasks.map((t) => `- ${t.titel}${t.rolle ? ` (Rolle: ${t.rolle})` : ''}${t.faelligAm ? `, fällig ${t.faelligAm}` : ''}`).join('\n')
    : '- (keine offenen Tasks)'
  const verlauf = ctx.kurzverlauf.length ? ctx.kurzverlauf.map((v) => `- ${v}`).join('\n') : '- (kein Verlauf)'
  return [
    `Fall ${ctx.claimId} — Status: ${ctx.status ?? 'unbekannt'}, Phase: ${ctx.phase ?? 'unbekannt'}.`,
    `Fahrzeug: ${ctx.fahrzeug ?? 'unbekannt'}. Seit ${ctx.tageInaktiv} Tagen keine Aktivität.`,
    `Offene Tasks:\n${tasks}`,
    `Letzte Ereignisse:\n${verlauf}`,
  ].join('\n\n')
}

export async function buildClaimContext(claimId: string): Promise<ClaimContext | null> {
  const db = createAdminClient()
  const { data: claim } = await db.from('v_claim_full').select('*').eq('id', claimId).maybeSingle()
  if (!claim) return null
  const c = claim as Record<string, unknown>
  const fallId = (c.fall_id as string | null) ?? (c.id as string | null) ?? null

  const { data: tasks } = fallId
    ? await db.from('tasks').select('titel, empfaenger_rolle, faellig_am').eq('fall_id', fallId).eq('status', 'offen')
    : { data: [] as Array<Record<string, unknown>> }

  const { data: events } = fallId
    ? await db.from('fall_events').select('titel, erstellt_am').eq('fall_id', fallId).order('erstellt_am', { ascending: false }).limit(8)
    : { data: [] as Array<Record<string, unknown>> }

  const letzte = (events?.[0]?.erstellt_am as string | null) ?? (c.aktualisiert_am as string | null) ?? null
  const tageInaktiv = letzte ? Math.floor((Date.now() - new Date(letzte).getTime()) / 86400000) : 999

  return {
    claimId,
    fallId,
    status: (c.status as string | null) ?? null,
    phase: (c.phase as string | null) ?? null,
    letzteAktivitaetAm: letzte,
    tageInaktiv,
    fahrzeug: (c.fahrzeug_hersteller ? `${c.fahrzeug_hersteller} ${c.fahrzeug_modell ?? ''}`.trim() : null),
    offeneTasks: (tasks ?? []).map((t) => ({
      titel: (t.titel as string) ?? '', rolle: (t.empfaenger_rolle as string | null) ?? null, faelligAm: (t.faellig_am as string | null) ?? null,
    })),
    kurzverlauf: (events ?? []).map((e) => (e.titel as string) ?? '').filter(Boolean),
  }
}
```

**Hinweis:** `fall_events`, `v_claim_full`-Spaltennamen (`aktualisiert_am`, `fahrzeug_hersteller`, `fahrzeug_modell`, `phase`) gegen die DB verifizieren; abweichende Namen anpassen. `Date.now()` ist in Produktions-Code erlaubt (nur Workflow-Skripte verbieten es).

- [ ] **Step 4: Verify passes**

Run: `npx vitest run src/lib/orchestrator/context.test.ts` → PASS (2/2). Dann `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestrator/context.ts src/lib/orchestrator/context.test.ts
git commit -m "feat(orchestrator): buildClaimContext + summarizeClaimForPrompt"
```

---

### Task 4: Validierte Tool-Definitionen

**Files:**
- Create: `src/lib/orchestrator/tools.ts`
- Test: `src/lib/orchestrator/tools.test.ts`

**Interfaces:**
- Consumes: `ProposalDraft`, `ZielRolle` (Task 1).
- Produces: `ORCHESTRATOR_TOOLS` (Anthropic-Tool-Array); `validateToolCall(name: string, input: unknown): { ok: true; draft: ProposalDraft } | { ok: false; error: string }`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { validateToolCall, ORCHESTRATOR_TOOLS } from './tools'

describe('validateToolCall', () => {
  it('akzeptiert gültigen propose_task an erlaubte Rolle', () => {
    const r = validateToolCall('propose_task', { ziel_rolle: 'kundenbetreuer', titel: 'Kunde anrufen', begruendung: 'seit 6 Tagen still' })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.draft.vorschlagTyp).toBe('task'); expect(r.draft.zielRolle).toBe('kundenbetreuer') }
  })
  it('lehnt unerlaubte Rolle ab', () => {
    const r = validateToolCall('propose_task', { ziel_rolle: 'kunde', titel: 'x', begruendung: 'y' })
    expect(r.ok).toBe(false)
  })
  it('lehnt fehlenden Titel ab', () => {
    const r = validateToolCall('propose_task', { ziel_rolle: 'admin', begruendung: 'y' })
    expect(r.ok).toBe(false)
  })
  it('lehnt unbekanntes Tool ab', () => {
    const r = validateToolCall('drop_table', {})
    expect(r.ok).toBe(false)
  })
  it('exponiert die drei Tools an die API', () => {
    expect(ORCHESTRATOR_TOOLS.map((t) => t.name).sort()).toEqual(['flag_escalation', 'propose_task', 'suggest_next_step'])
  })
})
```

- [ ] **Step 2: Verify fails**

Run: `npx vitest run src/lib/orchestrator/tools.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import type { ProposalDraft } from './types'

const ROLLEN = ['sachverstaendiger', 'kundenbetreuer', 'admin'] as const
const PRIOS = ['niedrig', 'normal', 'hoch'] as const

const proposeTask = z.object({
  ziel_rolle: z.enum(ROLLEN),
  titel: z.string().min(3),
  beschreibung: z.string().optional(),
  prioritaet: z.enum(PRIOS).optional(),
  faellig_in_tagen: z.number().int().min(0).max(30).optional(),
  begruendung: z.string().min(3),
})
const flagEscalation = z.object({
  ziel_rolle: z.enum(ROLLEN),
  grund: z.string().min(3),
  begruendung: z.string().min(3),
})
const suggestNextStep = z.object({
  hinweis: z.string().min(3),
  begruendung: z.string().min(3),
})

export const ORCHESTRATOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_task',
    description: 'Schlage einen konkreten Task für eine interne Rolle vor (wird NICHT automatisch angelegt, ein Mensch entscheidet).',
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
    name: 'flag_escalation',
    description: 'Markiere den Fall als eskalationsbedürftig für eine Rolle.',
    input_schema: {
      type: 'object',
      properties: {
        ziel_rolle: { type: 'string', enum: [...ROLLEN] },
        grund: { type: 'string' },
        begruendung: { type: 'string' },
      },
      required: ['ziel_rolle', 'grund', 'begruendung'],
    },
  },
  {
    name: 'suggest_next_step',
    description: 'Formuliere einen unverbindlichen nächsten Schritt (ohne Rollen-Zuordnung).',
    input_schema: {
      type: 'object',
      properties: { hinweis: { type: 'string' }, begruendung: { type: 'string' } },
      required: ['hinweis', 'begruendung'],
    },
  },
]

export function validateToolCall(
  name: string,
  input: unknown,
): { ok: true; draft: ProposalDraft } | { ok: false; error: string } {
  if (name === 'propose_task') {
    const p = proposeTask.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    const { ziel_rolle, begruendung, ...rest } = p.data
    return { ok: true, draft: { vorschlagTyp: 'task', zielRolle: ziel_rolle, payload: rest, begruendung } }
  }
  if (name === 'flag_escalation') {
    const p = flagEscalation.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    return { ok: true, draft: { vorschlagTyp: 'escalation', zielRolle: p.data.ziel_rolle, payload: { grund: p.data.grund }, begruendung: p.data.begruendung } }
  }
  if (name === 'suggest_next_step') {
    const p = suggestNextStep.safeParse(input)
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'invalid' }
    return { ok: true, draft: { vorschlagTyp: 'next_step', zielRolle: null, payload: { hinweis: p.data.hinweis }, begruendung: p.data.begruendung } }
  }
  return { ok: false, error: `unbekanntes Tool: ${name}` }
}
```

- [ ] **Step 4: Verify passes**

Run: `npx vitest run src/lib/orchestrator/tools.test.ts` → PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestrator/tools.ts src/lib/orchestrator/tools.test.ts
git commit -m "feat(orchestrator): validierte Tool-Defs + validateToolCall (Rollen-Guard)"
```

---

### Task 5: Proposal-Persistenz + Dedup

**Files:**
- Create: `src/lib/orchestrator/proposals.ts`
- Test: `src/lib/orchestrator/proposals.test.ts`

**Interfaces:**
- Consumes: `ProposalDraft`, `AiProposal` (Task 1).
- Produces: `dedupeKey(claimId: string, d: ProposalDraft): string` (pure); `persistProposals(claimId, modell, drafts): Promise<number>`; `listOpenProposals(): Promise<AiProposal[]>`; `decideProposal(id, status, userId, feedback?): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Failing test (pure dedupeKey)**

```typescript
import { describe, it, expect } from 'vitest'
import { dedupeKey } from './proposals'
import type { ProposalDraft } from './types'

const draft: ProposalDraft = { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', payload: { titel: 'Kunde anrufen' }, begruendung: 'x' }

describe('dedupeKey', () => {
  it('ist stabil für gleichen Inhalt', () => {
    expect(dedupeKey('c1', draft)).toBe(dedupeKey('c1', draft))
  })
  it('unterscheidet nach Claim, Typ, Rolle und Kern-Payload', () => {
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c2', draft))
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c1', { ...draft, zielRolle: 'admin' }))
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c1', { ...draft, payload: { titel: 'Anderer Task' } }))
  })
  it('ignoriert die Begründung (nur Aktion zählt)', () => {
    expect(dedupeKey('c1', draft)).toBe(dedupeKey('c1', { ...draft, begruendung: 'andere Begründung' }))
  })
})
```

- [ ] **Step 2: Verify fails**

Run: `npx vitest run src/lib/orchestrator/proposals.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiProposal, ProposalDraft } from './types'

/** Stabiler Schlüssel: Claim + Typ + Rolle + Kern-Payload (ohne Begründung). */
export function dedupeKey(claimId: string, d: ProposalDraft): string {
  const kern = JSON.stringify({ c: claimId, t: d.vorschlagTyp, r: d.zielRolle ?? '', p: d.payload })
  return createHash('sha256').update(kern).digest('hex').slice(0, 32)
}

/** Schreibt Drafts als offene Vorschläge. Dedup via Partial-Unique-Index (offen).
 *  Kollision (bereits offener gleicher Vorschlag) → still übersprungen. */
export async function persistProposals(claimId: string, modell: string, drafts: ProposalDraft[]): Promise<number> {
  if (!drafts.length) return 0
  const db = createAdminClient()
  let count = 0
  for (const d of drafts) {
    const { error } = await db.from('ai_claim_proposals').insert({
      claim_id: claimId, vorschlag_typ: d.vorschlagTyp, ziel_rolle: d.zielRolle,
      payload: d.payload, begruendung: d.begruendung, modell, dedupe_key: dedupeKey(claimId, d),
    })
    if (!error) count++
    else if (!error.message.includes('duplicate key')) console.error('[orchestrator] persist failed:', error.message)
  }
  return count
}

export async function listOpenProposals(): Promise<AiProposal[]> {
  const db = createAdminClient()
  const { data } = await db.from('ai_claim_proposals')
    .select('id, claim_id, erstellt_am, vorschlag_typ, ziel_rolle, payload, begruendung, status')
    .eq('status', 'offen').order('erstellt_am', { ascending: false }).limit(200)
  return (data as AiProposal[] | null) ?? []
}

export async function decideProposal(
  id: string, status: 'angenommen' | 'verworfen' | 'bearbeitet', userId: string, feedback?: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient()
  const { error } = await db.from('ai_claim_proposals')
    .update({ status, entschieden_von: userId, entschieden_am: new Date().toISOString(), feedback: feedback ?? null })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

- [ ] **Step 4: Verify passes**

Run: `npx vitest run src/lib/orchestrator/proposals.test.ts` → PASS (3/3). Dann `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestrator/proposals.ts src/lib/orchestrator/proposals.test.ts
git commit -m "feat(orchestrator): Proposal-Persistenz + dedupeKey (Idempotenz)"
```

---

### Task 6: reviewClaim (Anthropic Tool-Use)

**Files:**
- Modify: `src/lib/ai/models.ts` (Key ergänzen)
- Create: `src/lib/orchestrator/run.ts`
- Test: `src/lib/orchestrator/run.test.ts`

**Interfaces:**
- Consumes: `summarizeClaimForPrompt` (T3), `ORCHESTRATOR_TOOLS`+`validateToolCall` (T4), `persistProposals` (T5), `ClaimContext`+`ProposalDraft` (T1).
- Produces: `extractProposalsFromToolUse(content: Anthropic.ContentBlock[]): ProposalDraft[]` (pure); `reviewClaim(ctx: ClaimContext): Promise<number>` (DB+API).

- [ ] **Step 1: Modell-Key ergänzen**

In `src/lib/ai/models.ts` im `AI_MODELS`-Objekt ergänzen:
```typescript
  /**
   * AI-Claim-Orchestrator (Phase-1-PoC): liest Fall-Kontext, schlägt via Tool-Use
   * den nächsten Schritt vor (Shadow-Mode). Judgment > Speed → Sonnet 4.6.
   */
  claim_orchestrator: 'claude-sonnet-4-6',
```

- [ ] **Step 2: Failing test (pure extractor)**

```typescript
import { describe, it, expect } from 'vitest'
import { extractProposalsFromToolUse } from './run'

describe('extractProposalsFromToolUse', () => {
  it('mappt gültige tool_use-Blöcke auf Drafts, überspringt Text + Ungültiges', () => {
    const blocks = [
      { type: 'text', text: 'denke nach' },
      { type: 'tool_use', name: 'propose_task', id: 't1', input: { ziel_rolle: 'kundenbetreuer', titel: 'Kunde anrufen', begruendung: 'still' } },
      { type: 'tool_use', name: 'propose_task', id: 't2', input: { ziel_rolle: 'kunde', titel: 'x', begruendung: 'y' } }, // ungültige Rolle
    ] as never[]
    const drafts = extractProposalsFromToolUse(blocks)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].vorschlagTyp).toBe('task')
  })
  it('gibt [] bei keinen tool_use-Blöcken', () => {
    expect(extractProposalsFromToolUse([{ type: 'text', text: 'x' }] as never[])).toEqual([])
  })
})
```

- [ ] **Step 3: Verify fails**

Run: `npx vitest run src/lib/orchestrator/run.test.ts` → FAIL.

- [ ] **Step 4: Implement**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import type { ClaimContext, ProposalDraft } from './types'
import { summarizeClaimForPrompt } from './context'
import { ORCHESTRATOR_TOOLS, validateToolCall } from './tools'
import { persistProposals } from './proposals'

const SYSTEM = `Du bist ein erfahrener Schaden-Ops-Manager bei einem deutschen KFZ-Gutachter-Dienst.
Dir wird ein STAGNIERENDER Fall gezeigt. Beurteile, was als Nächstes passieren sollte, um ihn voranzubringen.
Nutze die Tools, um konkrete Vorschläge zu machen — 0 bis 3 pro Fall. Wenn nichts sinnvoll ist, mache keinen Vorschlag.
Deine Vorschläge werden NICHT automatisch ausgeführt; ein Mensch entscheidet. Begründe jeden Vorschlag knapp und faktenbasiert aus dem Kontext.`

export function extractProposalsFromToolUse(content: Anthropic.ContentBlock[]): ProposalDraft[] {
  const out: ProposalDraft[] = []
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const r = validateToolCall(block.name, block.input)
    if (r.ok) out.push(r.draft)
  }
  return out
}

/** Reviewt einen Fall, persistiert die Vorschläge. Gibt Anzahl neuer Vorschläge zurück. */
export async function reviewClaim(ctx: ClaimContext): Promise<number> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = AI_MODELS.claim_orchestrator
  let res: Anthropic.Message
  try {
    res = await client.messages.create({
      model, max_tokens: 1024, system: SYSTEM, tools: ORCHESTRATOR_TOOLS,
      messages: [{ role: 'user', content: summarizeClaimForPrompt(ctx) }],
    })
  } catch (err) {
    console.error('[orchestrator] Anthropic-Call fehlgeschlagen:', err)
    return 0
  }
  try {
    await logAiUsage({ feature: 'claim_orchestrator', model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens })
  } catch { /* usage-log non-critical */ }
  const drafts = extractProposalsFromToolUse(res.content)
  return persistProposals(ctx.claimId, model, drafts)
}
```

**Hinweis:** `logAiUsage`-Signatur gegen `src/lib/ai/usage-log.ts` prüfen und Feld-Namen anpassen (feature/model/tokens). Bei abweichender Signatur den Aufruf angleichen — nie werfen lassen.

- [ ] **Step 5: Verify passes**

Run: `npx vitest run src/lib/orchestrator/run.test.ts` → PASS (2/2). Dann `npx tsc --noEmit` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/models.ts src/lib/orchestrator/run.ts src/lib/orchestrator/run.test.ts
git commit -m "feat(orchestrator): reviewClaim (Claude Tool-Use) + extractProposals + Modell-Key"
```

---

### Task 7: Cron-Trigger

**Files:**
- Create: `src/app/api/cron/claim-orchestrator/route.ts`

**Interfaces:**
- Consumes: `isStagnant`+`STAGNATION` (T2), `buildClaimContext` (T3), `reviewClaim` (T6).
- Produces: `GET`/`POST` Route-Handler (Bearer `CRON_SECRET`).

**Hinweis:** Muster von einem bestehenden Cron übernehmen (`src/app/api/cron/pipeline-health/route.ts`): gleicher Bearer-Auth-Guard + `log_cron_job_run`-RPC am Ende. Kandidaten-Query: aktive Fälle mit `phase NOT IN (terminale)` — die Feinauswahl macht `isStagnant` in JS (Single-Source der Schwelle).

- [ ] **Step 1: Implement**

```typescript
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStagnant, STAGNATION } from '@/lib/orchestrator/stagnation'
import { buildClaimContext } from '@/lib/orchestrator/context'
import { reviewClaim } from '@/lib/orchestrator/run'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()
  // Grobfilter in SQL, Feinauswahl via isStagnant. Spaltennamen ggf. an v_claim_full anpassen.
  const { data: claims } = await db
    .from('v_claim_full')
    .select('id, phase, aktualisiert_am')
    .not('phase', 'in', `(${STAGNATION.terminalePhasen.join(',')})`)
    .limit(500)

  let reviewed = 0
  let vorschlaege = 0
  for (const c of claims ?? []) {
    const row = { phase: (c.phase as string | null) ?? null, letzteAktivitaetAm: (c.aktualisiert_am as string | null) ?? null }
    if (!isStagnant(row, new Date())) continue
    const ctx = await buildClaimContext(c.id as string)
    if (!ctx) continue
    reviewed++
    try {
      vorschlaege += await reviewClaim(ctx)
    } catch (err) {
      console.error('[cron/claim-orchestrator] reviewClaim failed for', c.id, err)
    }
  }
  return NextResponse.json({ ok: true, reviewed, vorschlaege })
}
```

- [ ] **Step 2: Verify (Build)**

Run: `npm run build` → grün (Next.js validiert Route-Handler zur Build-Zeit; bei Routen-Änderung ist der volle Build Pflicht, nicht nur tsc).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/claim-orchestrator/route.ts
git commit -m "feat(orchestrator): Cron-Trigger (Bearer, stagnierende Fälle → reviewClaim)"
```

---

### Task 8: Admin-Surface (Vorschläge ansehen + entscheiden)

**Files:**
- Create: `src/app/admin/ai-vorschlaege/page.tsx`
- Create: `src/app/admin/ai-vorschlaege/AiVorschlaegeClient.tsx`
- Create: `src/app/admin/ai-vorschlaege/actions.ts`

**Interfaces:**
- Consumes: `listOpenProposals`+`decideProposal` (T5), `AiProposal` (T1), `createLinkedTask` (`src/lib/tasks/create-task.ts`).
- Produces: Server-Actions `annehmenVorschlag(id)` / `verwerfenVorschlag(id, feedback?)` → `{ ok, error? }`.

**Hinweis:** Admin-Auth-Guard nach bestehendem Muster (wie andere `src/app/admin/*`-Seiten: Rolle `admin` prüfen, sonst `redirect('/login')`). Button/Card aus `primitives`/`shared`. UI-Strings mit Umlauten.

- [ ] **Step 1: Server-Actions**

`actions.ts`:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decideProposal } from '@/lib/orchestrator/proposals'
import { createLinkedTask } from '@/lib/tasks/create-task'
import type { TaskPrioritaet } from '@/lib/tasks/types'

async function requireAdminUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  return profile?.rolle === 'admin' ? user.id : null
}

const PRIO_MAP: Record<string, TaskPrioritaet> = { niedrig: 'niedrig', normal: 'normal', hoch: 'hoch' }

export async function annehmenVorschlag(id: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }
  const db = createAdminClient()
  const { data: p } = await db.from('ai_claim_proposals')
    .select('claim_id, vorschlag_typ, ziel_rolle, payload').eq('id', id).maybeSingle()
  if (!p) return { ok: false, error: 'Vorschlag nicht gefunden' }

  // Nur 'task'-Vorschläge erzeugen echte Tasks; escalation/next_step werden nur als 'bearbeitet' markiert.
  if (p.vorschlag_typ === 'task') {
    const payload = (p.payload ?? {}) as { titel?: string; beschreibung?: string; prioritaet?: string; faellig_in_tagen?: number }
    const faellig = typeof payload.faellig_in_tagen === 'number'
      ? new Date(Date.now() + payload.faellig_in_tagen * 86400000) : undefined
    const { task_id } = await createLinkedTask({
      titel: payload.titel ?? 'AI-Vorschlag',
      beschreibung: payload.beschreibung,
      prioritaet: payload.prioritaet ? PRIO_MAP[payload.prioritaet] : undefined,
      empfaenger_rolle: (p.ziel_rolle as string | null) ?? undefined,
      fall_id: p.claim_id as string,
      faellig_am: faellig,
      trigger_event: 'ai_orchestrator_vorschlag',
    })
    if (!task_id) return { ok: false, error: 'Task-Erstellung fehlgeschlagen' }
  }
  const res = await decideProposal(id, p.vorschlag_typ === 'task' ? 'angenommen' : 'bearbeitet', userId)
  if (!res.ok) return res
  revalidatePath('/admin/ai-vorschlaege')
  return { ok: true }
}

export async function verwerfenVorschlag(id: string, feedback?: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }
  const res = await decideProposal(id, 'verworfen', userId, feedback)
  if (!res.ok) return res
  revalidatePath('/admin/ai-vorschlaege')
  return { ok: true }
}
```

**Hinweis:** `fall_id: p.claim_id` — Claim-ID vs. `fall_id` gegen `createLinkedTask`/Schema abgleichen (post-CMM-49 ist `claims` SSoT; falls `tasks.fall_id` weiterhin die Fall-Entität erwartet, das passende Feld setzen). `TaskPrioritaet`-Werte gegen `src/lib/tasks/types.ts` verifizieren.

- [ ] **Step 2: Page (Server Component, Admin-Guard)**

`page.tsx`:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listOpenProposals } from '@/lib/orchestrator/proposals'
import { AiVorschlaegeClient } from './AiVorschlaegeClient'

export default async function AiVorschlaegePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  if (profile?.rolle !== 'admin') redirect('/login')

  const vorschlaege = await listOpenProposals()
  return <AiVorschlaegeClient vorschlaege={vorschlaege} />
}
```

- [ ] **Step 3: Client (Liste + Annehmen/Verwerfen)**

`AiVorschlaegeClient.tsx` — Liste mit `shared/SectionCard` + `primitives.Button`; pro Vorschlag: Typ-Badge, Zielrolle, Payload-Titel, Begründung, zwei Buttons (`Annehmen`/`Verwerfen`) via `useTransition` + Toast. Alle Strings mit Umlauten. Leerzustand `shared/EmptyState` „Keine offenen KI-Vorschläge".

```typescript
'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives/Button'
import type { AiProposal } from '@/lib/orchestrator/types'
import { annehmenVorschlag, verwerfenVorschlag } from './actions'

export function AiVorschlaegeClient({ vorschlaege }: { vorschlaege: AiProposal[] }) {
  const [pending, start] = useTransition()
  if (!vorschlaege.length) {
    return <div className="p-6 text-claimondo-ondo">Keine offenen KI-Vorschläge.</div>
  }
  return (
    <div className="max-w-3xl mx-auto p-5 space-y-4">
      <h1 className="text-heading-md text-claimondo-navy">KI-Vorschläge</h1>
      {vorschlaege.map((v) => (
        <div key={v.id} className="bg-white rounded-ios-xl border border-claimondo-border p-4">
          <div className="text-caption uppercase text-claimondo-ondo">{v.vorschlag_typ}{v.ziel_rolle ? ` · ${v.ziel_rolle}` : ''}</div>
          <div className="font-semibold text-claimondo-navy mt-1">{String((v.payload as { titel?: string; hinweis?: string; grund?: string }).titel ?? (v.payload as { hinweis?: string }).hinweis ?? (v.payload as { grund?: string }).grund ?? '—')}</div>
          <p className="text-body-sm text-claimondo-ondo mt-1">{v.begruendung}</p>
          <div className="flex gap-2 mt-3">
            <Button loading={pending} onClick={() => start(async () => {
              const r = await annehmenVorschlag(v.id); r.ok ? toast.success('Angenommen') : toast.error(r.error ?? 'Fehler')
            })}>Annehmen</Button>
            <Button variant="secondary" loading={pending} onClick={() => start(async () => {
              const r = await verwerfenVorschlag(v.id); r.ok ? toast.success('Verworfen') : toast.error(r.error ?? 'Fehler')
            })}>Verwerfen</Button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Hinweis:** `primitives.Button`-Import-Pfad + `variant`-Werte gegen die echte Komponente prüfen. `text-heading-md`/`text-caption`/`rounded-ios-xl` sind Token-Foundation-Klassen (vorhanden).

- [ ] **Step 4: Verify (Build)**

Run: `npm run build` → grün. `npm run check:token-audit` + `check:component-set -- --ratchet` → 0 neue Verstöße.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/ai-vorschlaege
git commit -m "feat(orchestrator): Admin-Surface KI-Vorschläge (annehmen→createLinkedTask / verwerfen)"
```

---

### Task 9: Health-Check (Observability)

**Files:**
- Create: `src/lib/health/checks/orchestrator-pipeline.ts`
- Test: `src/lib/health/checks/orchestrator-pipeline.test.ts`
- Modify: `src/lib/health/checks/index.ts` (registrieren)

**Interfaces:**
- Consumes: `HealthCheck`/`CheckResult`/`CheckCtx` (`src/lib/health/types.ts`).
- Produces: `classifyOrchestratorHealth(stats): CheckResult` (pure); `orchestratorPipelineCheck: HealthCheck`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { classifyOrchestratorHealth } from './orchestrator-pipeline'

describe('classifyOrchestratorHealth', () => {
  it('ok bei gesundem Betrieb', () => {
    expect(classifyOrchestratorHealth({ offen: 5, letzterLaufVorStunden: 2, fehlerBeimLetztenLauf: false }).status).toBe('ok')
  })
  it('warn wenn seit >26h kein Lauf', () => {
    expect(classifyOrchestratorHealth({ offen: 0, letzterLaufVorStunden: 30, fehlerBeimLetztenLauf: false }).status).toBe('warn')
  })
  it('warn bei Rückstau offener Vorschläge (>50)', () => {
    expect(classifyOrchestratorHealth({ offen: 60, letzterLaufVorStunden: 1, fehlerBeimLetztenLauf: false }).status).toBe('warn')
  })
  it('crit bei Fehler im letzten Lauf', () => {
    expect(classifyOrchestratorHealth({ offen: 0, letzterLaufVorStunden: 1, fehlerBeimLetztenLauf: true }).status).toBe('crit')
  })
})
```

- [ ] **Step 2: Verify fails**

Run: `npx vitest run src/lib/health/checks/orchestrator-pipeline.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
import type { HealthCheck, CheckResult } from '../types'

export type OrchestratorStats = { offen: number; letzterLaufVorStunden: number; fehlerBeimLetztenLauf: boolean }

export function classifyOrchestratorHealth(s: OrchestratorStats): CheckResult {
  if (s.fehlerBeimLetztenLauf) {
    return { status: 'crit', metric: s.offen, detail: 'Letzter Orchestrator-Lauf meldete einen Fehler.' }
  }
  if (s.letzterLaufVorStunden > 26) {
    return { status: 'warn', metric: s.letzterLaufVorStunden, detail: `Seit ${Math.round(s.letzterLaufVorStunden)}h kein Orchestrator-Lauf.` }
  }
  if (s.offen > 50) {
    return { status: 'warn', metric: s.offen, detail: `${s.offen} offene KI-Vorschläge — Rückstau, niemand entscheidet.` }
  }
  return { status: 'ok', metric: s.offen, detail: `${s.offen} offene Vorschläge, letzter Lauf vor ${Math.round(s.letzterLaufVorStunden)}h.` }
}

export const orchestratorPipelineCheck: HealthCheck = {
  id: 'orchestrator-pipeline',
  category: 'cron',
  title: 'AI-Claim-Orchestrator',
  async run(ctx): Promise<CheckResult> {
    const { count: offen } = await ctx.supabase
      .from('ai_claim_proposals').select('id', { count: 'exact', head: true }).eq('status', 'offen')
    const { data: lauf } = await ctx.supabase
      .from('cron_jobs_audit').select('erstellt_am, status')
      .eq('job_name', 'claim-orchestrator').order('erstellt_am', { ascending: false }).limit(1).maybeSingle()
    const letzterLaufVorStunden = lauf?.erstellt_am
      ? (Date.now() - new Date(lauf.erstellt_am as string).getTime()) / 3600000 : 999
    return classifyOrchestratorHealth({
      offen: offen ?? 0, letzterLaufVorStunden, fehlerBeimLetztenLauf: (lauf?.status as string | null) === 'error',
    })
  },
}
```

**Hinweis:** Tabellen-/Spaltennamen des Cron-Audits (`cron_jobs_audit`, `job_name`, `erstellt_am`, `status`) gegen den bestehenden Health-Code prüfen (das `log_cron_job_run`-Muster). Der Cron aus Task 7 sollte am Ende denselben `log_cron_job_run`-RPC mit `job_name='claim-orchestrator'` rufen, damit dieser Check Daten hat.

- [ ] **Step 4: Registrieren**

In `src/lib/health/checks/index.ts` importieren + in `ALL_CHECKS` aufnehmen:
```typescript
import { orchestratorPipelineCheck } from './orchestrator-pipeline'
// ... in ALL_CHECKS = [ ..., orchestratorPipelineCheck ]
```

- [ ] **Step 5: Verify passes**

Run: `npx vitest run src/lib/health/checks/orchestrator-pipeline.test.ts` → PASS (4/4). Dann `npm run build` → grün.

- [ ] **Step 6: Commit**

```bash
git add src/lib/health/checks/orchestrator-pipeline.ts src/lib/health/checks/orchestrator-pipeline.test.ts src/lib/health/checks/index.ts
git commit -m "feat(orchestrator): Health-Check (Rückstau/Ausfall/Fehler) + Registrierung"
```

---

## Post-Implementation (nach allen Tasks)

- **Cron am VPS eintragen** (nicht Teil des Codes): stündlich oder täglich `claim-orchestrator` via `cron-call.sh` (Bearer `CRON_SECRET`), analog zu pipeline-health.
- **Prod-Smoke:** einen echten stagnierenden Test-Fall (nur Test-Account!) durch den Cron laufen lassen → prüfen, dass ein plausibler Vorschlag mit Begründung in `ai_claim_proposals` landet, im Admin-Surface erscheint, Annehmen einen Task via `createLinkedTask` erzeugt (korrekte Rolle/Auto-Assign), Verwerfen ihn schließt. NIE echte Kunden/Partner.
- **PR gegen `staging`**, vollständiger 7-Punkte-Audit im Commit-Body des finalen Merge/Review.

## Global Self-Review (Autor)

- **Spec-Abdeckung:** Shadow-Mode (T1,T5,T8) · Claude-entscheidet/Tools-führen-aus (T4,T6) · Task-Routing an Rollen (T4 Rollen-Guard, T8 createLinkedTask) · Cron-Trigger stagnierender Fälle (T2,T7) · Compliance human-in-loop (T8: nur Approve erzeugt Task) · Observability (T9). Konsolidierung (Filmcheck) ist bewusst Phase 3, nicht im PoC.
- **Platzhalter:** keine — jede Code-Datei vollständig; „Hinweise" verweisen auf exakte Dateien zur Signatur-Verifikation (existierender Code), kein TODO.
- **Typ-Konsistenz:** `ProposalDraft`/`ClaimContext`/`AiProposal` einmal in T1 definiert, in T3–T8 konsumiert; `validateToolCall`→`ProposalDraft`→`persistProposals`→`AiProposal`→UI durchgängig.
