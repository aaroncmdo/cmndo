# Wissen-Evergreen-Autopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der B2B-Wissen-Feed publiziert garantiert täglich Artikel — KI-autonom über den dormanten `ai_gap`-Pfad, mit optionalem manuellem Vorschlags-Inlet, ohne Kuratierpflicht.

**Architecture:** Ein neuer KI-Themen-Planer (`propose.ts`) füllt eine `ai_gap`-Themen-Queue in `wissen_themen`. Die Pipeline (`pipeline.ts`) generiert getiert (Crawl → Manuell → Evergreen) mit Boden `DAILY_MIN=2`/Deckel `DAILY_MAX=3` durch die bestehende `generateArtikelDraft → validateForAutoPublish → Insert`-Gate. Crawl-Pfad bleibt byte-identisch.

**Tech Stack:** TypeScript, Next.js 15, Supabase (service-role via `createAdminClient`), Anthropic SDK, Vitest.

## Global Constraints

- Server-Actions/lib: Result-Objekt `{ ok, error? }`, kein `throw` (AGENTS.md).
- UI-Strings Deutsch mit echten Umlauten (ä/ö/ü/ß).
- Design-Tokens: `text-claimondo-ondo`, `bg-claimondo-bg`, `rounded-ios-sm` etc. — keine Tailwind-Defaults/Hex.
- DDL nur via `mcp__plugin_supabase_supabase__apply_migration` (Regel 2), danach `list_migrations` → File exakt nach getrackter Version benennen.
- Modell: `WISSEN_MODEL` (aus `generate.ts`, = `claude-sonnet-4-6`) wiederverwenden.
- Crawl-Pfad (`generateArtikelDraft(_, 'b2b')`, `validateForAutoPublish`, Phase-1-Crawl) NICHT verändern (48 Bestandstests bleiben grün).
- Tests neben der Quelle: `src/lib/wissen/<name>.test.ts`. Lauf: `npx vitest run src/lib/wissen/<name>.test.ts`.

---

### Task 1: Pipeline-Plan Pure-Helfer

**Files:**
- Create: `src/lib/wissen/pipeline-plan.ts`
- Test: `src/lib/wissen/pipeline-plan.test.ts`

**Interfaces:**
- Produces:
  - `type PlanThema = { id: string; quelle: string; titel: string; kurzbrief: string | null; primary_keyword: string | null; cluster: string | null; artikel_typ: string | null; source_url: string | null; created_at: string }`
  - `orderCandidates(pools: { crawl: PlanThema[]; manuell: PlanThema[]; evergreen: PlanThema[] }): PlanThema[]`
  - `evergreenRefillCount(poolLen: number, target: number): number`
  - `shouldStopEvergreen(quelle: string, published: number, dailyMin: number): boolean`
  - `articleQuelleForThema(themaQuelle: string): 'crawl' | 'redaktion' | 'ai_gap'`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/wissen/pipeline-plan.test.ts
import { describe, it, expect } from 'vitest'
import {
  orderCandidates,
  evergreenRefillCount,
  shouldStopEvergreen,
  articleQuelleForThema,
  type PlanThema,
} from './pipeline-plan'

const t = (id: string, quelle: string): PlanThema => ({
  id, quelle, titel: id, kurzbrief: null, primary_keyword: null,
  cluster: null, artikel_typ: null, source_url: null, created_at: '2026-07-06',
})

describe('orderCandidates', () => {
  it('ordnet Crawl vor Manuell vor Evergreen', () => {
    const order = orderCandidates({
      crawl: [t('c1', 'crawl')],
      manuell: [t('m1', 'manuell')],
      evergreen: [t('e1', 'ai_gap'), t('e2', 'ai_gap')],
    })
    expect(order.map((x) => x.id)).toEqual(['c1', 'm1', 'e1', 'e2'])
  })
  it('leere Pools ergeben leere Reihenfolge', () => {
    expect(orderCandidates({ crawl: [], manuell: [], evergreen: [] })).toEqual([])
  })
})

describe('evergreenRefillCount', () => {
  it('füllt bis zum Target auf', () => {
    expect(evergreenRefillCount(1, 6)).toBe(5)
  })
  it('nie negativ (Pool über Target)', () => {
    expect(evergreenRefillCount(8, 6)).toBe(0)
  })
})

describe('shouldStopEvergreen', () => {
  it('stoppt Evergreen wenn Boden erreicht', () => {
    expect(shouldStopEvergreen('ai_gap', 2, 2)).toBe(true)
  })
  it('läuft weiter solange unter Boden', () => {
    expect(shouldStopEvergreen('ai_gap', 1, 2)).toBe(false)
  })
  it('stoppt nie für Crawl/Manuell', () => {
    expect(shouldStopEvergreen('crawl', 5, 2)).toBe(false)
    expect(shouldStopEvergreen('manuell', 5, 2)).toBe(false)
  })
})

describe('articleQuelleForThema', () => {
  it('mappt Provenienz', () => {
    expect(articleQuelleForThema('crawl')).toBe('crawl')
    expect(articleQuelleForThema('manuell')).toBe('redaktion')
    expect(articleQuelleForThema('ai_gap')).toBe('ai_gap')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/wissen/pipeline-plan.test.ts`
Expected: FAIL — `Cannot find module './pipeline-plan'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/wissen/pipeline-plan.ts
// Reine Entscheidungs-Helfer für die getierte B2B-Pipeline. Kein IO — unit-testbar.

export type PlanThema = {
  id: string
  quelle: string
  titel: string
  kurzbrief: string | null
  primary_keyword: string | null
  cluster: string | null
  artikel_typ: string | null
  source_url: string | null
  created_at: string
}

/** Priorität: Crawl (tagesaktuell) → Manuell (Aarons Vorschläge) → Evergreen (Boden). */
export function orderCandidates(pools: {
  crawl: PlanThema[]
  manuell: PlanThema[]
  evergreen: PlanThema[]
}): PlanThema[] {
  return [...pools.crawl, ...pools.manuell, ...pools.evergreen]
}

/** Wie viele frische Evergreen-Themen proponieren, um die Queue auf `target` zu bringen. */
export function evergreenRefillCount(poolLen: number, target: number): number {
  return Math.max(0, target - poolLen)
}

/** Evergreen nur bis zum Tages-Boden ziehen — nicht überpublizieren. */
export function shouldStopEvergreen(quelle: string, published: number, dailyMin: number): boolean {
  return quelle === 'ai_gap' && published >= dailyMin
}

/** Themen-Provenienz → Artikel-quelle (Constraint: redaktion|crawl|ai_gap). */
export function articleQuelleForThema(themaQuelle: string): 'crawl' | 'redaktion' | 'ai_gap' {
  if (themaQuelle === 'crawl') return 'crawl'
  if (themaQuelle === 'manuell') return 'redaktion'
  return 'ai_gap'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/wissen/pipeline-plan.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wissen/pipeline-plan.ts src/lib/wissen/pipeline-plan.test.ts
git commit -m "feat(wissen): pipeline-plan pure helpers (order/refill/stop/quelle-map) — TDD"
```

---

### Task 2: Themen-Planer — Pure-Teile (Parse/Dedupe/Prompt)

**Files:**
- Create: `src/lib/wissen/propose.ts`
- Test: `src/lib/wissen/propose.test.ts`

**Interfaces:**
- Consumes: `WISSEN_MODEL` from `./generate`.
- Produces:
  - `type ProposedTopic = { titel: string; kurzbrief: string; primary_keyword: string; cluster: string; artikel_typ?: string; tags?: string[] }`
  - `buildProposeSystemPrompt(): string`
  - `buildProposeUserMessage(count: number, covered: { titles: string[]; keywords: string[] }): string`
  - `normalizeKeyword(kw: string): string`
  - `parseProposedTopics(raw: string): { ok: true; data: ProposedTopic[] } | { ok: false; error: string }`
  - `dedupeTopics(proposed: ProposedTopic[], coveredKeywords: string[]): ProposedTopic[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/wissen/propose.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildProposeSystemPrompt,
  buildProposeUserMessage,
  normalizeKeyword,
  parseProposedTopics,
  dedupeTopics,
  type ProposedTopic,
} from './propose'

const topic = (kw: string): ProposedTopic => ({
  titel: `Titel ${kw}`, kurzbrief: 'Fach-Angle mit zwei Sätzen zur Faktengrundlage. Mehr Kontext.',
  primary_keyword: kw, cluster: 'Schadenregulierung',
})

describe('buildProposeSystemPrompt', () => {
  it('nennt die Domäne und schließt Off-Topic aus', () => {
    const p = buildProposeSystemPrompt()
    expect(p).toMatch(/Schadenregulierung|Schadengutachten/)
    expect(p).toMatch(/Motorsport/) // Ausschluss genannt
    expect(p).toMatch(/JSON/) // Antwortformat
  })
})

describe('buildProposeUserMessage', () => {
  it('bittet um count Themen und listet Abgedecktes zum Ausweichen', () => {
    const m = buildProposeUserMessage(3, { titles: ['Nutzungsausfall'], keywords: ['wertminderung'] })
    expect(m).toMatch(/3/)
    expect(m).toMatch(/Nutzungsausfall/)
    expect(m).toMatch(/wertminderung/)
  })
})

describe('normalizeKeyword', () => {
  it('trimmt + lowercased', () => {
    expect(normalizeKeyword('  Wertminderung ')).toBe('wertminderung')
  })
})

describe('parseProposedTopics', () => {
  it('parst ein sauberes JSON-Array', () => {
    const raw = JSON.stringify([topic('a'), topic('b')])
    const r = parseProposedTopics(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toHaveLength(2)
  })
  it('toleriert Code-Fences und Einleitungstext', () => {
    const raw = 'Hier die Themen:\n```json\n' + JSON.stringify([topic('a')]) + '\n```'
    const r = parseProposedTopics(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data[0].primary_keyword).toBe('a')
  })
  it('filtert Items ohne Pflichtfelder heraus', () => {
    const raw = JSON.stringify([topic('a'), { titel: 'x' }])
    const r = parseProposedTopics(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toHaveLength(1)
  })
  it('Fehler wenn kein Array gefunden', () => {
    expect(parseProposedTopics('kein json hier').ok).toBe(false)
  })
})

describe('dedupeTopics', () => {
  it('droppt Kollisionen (case-insensitive) und interne Duplikate', () => {
    const out = dedupeTopics([topic('Wertminderung'), topic('neu'), topic('neu')], ['wertminderung'])
    expect(out.map((t) => t.primary_keyword)).toEqual(['neu'])
  })
  it('droppt leere Keywords', () => {
    expect(dedupeTopics([{ ...topic(''), primary_keyword: '' }], [])).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/wissen/propose.test.ts`
Expected: FAIL — `Cannot find module './propose'`.

- [ ] **Step 3: Write minimal implementation** (pure parts only; API-Call in Task 3)

```ts
// src/lib/wissen/propose.ts
// Wissen-Themen-Planer: KI schlägt net-new B2B-Evergreen-Themen vor (coverage-aware).
// Pure Teile (Prompt/Parse/Dedupe) hier unit-getestet; der Anthropic-Call in proposeGapTopics.

import Anthropic from '@anthropic-ai/sdk'
import { WISSEN_MODEL } from '@/lib/wissen/generate'

export type ProposedTopic = {
  titel: string
  kurzbrief: string
  primary_keyword: string
  cluster: string
  artikel_typ?: string
  tags?: string[]
}

export function buildProposeSystemPrompt(): string {
  return [
    'Du bist Themen-Planer für den B2B-Fach-Feed von claimondo.de (Kfz-Schadenregulierung).',
    'Schlage NEUE Evergreen-Fachthemen vor für Kfz-Sachverständige, Anwälte/Kanzleien, Werkstätten und Versicherungsmakler.',
    'DOMÄNE (nur daraus): Schadengutachten, Fahrzeugbewertung (Wiederbeschaffungswert/Restwert/Wertminderung),',
    '  Unfallregulierung, Verkehrs-/Schadenrecht (§§ BGB/StVG), Werkstatt-/Reparaturpraxis, Kasko-/Haftpflicht-Schaden,',
    '  Nutzungsausfall/Mietwagen, SV-Berufspraxis.',
    'NICHT vorschlagen: Motorsport/Rennsport, Neuwagen-/Händler-/E-Mobilitäts-News, Personalien/Nachrufe/Verbands-Termine,',
    '  reine Lebens-/Kranken-/Rentenversicherung, themenfremdes Recht (Politik/Steuer/Immobilien/Medien/Strafrecht).',
    'Bereits abgedeckte Themen NICHT wiederholen — gehe stattdessen spezifischer/long-tail.',
    '',
    'ANTWORTFORMAT: ausschließlich ein JSON-Array, sonst nichts. Jedes Element:',
    '{ "titel": "<Fach-Titel>", "kurzbrief": "<2-3 Sätze Fach-Angle als Faktengrundlage>",',
    '  "primary_keyword": "<Haupt-Keyword>", "cluster": "<Themen-Cluster>",',
    '  "artikel_typ": "<z.B. Ratgeber, Analyse, FAQ>", "tags": ["<0-3 Tags>"] }',
  ].join('\n')
}

export function buildProposeUserMessage(
  count: number,
  covered: { titles: string[]; keywords: string[] },
): string {
  const titles = covered.titles.slice(0, 120).join(' | ') || '(keine)'
  const keywords = covered.keywords.slice(0, 120).join(', ') || '(keine)'
  return [
    `Schlage ${count} distinkte, neue B2B-Evergreen-Themen vor.`,
    'Bereits abgedeckte Titel (NICHT wiederholen):',
    titles,
    'Bereits abgedeckte Keywords (NICHT wiederholen):',
    keywords,
    `Antworte mit einem JSON-Array von genau ${count} Objekten.`,
  ].join('\n')
}

export function normalizeKeyword(kw: string): string {
  return kw.trim().toLowerCase()
}

function extractJsonArray(text: string): unknown {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch?.[1] ?? trimmed
  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start < 0 || end < 0 || end <= start) throw new Error('Kein JSON-Array')
  return JSON.parse(candidate.slice(start, end + 1))
}

function isValidTopic(x: unknown): x is ProposedTopic {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.titel === 'string' && o.titel.length > 0 &&
    typeof o.kurzbrief === 'string' && o.kurzbrief.length > 0 &&
    typeof o.primary_keyword === 'string' && o.primary_keyword.length > 0 &&
    typeof o.cluster === 'string' && o.cluster.length > 0
  )
}

export function parseProposedTopics(
  raw: string,
): { ok: true; data: ProposedTopic[] } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = extractJsonArray(raw)
  } catch {
    return { ok: false, error: 'Kein JSON-Array in Response' }
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'Antwort ist kein Array' }
  const data = parsed.filter(isValidTopic).map((o) => ({
    titel: o.titel,
    kurzbrief: o.kurzbrief,
    primary_keyword: o.primary_keyword,
    cluster: o.cluster,
    artikel_typ: typeof o.artikel_typ === 'string' ? o.artikel_typ : undefined,
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : undefined,
  }))
  return { ok: true, data }
}

export function dedupeTopics(proposed: ProposedTopic[], coveredKeywords: string[]): ProposedTopic[] {
  const seen = new Set(coveredKeywords.map(normalizeKeyword))
  const out: ProposedTopic[] = []
  for (const t of proposed) {
    const k = normalizeKeyword(t.primary_keyword)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}
```

Note: `Anthropic` + `WISSEN_MODEL` are imported now but used in Task 3 (`proposeGapTopics`). If lint flags unused before Task 3, add Task 3 in the same commit cycle.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/wissen/propose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wissen/propose.ts src/lib/wissen/propose.test.ts
git commit -m "feat(wissen): Themen-Planer pure Teile (prompt/parse/dedupe) — TDD"
```

---

### Task 3: Themen-Planer — Anthropic-Call `proposeGapTopics`

**Files:**
- Modify: `src/lib/wissen/propose.ts` (append)

**Interfaces:**
- Consumes: `buildProposeSystemPrompt`, `buildProposeUserMessage`, `parseProposedTopics`, `dedupeTopics` (Task 2); `WISSEN_MODEL`.
- Produces: `proposeGapTopics(count: number, covered: { titles: string[]; keywords: string[] }): Promise<{ ok: true; data: ProposedTopic[] } | { ok: false; error: string }>`

- [ ] **Step 1: Append implementation** (no unit test — Anthropic-Call wird per Prod-Smoke verifiziert, Muster wie `generateArtikelDraft`)

```ts
// src/lib/wissen/propose.ts  (am Ende anhängen)

export async function proposeGapTopics(
  count: number,
  covered: { titles: string[]; keywords: string[] },
): Promise<{ ok: true; data: ProposedTopic[] } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY nicht konfiguriert' }

  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 })
  try {
    const response = await anthropic.messages.create({
      model: WISSEN_MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: buildProposeSystemPrompt(), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildProposeUserMessage(count, covered) }],
    })
    const firstBlock = response.content[0]
    const raw = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''
    const parsed = parseProposedTopics(raw)
    if (!parsed.ok) return parsed
    return { ok: true, data: dedupeTopics(parsed.data, covered.keywords) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Anthropic-API-Fehler: ${msg}` }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` (oder projektweit). Expected: keine neuen Fehler in `propose.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/wissen/propose.ts
git commit -m "feat(wissen): proposeGapTopics — Anthropic-Call für Themen-Planer"
```

---

### Task 4: DB-Migration — `wissen_artikel.quelle` += `ai_gap`

**Files:**
- Create: `supabase/migrations/<V>_wissen_artikel_quelle_ai_gap.sql` (Version `<V>` vom Plugin)

**Interfaces:** ermöglicht `INSERT wissen_artikel (quelle='ai_gap')` in Task 5.

- [ ] **Step 1: Migration via Plugin anwenden**

Tool: `mcp__plugin_supabase_supabase__apply_migration`
- `name`: `wissen_artikel_quelle_ai_gap`
- `query`:
```sql
ALTER TABLE public.wissen_artikel DROP CONSTRAINT wissen_artikel_quelle_check;
ALTER TABLE public.wissen_artikel ADD CONSTRAINT wissen_artikel_quelle_check
  CHECK (quelle = ANY (ARRAY['redaktion'::text, 'crawl'::text, 'ai_gap'::text]));
```

- [ ] **Step 2: Getrackte Version ablesen**

Tool: `mcp__plugin_supabase_supabase__list_migrations` → neueste Version `<V>` notieren.

- [ ] **Step 3: Verifizieren (READ)**

Tool: `mcp__plugin_supabase_supabase__execute_sql`
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'wissen_artikel_quelle_check';
```
Expected: enthält `ai_gap`.

- [ ] **Step 4: Migration-File committen** (Dateiname == `<V>`)

```bash
# Datei-Inhalt = das DDL aus Step 1
git add supabase/migrations/<V>_wissen_artikel_quelle_ai_gap.sql
git commit -m "feat(wissen): Migration — wissen_artikel.quelle erlaubt ai_gap (additiv)"
```

---

### Task 5: Pipeline — getierte Generierung mit Boden + Evergreen-Auffüllung

**Files:**
- Modify: `src/lib/wissen/pipeline.ts` (Phase 2/3 ersetzen; Phase-1-Crawl unverändert lassen; neue Imports + Konstanten + Helfer)

**Interfaces:**
- Consumes: `orderCandidates`, `evergreenRefillCount`, `shouldStopEvergreen`, `articleQuelleForThema`, `PlanThema` (Task 1); `proposeGapTopics`, `ProposedTopic` (Task 2/3); bestehende `generateArtikelDraft`, `validateForAutoPublish`, `createAdminClient`.
- Produces: unveränderte Signatur `runB2BPipeline(): Promise<{ ok; crawled; generated; published; review; error? }>`.

- [ ] **Step 1: Imports + Konstanten ergänzen**

Oben in `pipeline.ts` ergänzen:
```ts
import { proposeGapTopics } from '@/lib/wissen/propose'
import {
  orderCandidates,
  evergreenRefillCount,
  shouldStopEvergreen,
  articleQuelleForThema,
  type PlanThema,
} from '@/lib/wissen/pipeline-plan'
```
Konstanten (ersetze `GENERATE_LIMIT`-Block):
```ts
const CRAWL_CAP = 12
const PER_SOURCE_CAP = 3
const DAILY_MAX = 3 // max. erzeugte Artikel/Lauf (Deckel, = altes GENERATE_LIMIT)
const DAILY_MIN = 2 // garantierter Tages-Boden (via Evergreen aufgefüllt)
const ATTEMPT_CAP = 12
const EVERGREEN_TARGET = 6 // Vorrats-Queue voraus (>= DAILY_MIN → sichtbares Veto-Fenster)
```

- [ ] **Step 2: Zwei Helfer VOR `runB2BPipeline` einfügen**

```ts
type Db = ReturnType<typeof createAdminClient>

/** Titel + primary_keyword aller Artikel + offener ai_gap/manuell-Themen — für Coverage-Avoidance. */
async function ladeCovered(supabase: Db): Promise<{ titles: string[]; keywords: string[] }> {
  const titles: string[] = []
  const keywords: string[] = []
  const { data: artikel } = await supabase
    .from('wissen_artikel')
    .select('title, primary_keyword')
    .eq('audience', 'b2b')
    .limit(500)
  for (const a of artikel ?? []) {
    if (a.title) titles.push(a.title)
    if (a.primary_keyword) keywords.push(a.primary_keyword)
  }
  const { data: themen } = await supabase
    .from('wissen_themen')
    .select('titel, primary_keyword')
    .eq('audience', 'b2b')
    .in('status', ['freigegeben', 'entwurf_erstellt'])
    .limit(500)
  for (const t of themen ?? []) {
    if (t.titel) titles.push(t.titel)
    if (t.primary_keyword) keywords.push(t.primary_keyword)
  }
  return { titles, keywords }
}

/** Proponiert `count` Evergreen-Themen und legt sie als ai_gap/freigegeben an. Gibt die neuen Zeilen zurück. */
async function proposeUndInsert(supabase: Db, count: number): Promise<PlanThema[]> {
  if (count <= 0) return []
  const covered = await ladeCovered(supabase)
  const r = await proposeGapTopics(count, covered)
  if (!r.ok) {
    console.error('[b2b-pipeline] proposeGapTopics fehlgeschlagen:', r.error)
    return []
  }
  const inserted: PlanThema[] = []
  for (const topic of r.data) {
    const { data, error } = await supabase
      .from('wissen_themen')
      .insert({
        titel: topic.titel,
        kurzbrief: topic.kurzbrief,
        begruendung: null,
        audience: 'b2b',
        quelle: 'ai_gap',
        primary_keyword: topic.primary_keyword,
        cluster: topic.cluster,
        artikel_typ: topic.artikel_typ ?? null,
        status: 'freigegeben',
      })
      .select('id, titel, kurzbrief, primary_keyword, cluster, artikel_typ, source_url, quelle, created_at')
      .single()
    if (error) {
      console.error('[b2b-pipeline] ai_gap-Thema-Insert fehlgeschlagen:', error.message)
      continue
    }
    if (data) inserted.push(data as PlanThema)
  }
  return inserted
}
```

- [ ] **Step 3: Phase 2/3 ersetzen** (alles ab `// Phase 2+3` bis zum `return { ok: true, ... }` durch das folgende ersetzen; Phase-1-Crawl-Block darüber unverändert)

```ts
    // -----------------------------------------------------------------------
    // Phase 2: Generate (getiert mit Boden), Validate, Insert Artikel
    // -----------------------------------------------------------------------

    const { data: kandidaten, error: themenErr } = await supabase
      .from('wissen_themen')
      .select('id, titel, kurzbrief, primary_keyword, cluster, artikel_typ, source_url, quelle, created_at')
      .eq('audience', 'b2b')
      .eq('status', 'freigegeben')
      .order('created_at', { ascending: false })
      .limit(40)

    if (themenErr) {
      console.error('[b2b-pipeline] Themen-Query fehlgeschlagen:', themenErr.message)
      return { ok: true, crawled, generated, published, review }
    }

    const kandidatenIds = (kandidaten ?? []).map((t) => t.id)
    let belegteSet = new Set<string>()
    if (kandidatenIds.length > 0) {
      const { data: belegteThemen, error: belegteErr } = await supabase
        .from('wissen_artikel')
        .select('thema_id')
        .in('thema_id', kandidatenIds)
      if (belegteErr) {
        console.error('[b2b-pipeline] Belegte-Themen-Query fehlgeschlagen:', belegteErr.message)
        return { ok: true, crawled, generated, published, review }
      }
      belegteSet = new Set(
        (belegteThemen ?? [])
          .map((r: { thema_id: string | null }) => r.thema_id)
          .filter((id): id is string => id !== null),
      )
    }

    const offen = ((kandidaten ?? []) as PlanThema[]).filter((t) => !belegteSet.has(t.id))
    const byDesc = (a: PlanThema, b: PlanThema) => (a.created_at < b.created_at ? 1 : -1)
    const byAsc = (a: PlanThema, b: PlanThema) => (a.created_at < b.created_at ? -1 : 1)
    const crawlPool = offen.filter((t) => t.quelle === 'crawl').sort(byDesc)
    const manuellPool = offen.filter((t) => t.quelle === 'manuell').sort(byAsc)
    let evergreenPool = offen.filter((t) => t.quelle === 'ai_gap').sort(byAsc)

    // Evergreen-Queue auffüllen (deckt Boden UND hält Vorrat voraus → Veto-Fenster).
    const refill = evergreenRefillCount(evergreenPool.length, EVERGREEN_TARGET)
    if (refill > 0) {
      const neu = await proposeUndInsert(supabase, refill)
      evergreenPool = [...evergreenPool, ...neu] // hinten anhängen (FIFO-Konsum von vorne)
    }

    const order = orderCandidates({ crawl: crawlPool, manuell: manuellPool, evergreen: evergreenPool })

    let attempts = 0
    for (const thema of order) {
      if (generated >= DAILY_MAX || attempts >= ATTEMPT_CAP) break
      if (shouldStopEvergreen(thema.quelle, published, DAILY_MIN)) break
      attempts++

      const r = await generateArtikelDraft(
        {
          titel: thema.titel,
          kurzbrief: thema.kurzbrief ?? undefined,
          primary_keyword: thema.primary_keyword ?? undefined,
          cluster: thema.cluster ?? undefined,
          artikel_typ: thema.artikel_typ ?? undefined,
        },
        'b2b',
      )

      if (!r.ok) {
        if (r.error === 'nicht_relevant') {
          await supabase.from('wissen_themen').update({ status: 'abgelehnt' }).eq('id', thema.id)
        }
        console.error(`[b2b-pipeline] generateArtikelDraft fehlgeschlagen (thema ${thema.id}):`, r.error)
        continue
      }

      const draft = r.data
      const v = validateForAutoPublish({ body: draft.body })
      const now = new Date().toISOString()
      const artikelStatus = v.autopublish ? 'veroeffentlicht' : 'in_review'
      const artikelQuelle = articleQuelleForThema(thema.quelle)

      async function insertArtikel(slug: string): Promise<{ error: { code: string; message: string } | null }> {
        return supabase.from('wissen_artikel').insert({
          thema_id: thema.id,
          slug,
          title: draft.title,
          body: draft.body,
          excerpt: draft.excerpt,
          key_facts: draft.keyFacts,
          meta_description: draft.metaDescription,
          primary_keyword: draft.primaryKeyword,
          cluster: draft.cluster,
          tags: draft.tags,
          audience: 'b2b',
          quelle: artikelQuelle,
          source_url: thema.source_url,
          author: 'claimondo-redaktion',
          ai_model: draft.ai_model,
          ai_generated: true,
          status: artikelStatus,
          veroeffentlicht_am: v.autopublish ? now : null,
        })
      }

      let insertResult = await insertArtikel(draft.slug)
      if (insertResult.error?.code === '23505') {
        insertResult = await insertArtikel(`${draft.slug.slice(0, 78)}-2`)
      }
      if (insertResult.error) {
        console.error(`[b2b-pipeline] Artikel-Insert fehlgeschlagen (thema ${thema.id}):`, insertResult.error.message)
        continue
      }

      generated++
      if (v.autopublish) published++
      else review++

      const { error: themaUpdateErr } = await supabase
        .from('wissen_themen')
        .update({ status: 'entwurf_erstellt' })
        .eq('id', thema.id)
      if (themaUpdateErr) {
        console.error(`[b2b-pipeline] Thema-Status-Update fehlgeschlagen (thema ${thema.id}):`, themaUpdateErr.message)
      }
    }

    return { ok: true, crawled, generated, published, review }
```

- [ ] **Step 4: Bestandstests + Typecheck grün**

Run: `npx vitest run src/lib/wissen` → 48+ bestehende + neue Tests grün.
Run: `npx tsc --noEmit` → keine neuen Fehler.
Expected: beide grün. (Crawl-Pfad-Tests `generate/validate/relevance/rss` unverändert.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/wissen/pipeline.ts
git commit -m "feat(wissen): getierte Pipeline (Crawl->Manuell->Evergreen) mit Tages-Boden + KI-Auffüllung"
```

---

### Task 6: Bessere Feeds — Verkehrs-/Schadenrecht ergänzen

**Files:**
- Modify: `src/lib/wissen/crawl/sources.ts` (Einträge zu `B2B_CRAWL_SOURCES` hinzufügen)

- [ ] **Step 1: Kandidaten-Feeds live verifizieren**

Run (je URL, HTTP 200 + on-topic Titel prüfen):
```bash
for u in \
  "https://www.kostenlose-urteile.de/rss/verkehrsrecht.rss" \
  "https://www.captain-huk.de/feed/" \
  "https://anwaltauskunft.de/magazin/verkehr/feed" \
  "https://www.ra-kotz.de/feed"; do
  echo "== $u =="; curl -sSL --max-time 25 -A "Mozilla/5.0" "$u" | grep -oiE "<title>[^<]*</title>" | head -6; done
```
Übernimm NUR Feeds, die HTTP 200 + parsebare Items mit Kfz-Schaden/Verkehrsrecht-Bezug liefern. (Tote/Off-Topic-Feeds weglassen — `crawlSource` überspringt tote zur Laufzeit ohnehin.)

- [ ] **Step 2: Verifizierte Feeds einfügen** (nur die aus Step 1 bestätigten; Beispiel Captain-HUK + kostenlose-urteile)

In `B2B_CRAWL_SOURCES`, NACH `Rechtslupe`, VOR den Versicherungs-Feeds einfügen (Kfz-Priorität):
```ts
  // recht — spezialisierte Verkehrs-/Schadenrecht-Quellen (Kfz-nah, hohe Trefferquote)
  {
    name: 'kostenlose-urteile Verkehrsrecht',
    category: 'recht',
    kind: 'rss',
    url: 'https://www.kostenlose-urteile.de/rss/verkehrsrecht.rss',
  },
  {
    name: 'Captain-HUK',
    category: 'recht',
    kind: 'rss',
    url: 'https://www.captain-huk.de/feed/',
  },
```
(Nur bestätigte URLs aus Step 1 eintragen; unbestätigte auslassen.)

- [ ] **Step 3: Relevanz-Filter-Tests grün** (unverändert, aber gegenprüfen)

Run: `npx vitest run src/lib/wissen/crawl/relevance.test.ts`
Expected: PASS (Filter unverändert).

- [ ] **Step 4: Commit**

```bash
git add src/lib/wissen/crawl/sources.ts
git commit -m "feat(wissen): Verkehrs-/Schadenrecht-Feeds ergänzt (live-verifiziert)"
```

---

### Task 7: Admin-Sichtbarkeit — ai_gap-Artikel + korrektes Quelle-Label

**Files:**
- Modify: `src/app/admin/wissen-artikel/page.tsx`

- [ ] **Step 1: Auto-Artikel-Query auf ai_gap ausweiten + Provenienz mitladen**

Ersetze in `crawlArtikelRaw`-Query `.eq('quelle', 'crawl')` durch `.in('quelle', ['crawl', 'ai_gap'])`. Der Select enthält `quelle` bereits. (Der Typ `crawlArtikel` hat `quelle` schon.)

- [ ] **Step 2: Section-Titel + dynamisches Badge**

- SectionCard-`title` → `"Auto-veröffentlichte Artikel"`, `subtitle` → `"Vom B2B-Feed automatisch veröffentlicht (Crawl + KI-Evergreen) — bei Bedarf zurückziehen"`.
- Badge-Text dynamisch:
```tsx
<span className="inline-flex items-center rounded-ios-sm bg-claimondo-bg border border-claimondo-border px-1.5 py-0.5 text-[10px] font-medium text-claimondo-ondo whitespace-nowrap">
  {artikel.quelle === 'ai_gap' ? 'KI-Evergreen' : 'Auto-veröffentlicht (Crawl)'}
</span>
```

- [ ] **Step 3: 3-Wege Quelle-Label bei freigegebenen Themen** (Bugfix: crawl wurde als „AI-Gap" mislabelt)

Ersetze `{t.quelle === 'manuell' ? 'Manuell' : 'AI-Gap'}` durch:
```tsx
{t.quelle === 'manuell' ? 'Manuell' : t.quelle === 'crawl' ? 'Crawl' : 'KI-Evergreen'}
```

- [ ] **Step 4: Build/Typecheck (Route → voller Build laut Audit-Regel)**

Run: `npx tsc --noEmit` (und falls verfügbar `npm run build`, sonst CI-autoritativ).
Expected: keine neuen Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/wissen-artikel/page.tsx
git commit -m "feat(wissen): Admin zeigt KI-Evergreen-Artikel + korrektes Themen-Quelle-Label"
```

---

### Task 8: Gesamt-Verifikation + Prod-Smoke

**Files:** keine (Verifikation)

- [ ] **Step 1: Volle Gates**

Run:
- `npx vitest run src/lib/wissen` → alle grün.
- `npx tsc --noEmit` → grün.
- `npm run check:token-audit` → 0 neu.
- `npm run check:component-set -- --ratchet` → 0 neu.
- `npm run check:knip -- --ratchet` → 0 neu (propose.ts/pipeline-plan.ts sind verdrahtet).
Expected: alle grün / 0-neu.

- [ ] **Step 2: Prod-Smoke der Pipeline** (braucht `ANTHROPIC_API_KEY` in der Worktree-Env)

Falls `.env.local` mit `ANTHROPIC_API_KEY` vorhanden: headless `runB2BPipeline()` gegen Prod-DB (service-role) via kurzem `tsx`/Node-Harness ausführen. Verifiziere in `wissen_artikel`:
```sql
SELECT title, quelle, status, veroeffentlicht_am FROM wissen_artikel
WHERE quelle='ai_gap' ORDER BY created_at DESC LIMIT 5;
```
Erwartet: ≥ (DAILY_MIN − heutige Crawl-Publikationen) neue `ai_gap`-Artikel, `status='veroeffentlicht'`, on-topic, mit §§ + Disclaimer. Qualität sichten: gut → behalten (ist das Feature); off/mangelhaft → `status='archiviert'` retracten + Prompt nachschärfen.
Falls kein Key: Smoke auf Post-Deploy verschieben (Aaron triggert Cron-Route mit Prod-`CRON_SECRET`), Logik-Vertrauen aus Task-1/2-Unit-Tests.

- [ ] **Step 3: Verifizieren, dass die Evergreen-Queue voraus gefüllt ist** (Veto-Fenster)

```sql
SELECT count(*) FROM wissen_themen WHERE quelle='ai_gap' AND status='freigegeben';
```
Erwartet: ~`EVERGREEN_TARGET` (6) für Folgetage sichtbar im Admin.

- [ ] **Step 4: Push + PR gegen staging**

```bash
git push origin HEAD:kitta/wissen-evergreen-autopilot
gh pr create --base staging --title "feat(wissen): Evergreen-Autopilot — garantiert tägliche B2B-Artikel (KI-autonom)" --body "<Zusammenfassung + Audit + Prod-Smoke-Ergebnis>"
```

---

## Self-Review

**Spec coverage:**
- Themen-Planer (propose.ts) → Task 2/3 ✓
- Getierte Pipeline + Boden → Task 1 (Helfer) + Task 5 (Wiring) ✓
- Migration ai_gap → Task 4 ✓
- Feeds → Task 6 ✓
- Admin-Sichtbarkeit + Badge → Task 7 ✓
- Veto-Fenster/Buffer → Task 5 (EVERGREEN_TARGET + propose-before-consume-front) + Task 8 Step 3 ✓
- Rechtliche Gate-Wiederverwendung → Task 5 nutzt `validateForAutoPublish` unverändert ✓
- Manueller Inlet → bestehende `ThemaForm` (kein Task nötig; in Task 7 Label korrigiert) ✓

**Placeholder scan:** Task 6 URLs sind Kandidaten mit explizitem Live-Verify-Gate (kein Blind-Add) — bewusst, kein Platzhalter. Sonst keine.

**Type consistency:** `PlanThema` (Task 1) wird in Task 5 für Pools/Insert-Return genutzt; Felder (`id, quelle, titel, kurzbrief, primary_keyword, cluster, artikel_typ, source_url, created_at`) matchen den Select in Task 5 Step 3 + den `.select(...).single()` in `proposeUndInsert`. `ProposedTopic` (Task 2) → `proposeGapTopics` (Task 3) → `proposeUndInsert` (Task 5). `articleQuelleForThema` Rückgabe ⊆ Migration-Constraint (Task 4). Konsistent.
