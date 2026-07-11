# Werkstatt-Bedarfs-Qualifizierung — Inc 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Werkstatt-Finder leitet den Reparatur-Bedarf aus Evidenz ab (Gutachten-Logik / Schadenbild-KI / Fallback) und qualifiziert Werkstätten per 3-Zustand-Hybrid (passt / passt-nicht / unbekannt), confidence-gated. Inc 1 = Engine + Claim-Finder (Kunde-Portal, Dispatch). Embed bleibt unverändert (kein Regress).

**Architecture:** Ein Resolver `ermittleReparaturbedarf` (SSoT) liefert `{ kategorien, quelle, confidence }`; ein reiner Qualifizierer `qualifiziereWerkstaetten` wendet den 3-Zustand-Hybrid an. Finder-Aufrufer komponieren `findWerkstaetten` (Distanz) + Resolver + Qualifizierer.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres, RLS), vitest, Anthropic Vision (bestehender `getAnthropicVisionClient`).

**Spec:** `docs/superpowers/specs/2026-07-11-werkstatt-bedarf-qualifizierung-design.md`

## Global Constraints

- **Taxonomie (verbindlich, exakt):** `Gewerk = 'karosserie' | 'lackierung' | 'mechanik' | 'glas' | 'smart_repair'` — identisch mit `FAEHIGKEITEN_VALUES` (`src/app/admin/werkstaetten/actions.ts:32`) und dem `schadenskategorie`-Enum.
- **Confidence-Gating:** `HART_SCHWELLE = 60`, `MIN_TREFFER = 1` (zentrale Konstanten, ein Ort).
- **Bedarf = Menge:** Werkstatt qualifiziert nur, wenn sie ALLE Bedarf-Gewerke abdeckt (`every`).
- **„Unbekannt" ≠ „kann alles":** leere `faehigkeiten` ⇒ `unbekannt` (NIE hart gefiltert).
- **Fail-safe KI:** Vision-Fehler/leer/Client-null ⇒ `{ kategorien: [], confidence: 0 }` (unbekannt, nie falsch-positiv filtern).
- **Server-Actions:** Result-Object (`{ ok, error? }`), kein `throw` (AGENTS.md). Non-kritische Sub-Ops (Vision) in try/catch.
- **DDL nur via Supabase-Plugin** `mcp__plugin_supabase_supabase__apply_migration` (Regel 2); File-Name == getrackte Version. **Hinweis:** Plugin ggf. aktuell disconnected → Task 5 erst ausführen, wenn verbunden; Task 1–4 sind unabhängig und gehen sofort.
- **Ratchets 0-neu:** token-audit / component-set / knip / status-registry.
- **Frontend-Umlaute** in allen nutzersichtbaren Strings (Fit-Chips).
- **Komponenten-Set:** Fit-Chip via bestehendes `StatusBadge` (`@/components/shared/StatusBadge`), kein handgerolltes Badge.

## File Structure

**Neu (alle unter `src/lib/werkstatt/bedarf/`):**
- `types.ts` — `Gewerk`, `GEWERKE`, `BedarfQuelle`, `Reparaturbedarf`, `Fit`, `istGewerk`.
- `fit.ts` — `computeFit` (rein).
- `gutachten-gewerke.ts` — `deriveGewerkeAusGutachten` (rein).
- `qualifiziere.ts` — `qualifiziereWerkstaetten`, `HART_SCHWELLE`, `MIN_TREFFER` (rein).
- `schadenbild-gewerke.ts` — `klassifiziereSchadenbild` (Vision).
- `ermittle-bedarf.ts` — `ermittleReparaturbedarf` (Resolver, DB).
- Tests: `__tests__/fit.test.ts`, `gutachten-gewerke.test.ts`, `qualifiziere.test.ts`, `schadenbild-gewerke.test.ts`, `ermittle-bedarf.test.ts`.

**Geändert:**
- `supabase/migrations/<V>_bedarf_kategorien.sql` (Task 5).
- `src/lib/werkstatt/vermittlung-server.ts` — `findReparaturWerkstaettenForTarget` nutzt Resolver + Qualifizierer (Task 7).
- `src/components/werkstatt/finder/WerkstattFinder.tsx` — Fit-Chip + `keineSpezialisierte`-Banner (Task 8).

---

### Task 1: Typen + `computeFit` (3-Zustand)

**Files:**
- Create: `src/lib/werkstatt/bedarf/types.ts`
- Create: `src/lib/werkstatt/bedarf/fit.ts`
- Test: `src/lib/werkstatt/bedarf/__tests__/fit.test.ts`

**Interfaces — Produces:** `Gewerk`, `GEWERKE`, `BedarfQuelle`, `Reparaturbedarf`, `Fit`, `istGewerk`, `computeFit(faehigkeiten, bedarf): Fit`.

- [ ] **Step 1: Test schreiben** (`__tests__/fit.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { computeFit } from '../fit'

describe('computeFit (3-Zustand)', () => {
  it('leerer Bedarf -> unbekannt', () => {
    expect(computeFit(['karosserie'], [])).toBe('unbekannt')
  })
  it('null Faehigkeiten -> unbekannt (nicht "kann alles")', () => {
    expect(computeFit(null, ['lackierung'])).toBe('unbekannt')
    expect(computeFit([], ['lackierung'])).toBe('unbekannt')
  })
  it('deckt alle Gewerke -> passt', () => {
    expect(computeFit(['lackierung', 'karosserie'], ['lackierung'])).toBe('passt')
    expect(computeFit(['karosserie', 'lackierung', 'glas'], ['karosserie', 'lackierung'])).toBe('passt')
  })
  it('deckt nicht alle -> passt_nicht', () => {
    expect(computeFit(['karosserie'], ['lackierung'])).toBe('passt_nicht')
    expect(computeFit(['karosserie'], ['karosserie', 'lackierung'])).toBe('passt_nicht')
  })
})
```

- [ ] **Step 2: Test laufen lassen (RED)** — `npx vitest run src/lib/werkstatt/bedarf/__tests__/fit.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: `types.ts` implementieren**

```ts
export const GEWERKE = ['karosserie', 'lackierung', 'mechanik', 'glas', 'smart_repair'] as const
export type Gewerk = (typeof GEWERKE)[number]
export type BedarfQuelle = 'gutachten' | 'schadenbild' | 'kva' | 'manuell' | 'unbekannt'
export type Reparaturbedarf = { kategorien: Gewerk[]; quelle: BedarfQuelle; confidence: number }
export type Fit = 'passt' | 'passt_nicht' | 'unbekannt'
export function istGewerk(x: unknown): x is Gewerk {
  return typeof x === 'string' && (GEWERKE as readonly string[]).includes(x)
}
```

- [ ] **Step 4: `fit.ts` implementieren**

```ts
import type { Gewerk, Fit } from './types'

/** 3-Zustand: leere Faehigkeiten = unbekannt (NICHT "kann alles"). Bedarf = Menge (alle noetig). */
export function computeFit(faehigkeiten: Gewerk[] | string[] | null | undefined, bedarf: Gewerk[]): Fit {
  if (bedarf.length === 0) return 'unbekannt'
  if (!faehigkeiten || faehigkeiten.length === 0) return 'unbekannt'
  const set = new Set(faehigkeiten as string[])
  return bedarf.every((b) => set.has(b)) ? 'passt' : 'passt_nicht'
}
```

- [ ] **Step 5: Test laufen (GREEN)** — `npx vitest run src/lib/werkstatt/bedarf/__tests__/fit.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(werkstatt-bedarf): Typen + computeFit (3-Zustand)` (+ Audit-Block).

---

### Task 2: `deriveGewerkeAusGutachten` (reine Logik)

**Files:**
- Create: `src/lib/werkstatt/bedarf/gutachten-gewerke.ts`
- Test: `src/lib/werkstatt/bedarf/__tests__/gutachten-gewerke.test.ts`

**Interfaces — Consumes:** `Gewerk` (Task 1). **Produces:** `deriveGewerkeAusGutachten(g): Gewerk[]`, Typ `GutachtenZeiten`.

- [ ] **Step 1: Test schreiben**

```ts
import { describe, it, expect } from 'vitest'
import { deriveGewerkeAusGutachten } from '../gutachten-gewerke'

describe('deriveGewerkeAusGutachten', () => {
  it('Stunden > 0 -> Gewerk', () => {
    expect(deriveGewerkeAusGutachten({ zeit_kar_std: 4.5, zeit_lack_std: 2, zeit_ak_std: 0 }))
      .toEqual(['karosserie', 'lackierung'])
  })
  it('null/0 -> kein Gewerk', () => {
    expect(deriveGewerkeAusGutachten({ zeit_kar_std: null, zeit_lack_std: 0, zeit_ak_std: null })).toEqual([])
  })
  it('String-Stunden (Type-Lag) werden geparst', () => {
    expect(deriveGewerkeAusGutachten({ zeit_kar_std: '0', zeit_lack_std: '3.0', zeit_ak_std: '1' }))
      .toEqual(['lackierung', 'mechanik'])
  })
})
```

- [ ] **Step 2: Test laufen (RED)**.
- [ ] **Step 3: Implementieren**

```ts
import type { Gewerk } from './types'

export type GutachtenZeiten = {
  zeit_kar_std: number | string | null | undefined
  zeit_lack_std: number | string | null | undefined
  zeit_ak_std: number | string | null | undefined
}
const num = (x: number | string | null | undefined): number => {
  const n = typeof x === 'string' ? parseFloat(x) : x
  return Number.isFinite(n as number) ? (n as number) : 0
}

/**
 * Bedarf aus den strukturierten Gutachten-Stunden (gutachten_zeit_*). Rein.
 * VERIFIZIEREN: zeit_ak_std-Semantik gegen src/lib/ai/gutachten-ocr.ts System-Prompt
 * (AK = Arbeit/Mechanik?). glas/smart_repair stehen NICHT in den Stunden -> kommen
 * ueber den Foto-Pfad oder bleiben unbekannt (bewusst).
 */
export function deriveGewerkeAusGutachten(g: GutachtenZeiten): Gewerk[] {
  const out: Gewerk[] = []
  if (num(g.zeit_kar_std) > 0) out.push('karosserie')
  if (num(g.zeit_lack_std) > 0) out.push('lackierung')
  if (num(g.zeit_ak_std) > 0) out.push('mechanik')
  return out
}
```

- [ ] **Step 4: Test laufen (GREEN)**.
- [ ] **Step 5: Commit** — `feat(werkstatt-bedarf): Gutachten-Gewerke-Ableitung`.

---

### Task 3: `qualifiziereWerkstaetten` (confidence-gated Hybrid)

**Files:**
- Create: `src/lib/werkstatt/bedarf/qualifiziere.ts`
- Test: `src/lib/werkstatt/bedarf/__tests__/qualifiziere.test.ts`

**Interfaces — Consumes:** `Gewerk`, `Reparaturbedarf`, `Fit` (Task 1), `computeFit` (Task 1). **Produces:** `qualifiziereWerkstaetten<T>(rows, bedarf): QualifizierungsErgebnis<T>`, `HART_SCHWELLE`, `MIN_TREFFER`, Typen `Qualifiziert<T>`, `QualifizierungsErgebnis<T>`.

- [ ] **Step 1: Test schreiben**

```ts
import { describe, it, expect } from 'vitest'
import { qualifiziereWerkstaetten } from '../qualifiziere'
import type { Reparaturbedarf } from '../types'

const W = (id: string, faehigkeiten: string[] | null) => ({ id, faehigkeiten })
const bedarf = (kategorien: string[], confidence: number): Reparaturbedarf =>
  ({ kategorien: kategorien as never, quelle: 'gutachten', confidence })

describe('qualifiziereWerkstaetten', () => {
  it('hohe Confidence: passt+unbekannt sichtbar (passt zuerst), passt_nicht raus', () => {
    const rows = [W('a', ['lackierung']), W('b', ['karosserie']), W('c', null)]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 100))
    expect(r.hartGefiltert).toBe(true)
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['a', 'c']) // b (passt_nicht) raus; a (passt) vor c (unbekannt)
    expect(r.keineSpezialisierte).toBe(false)
  })
  it('hohe Confidence, 0 Treffer -> Fallback: alle zeigen + Flag', () => {
    const rows = [W('a', ['karosserie']), W('b', ['mechanik'])]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 100))
    expect(r.keineSpezialisierte).toBe(true)
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.hartGefiltert).toBe(false)
  })
  it('niedrige Confidence -> weich: alle zeigen, kein Filter', () => {
    const rows = [W('a', ['lackierung']), W('b', ['karosserie'])]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 40))
    expect(r.hartGefiltert).toBe(false)
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('unbekannter Bedarf -> weich, alle unbekannt', () => {
    const rows = [W('a', ['lackierung'])]
    const r = qualifiziereWerkstaetten(rows, bedarf([], 0))
    expect(r.werkstaetten[0].fit).toBe('unbekannt')
    expect(r.hartGefiltert).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen (RED)**.
- [ ] **Step 3: Implementieren**

```ts
import type { Gewerk, Reparaturbedarf, Fit } from './types'
import { computeFit } from './fit'

export const HART_SCHWELLE = 60
export const MIN_TREFFER = 1

export type Qualifiziert<T> = T & { fit: Fit }
export type QualifizierungsErgebnis<T> = {
  werkstaetten: Qualifiziert<T>[]
  keineSpezialisierte: boolean // Hart-Modus, aber 0 Treffer -> Fallback (alle gezeigt)
  hartGefiltert: boolean
}

/**
 * 3-Zustand-Qualifizierung, confidence-gated. Erwartet distanz-sortierte rows;
 * die stabile Sortierung erhaelt die Distanz-Reihenfolge innerhalb einer fit-Gruppe.
 */
export function qualifiziereWerkstaetten<T extends { faehigkeiten: Gewerk[] | string[] | null }>(
  rows: T[],
  bedarf: Reparaturbedarf,
): QualifizierungsErgebnis<T> {
  const annotated: Qualifiziert<T>[] = rows.map((r) => ({ ...r, fit: computeFit(r.faehigkeiten, bedarf.kategorien) }))
  const hart = bedarf.confidence >= HART_SCHWELLE && bedarf.kategorien.length > 0
  if (!hart) return { werkstaetten: annotated, keineSpezialisierte: false, hartGefiltert: false }

  const sichtbar = annotated.filter((r) => r.fit !== 'passt_nicht')
  if (sichtbar.length >= MIN_TREFFER) {
    const rang = (f: Fit) => (f === 'passt' ? 0 : 1)
    const sortiert = [...sichtbar].sort((a, b) => rang(a.fit) - rang(b.fit)) // stabil: Distanz bleibt je Gruppe
    return { werkstaetten: sortiert, keineSpezialisierte: false, hartGefiltert: true }
  }
  return { werkstaetten: annotated, keineSpezialisierte: true, hartGefiltert: false }
}
```

- [ ] **Step 4: Test laufen (GREEN)**.
- [ ] **Step 5: Commit** — `feat(werkstatt-bedarf): qualifiziereWerkstaetten (confidence-gated Hybrid)`.

---

### Task 4: `klassifiziereSchadenbild` (Vision)

**Files:**
- Create: `src/lib/werkstatt/bedarf/schadenbild-gewerke.ts`
- Test: `src/lib/werkstatt/bedarf/__tests__/schadenbild-gewerke.test.ts`

**Interfaces — Consumes:** `Gewerk`, `istGewerk`, `GEWERKE` (Task 1); `getAnthropicVisionClient`, `buildImageBlocks` (`@/lib/ai/vision/client`); `AI_MODELS` (mirror `analyze-unfallfotos.ts`). **Produces:** `klassifiziereSchadenbild(urls): Promise<{ kategorien: Gewerk[]; confidence: number }>`.

**Wichtig:** Der Implementer liest zuerst `src/lib/ai/vision/analyze-unfallfotos.ts` + `src/lib/ai/vision/client.ts`, um Client-Aufruf, Modell-Konstante und `buildImageBlocks`-Signatur EXAKT zu spiegeln.

- [ ] **Step 1: Test schreiben** (Client gemockt)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai/vision/client', () => ({
  getAnthropicVisionClient: vi.fn(),
  buildImageBlocks: (urls: string[]) => urls.map((u) => ({ type: 'image', source: { type: 'url', url: u } })),
}))
import { getAnthropicVisionClient } from '@/lib/ai/vision/client'
import { klassifiziereSchadenbild } from '../schadenbild-gewerke'

const mockClient = (text: string) => ({ messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) } })

beforeEach(() => vi.mocked(getAnthropicVisionClient).mockReset())

describe('klassifiziereSchadenbild', () => {
  it('parst gueltiges JSON + filtert unbekannte Gewerke', async () => {
    vi.mocked(getAnthropicVisionClient).mockReturnValue(
      mockClient('{"kategorien":["lackierung","xxx","karosserie"],"confidence":82}') as never,
    )
    const r = await klassifiziereSchadenbild(['u1'])
    expect(r.kategorien).toEqual(['lackierung', 'karosserie'])
    expect(r.confidence).toBe(82)
  })
  it('Client null -> fail-safe leer', async () => {
    vi.mocked(getAnthropicVisionClient).mockReturnValue(null as never)
    expect(await klassifiziereSchadenbild(['u1'])).toEqual({ kategorien: [], confidence: 0 })
  })
  it('keine URLs -> leer', async () => {
    expect(await klassifiziereSchadenbild([])).toEqual({ kategorien: [], confidence: 0 })
  })
  it('Parse-Fehler -> fail-safe leer', async () => {
    vi.mocked(getAnthropicVisionClient).mockReturnValue(mockClient('kein json') as never)
    expect(await klassifiziereSchadenbild(['u1'])).toEqual({ kategorien: [], confidence: 0 })
  })
  it('leere Kategorien -> confidence 0 (kein Filter-Signal)', async () => {
    vi.mocked(getAnthropicVisionClient).mockReturnValue(mockClient('{"kategorien":[],"confidence":90}') as never)
    expect(await klassifiziereSchadenbild(['u1'])).toEqual({ kategorien: [], confidence: 0 })
  })
})
```

- [ ] **Step 2: Test laufen (RED)**.
- [ ] **Step 3: Implementieren** (Modell-Konstante + Client-Aufruf exakt wie `analyze-unfallfotos.ts`)

```ts
import type { Gewerk } from './types'
import { istGewerk } from './types'
import { getAnthropicVisionClient, buildImageBlocks } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models' // Pfad gegen analyze-unfallfotos.ts verifizieren

const SYSTEM =
  'Du bist ein KFZ-Schadengutachter-Assistent. Bestimme aus den Schadenfotos, welche Reparatur-Gewerke noetig sind.'
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
function parseJson(text: string): { kategorien?: unknown; confidence?: unknown } | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

export async function klassifiziereSchadenbild(urls: string[]): Promise<{ kategorien: Gewerk[]; confidence: number }> {
  const client = getAnthropicVisionClient()
  if (!client || urls.length === 0) return { kategorien: [], confidence: 0 }
  try {
    const blocks = buildImageBlocks(urls, 8)
    if (blocks.length === 0) return { kategorien: [], confidence: 0 }
    const res = await client.messages.create({
      model: AI_MODELS.vision_schadenbeschreibung,
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: 'user', content: [
        ...blocks,
        { type: 'text', text: 'Welche Gewerke braucht dieser Schaden? Erlaubt: karosserie, lackierung, mechanik, glas, smart_repair. Antworte NUR JSON: {"kategorien":[...],"confidence":0-100}' },
      ] }],
    })
    const text = (res.content.find((c: { type: string }) => c.type === 'text') as { text?: string } | undefined)?.text ?? ''
    const parsed = parseJson(text)
    const kategorien = (Array.isArray(parsed?.kategorien) ? parsed!.kategorien : []).filter(istGewerk) as Gewerk[]
    const confidence = kategorien.length ? clamp(Number(parsed?.confidence) || 0, 0, 100) : 0
    return { kategorien, confidence }
  } catch {
    return { kategorien: [], confidence: 0 }
  }
}
```

- [ ] **Step 4: Test laufen (GREEN)**. Wenn `AI_MODELS`-Pfad abweicht: an `analyze-unfallfotos.ts` angleichen, Test bleibt gruen (Client gemockt).
- [ ] **Step 5: Commit** — `feat(werkstatt-bedarf): Schadenbild-KI-Klassifizierung (fail-safe)`.

---

### Task 5: DDL — `bedarf_*`-Spalten (Supabase-Plugin)

**Files:**
- Create: `supabase/migrations/<V>_bedarf_kategorien.sql` (Name == vom Plugin getrackte Version).

**Voraussetzung:** Supabase-Plugin verbunden. Falls disconnected → Task überspringen und nach Task 7 nachholen (Resolver-Tests mocken sb, brauchen die Spalten nicht).

- [ ] **Step 1: DDL via Plugin anwenden** — `apply_migration({ name: 'bedarf_kategorien', query: <DDL> })`:

```sql
alter table public.claims
  add column if not exists bedarf_kategorien text[],
  add column if not exists bedarf_quelle text,
  add column if not exists bedarf_confidence int2,
  add column if not exists bedarf_ermittelt_am timestamptz;
alter table public.leads
  add column if not exists bedarf_kategorien text[],
  add column if not exists bedarf_quelle text,
  add column if not exists bedarf_confidence int2,
  add column if not exists bedarf_ermittelt_am timestamptz;
```

- [ ] **Step 2: `list_migrations`** → getrackte Version `<V>` ablesen.
- [ ] **Step 3: Migration-File committen** als `supabase/migrations/<V>_bedarf_kategorien.sql` (Inhalt == DDL). Commit — `feat(db): bedarf_* Spalten auf claims+leads`.
- [ ] **Step 4: `execute_sql` (READ)** verifizieren — `select column_name from information_schema.columns where table_name='claims' and column_name like 'bedarf_%'` → 4 Zeilen.

---

### Task 6: `ermittleReparaturbedarf` (Resolver)

**Files:**
- Create: `src/lib/werkstatt/bedarf/ermittle-bedarf.ts`
- Test: `src/lib/werkstatt/bedarf/__tests__/ermittle-bedarf.test.ts`

**Interfaces — Consumes:** `Reparaturbedarf` (T1), `deriveGewerkeAusGutachten` (T2), `klassifiziereSchadenbild` (T4). **Produces:** `ermittleReparaturbedarf(sb, ctx): Promise<Reparaturbedarf>`.

**Der Implementer liest** `src/lib/werkstatt/vermittlung-server.ts` (wie schadenskategorie/Fotos für einen Claim/Lead geladen werden) + `src/lib/ai/vision/analyze-unfallfotos.ts:42` (Foto-URL-Fetch), um Query-Shapes exakt zu treffen. Eskalation aus Spec §4.

- [ ] **Step 1: Test schreiben** (sb-Fake) — mind. diese Fälle:
  - Gutachten freigegeben + Stunden → `{ kategorien:['karosserie',...], quelle:'gutachten', confidence:100 }`.
  - Kein Gutachten, Fotos vorhanden (mock `klassifiziereSchadenbild`) → `quelle:'schadenbild'`, confidence vom KI-Mock.
  - Keine Evidenz, `schadenskategorie` gesetzt → `quelle:'manuell'`, confidence 40.
  - Nichts → `{ kategorien:[], quelle:'unbekannt', confidence:0 }`.
  (Mock `./gutachten-gewerke` + `./schadenbild-gewerke` via `vi.mock`, sb als Fake-Objekt mit `from().select()...` Chain oder als injizierte Loader — der Implementer wählt die testbarste Faktorisierung, z.B. reine `waehleBedarf(gutachten, fotos, manuell)`-Funktion + dünne DB-Hülle.)

- [ ] **Step 2: Test laufen (RED)**.
- [ ] **Step 3: Implementieren.** Empfohlene Faktorisierung für Testbarkeit: reine Kern-Funktion + DB-Hülle:

```ts
import type { Reparaturbedarf } from './types'
import { deriveGewerkeAusGutachten } from './gutachten-gewerke'
import { klassifiziereSchadenbild } from './schadenbild-gewerke'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

const MANUELL_CONFIDENCE = 40

/** Rein/testbar: waehlt die staerkste Evidenz. */
export async function waehleBedarf(inputs: {
  gutachtenZeiten: { zeit_kar_std: unknown; zeit_lack_std: unknown; zeit_ak_std: unknown } | null
  fotoUrls: string[]
  manuell: string[] | null
}): Promise<Reparaturbedarf> {
  if (inputs.gutachtenZeiten) {
    const kategorien = deriveGewerkeAusGutachten(inputs.gutachtenZeiten as never)
    if (kategorien.length) return { kategorien, quelle: 'gutachten', confidence: 100 }
  }
  if (inputs.fotoUrls.length) {
    const { kategorien, confidence } = await klassifiziereSchadenbild(inputs.fotoUrls)
    if (kategorien.length) return { kategorien, quelle: 'schadenbild', confidence }
  }
  const manuell = (inputs.manuell ?? []).filter(Boolean)
  if (manuell.length) return { kategorien: manuell as never, quelle: 'manuell', confidence: MANUELL_CONFIDENCE }
  return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
}

/** DB-Huelle: laedt Evidenz fuer claim/lead + persistiert Ergebnis (Cache). */
export async function ermittleReparaturbedarf(sb: Sb, ctx: { claimId?: string; leadId?: string }): Promise<Reparaturbedarf> {
  // 1. Gutachten-Zeiten + gutachten_final_freigegeben, Fotos (leads.schadensfoto_urls / fall_dokumente),
  //    schadenskategorie laden (Query-Shapes aus vermittlung-server.ts + analyze-unfallfotos.ts).
  // 2. waehleBedarf(...) aufrufen.
  // 3. Ergebnis auf claim/lead persistieren (bedarf_* Spalten) — try/catch, non-kritisch.
  // 4. Ergebnis zurueckgeben.
  // (Vollstaendige Query-Details fuellt der Implementer beim Lesen der Referenz-Files.)
}
```

- [ ] **Step 4: Test laufen (GREEN)** (Kern `waehleBedarf` voll getestet; DB-Hülle dünn).
- [ ] **Step 5: Commit** — `feat(werkstatt-bedarf): Resolver ermittleReparaturbedarf`.

---

### Task 7: `findReparaturWerkstaettenForTarget` → Resolver + Qualifizierer

**Files:**
- Modify: `src/lib/werkstatt/vermittlung-server.ts` (`findReparaturWerkstaettenForTarget`)
- Test: bestehende Test-Datei erweitern oder neu `__tests__/vermittlung-qualifiziert.test.ts`

**Interfaces — Consumes:** `ermittleReparaturbedarf` (T6), `qualifiziereWerkstaetten` (T3). **Produces:** `findReparaturWerkstaettenForTarget` liefert zusätzlich `fit` je Zeile + `keineSpezialisierte`. Rückgabe-Shape erweitern zu `{ werkstaetten: Qualifiziert<WerkstattFinderRow>[]; keineSpezialisierte: boolean }` (oder Array + separates Flag — der Implementer prüft die Konsumenten `getWerkstaettenNah`, `ladeWerkstaettenFuerClaim` und wählt die minimal-brechende Variante; Konsumenten in dieser Task mit anpassen).

- [ ] **Step 1:** Konsumenten + aktuellen Rückgabetyp lesen; Test schreiben: bei bekanntem Bedarf (hohe conf) enthält das Ergebnis nur passt/unbekannt + `fit` gesetzt; bei 0 Treffern `keineSpezialisierte=true`.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** In `findReparaturWerkstaettenForTarget`: `bedarf = await ermittleReparaturbedarf(sb, { claimId/leadId })`; die bereits per Distanz geladenen `WerkstattFinderRow[]` (aus `findWerkstaetten` ohne kategorie) durch `qualifiziereWerkstaetten(rows, bedarf)` schicken; Ergebnis + Flag zurückgeben. Alten `schadenskategorie`→`kategorie`-Pfad entfernen (der Resolver deckt „manuell" ab).
- [ ] **Step 4:** GREEN. `npx tsc --noEmit` (Konsumenten-Typen) grün.
- [ ] **Step 5:** Commit — `feat(werkstatt-bedarf): Claim-Finder qualifiziert per Resolver`.

---

### Task 8: Fit-Anzeige in `WerkstattFinder.tsx`

**Files:**
- Modify: `src/components/werkstatt/finder/WerkstattFinder.tsx`
- (Konsumenten-Props: `werkstaetten: Qualifiziert<WerkstattFinderRow>[]`, `keineSpezialisierte?: boolean`.)

**Interfaces — Consumes:** `Fit`, `Qualifiziert` (T3). Nutzt bestehendes `StatusBadge`.

- [ ] **Step 1:** Props um `fit` (je Zeile) + optional `keineSpezialisierte` erweitern. Fit-Chip am Namen (ersetzt die alte `passt`-Heuristik `zeigeBadge`):

```tsx
{w.fit === 'passt' ? (
  <StatusBadge tone="success" size="xs">Passt zu deinem Schaden</StatusBadge>
) : w.fit === 'unbekannt' ? (
  <StatusBadge tone="neutral" size="xs">Leistungen auf Anfrage</StatusBadge>
) : (
  <StatusBadge tone="warning" size="xs">Bietet diese Arbeit nicht an</StatusBadge>
)}
```

Über der Liste bei `keineSpezialisierte`: Hinweis „Keine spezialisierte Werkstatt in der Nähe — hier die nächsten." (via `EmptyState`-Stil-Hinweis oder schlichtes `NoticeBox`/`p`).

- [ ] **Step 2:** `npm run build` (Route-/RSC-Validierung, da Komponente + Props) grün. Ratchets: `npm run check:component-set` / `check:token-audit` 0-neu.
- [ ] **Step 3:** Commit — `feat(werkstatt-bedarf): Fit-Anzeige im Werkstatt-Finder`.

---

## Self-Review (Autor)

**Spec-Abdeckung:** Resolver (§4) → T2/T4/T6. 3-Zustand + Hybrid (§5) → T1/T3. Datenmodell (§7) → T5. Integration Claim-Finder (§8) → T7/T8. Embed unverändert (Inc 2) → bewusst nicht in Inc 1. ✅
**Typ-Konsistenz:** `Gewerk`/`Reparaturbedarf`/`Fit` in T1 definiert, überall konsumiert. `Qualifiziert<T>`/`keineSpezialisierte` in T3 definiert, in T7/T8 genutzt. `computeFit`/`qualifiziereWerkstaetten`/`ermittleReparaturbedarf`/`deriveGewerkeAusGutachten`/`klassifiziereSchadenbild` durchgängig gleich benannt. ✅
**Platzhalter:** T6-DB-Hülle + T7-Rückgabe-Shape bewusst als „Implementer liest Referenz-File und wählt minimal-brechende Faktorisierung" — kein blindes Raten an Query-/Konsumenten-Details, die nur beim Lesen der echten Files sicher sind. Kern-Logik überall mit vollem Code + Tests. ✅
**Reihenfolge/Blocker:** T1–T4 rein, sofort baubar. T5 (DDL) braucht Plugin — separat, blockt T1–T4/T7-Logik nicht (Resolver-Tests mocken sb). T6→T7→T8 integrieren. ✅
