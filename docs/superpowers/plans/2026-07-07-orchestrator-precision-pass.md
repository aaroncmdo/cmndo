# Orchestrator Precision Pass (Phase 2.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Annahmequote der Orchestrator-Vorschläge (aktuell 8%) heben, indem der Cron stateful wird (keine Wiederholung abgelehnter Vorschläge), Test-/Seed-/aktiv-bearbeitete Fälle nicht mehr reviewt, Ablehngründe erfasst und Eskalationen geschärft werden.

**Architecture:** Vier Fixes rein auf der Generierungs-Seite. Der Spine (`ai_claim_proposals`) + die deterministische Engine bleiben unangetastet. Neue pure Prädikate + ein geteilter Test-Email-Util werden isoliert getestet; Cron/Context/UI verdrahten sie. **Kein DDL** (die `feedback`-Spalte existiert, alle `ai_claim_proposals`-Reads sind additiv).

**Tech Stack:** Next.js 15, TypeScript, Supabase (`createAdminClient`, service_role), Anthropic Tool-Use, vitest, `@/components/primitives/Button`, sonner.

## Global Constraints

- **Kein DDL.** Keine Migration. `feedback`-Spalte existiert; `ai_claim_proposals`-Reads sind additiv. (AGENTS.md Regel 2 nicht berührt.)
- **Service-role liest Basis-Tabellen, nie `v_claim_*`** (auth-gated → 0 Zeilen für service_role).
- **vitest-Stil:** `import { describe, it, expect } from 'vitest'`; pure Funktionen mit direkten Assertions (Muster: `src/lib/orchestrator/context.test.ts`, `tools.test.ts`).
- **Reuse-Konventionen:** Test-SV via `sachverstaendige.ist_testaccount` (`src/lib/testdaten/test-sv-guard.ts`-Muster); Test-Email-Regex `/test|smoke|@claimondo\.test/i` (Vorlage: `src/lib/start-link/pick-dispatcher.ts:35`).
- **UI-Strings:** echte Umlaute (`ä`/`ö`/`ü`/`ß`). Buttons aus `@/components/primitives/Button` (kein handgerolltes `<button>`) — component-set-Ratchet.
- **Server-Actions:** Result-Object `{ ok; error? }`, kein throw (bereits erfüllt in `verwerfenVorschlag`).
- **7-Punkte-Audit** in jeder Commit-Message (AGENTS.md).
- **Branch:** `kitta/orchestrator-precision-pass` (bereits erstellt, off staging). WORKTREE-absolute Pfade nutzen (`.claude/worktrees/sa-signed-dedup`).

## File Structure

- **Create** `src/lib/testdaten/ist-test-email.ts` — pure `istTestEmail(email)`; einziger Ort der Test-Email-Regex (Task 1).
- **Create** `src/lib/testdaten/__tests__/ist-test-email.test.ts` — Tests dazu.
- **Create** `src/lib/orchestrator/hygiene.ts` — pure Kandidaten-Prädikate `istSeedFixture` / `istTestOderSeedFall` / `hatAktiveOffeneTasks` (Task 2).
- **Create** `src/lib/orchestrator/hygiene.test.ts` — Tests dazu.
- **Modify** `src/lib/orchestrator/types.ts` — `ClaimContext.bereitsVorgeschlagen` (Task 4).
- **Modify** `src/lib/orchestrator/context.ts` — `proposalHaupttext` + `buildClaimContext`-Read (Task 4) + `summarizeClaimForPrompt`-Render (Task 5).
- **Modify** `src/lib/orchestrator/context.test.ts` — Fixture + neue Assertions (Task 4/5).
- **Modify** `src/lib/orchestrator/run.ts` — SYSTEM-Prompt: Nicht-Wiederholen (Task 5) + Eskalations-Schärfung (Task 6).
- **Modify** `src/lib/orchestrator/tools.ts` — `flag_escalation`-Description schärfen (Task 6).
- **Modify** `src/app/api/cron/claim-orchestrator/route.ts` — Hygiene-Wiring (Task 3).
- **Modify** `src/app/admin/ai-vorschlaege/AiVorschlaegeClient.tsx` — Reject-Grund-Chips (Task 7).

**Deferred (bewusst NICHT in diesem Pass):** `pick-dispatcher.ts` auf `istTestEmail` umstellen (Boy-Scout, spätere Session — vermeidet Trampeln eines Shared-Files; die Regel-Duplikation bleibt vorübergehend dokumentiert).

---

### Task 1: Geteilter Test-Email-Util

**Files:**
- Create: `src/lib/testdaten/ist-test-email.ts`
- Test: `src/lib/testdaten/__tests__/ist-test-email.test.ts`

**Interfaces:**
- Produces: `export function istTestEmail(email: string | null | undefined): boolean`

- [ ] **Step 1: Failing test schreiben**

```typescript
// src/lib/testdaten/__tests__/ist-test-email.test.ts
import { describe, it, expect } from 'vitest'
import { istTestEmail } from '../ist-test-email'

describe('istTestEmail', () => {
  it('erkennt test/smoke/@claimondo.test', () => {
    expect(istTestEmail('test@x.de')).toBe(true)
    expect(istTestEmail('smoke.run@y.de')).toBe(true)
    expect(istTestEmail('jemand@claimondo.test')).toBe(true)
    expect(istTestEmail('MaxTest@web.de')).toBe(true) // case-insensitive
  })
  it('lässt echte Emails durch', () => {
    expect(istTestEmail('max.mustermann@gmail.com')).toBe(false)
    expect(istTestEmail('kunde@claimondo.de')).toBe(false)
  })
  it('ist null/undefined/leer-sicher', () => {
    expect(istTestEmail(null)).toBe(false)
    expect(istTestEmail(undefined)).toBe(false)
    expect(istTestEmail('')).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/lib/testdaten/__tests__/ist-test-email.test.ts`
Expected: FAIL — `Cannot find module '../ist-test-email'`.

- [ ] **Step 3: Minimale Implementierung**

```typescript
// src/lib/testdaten/ist-test-email.ts
// Kanonische Test-Konto-Erkennung per Email. Vorlage: src/lib/start-link/pick-dispatcher.ts:35
// (dessen lokale Regex ist ein spaeterer Boy-Scout-Kandidat fuer diesen Util).
const TEST_EMAIL_RE = /test|smoke|@claimondo\.test/i

export function istTestEmail(email: string | null | undefined): boolean {
  return !!email && TEST_EMAIL_RE.test(email)
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/lib/testdaten/__tests__/ist-test-email.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/testdaten/ist-test-email.ts src/lib/testdaten/__tests__/ist-test-email.test.ts
git commit -m "feat(orchestrator): geteilter istTestEmail-Util (Test-Konto-Erkennung)"
```

---

### Task 2: Kandidaten-Hygiene-Prädikate

**Files:**
- Create: `src/lib/orchestrator/hygiene.ts`
- Test: `src/lib/orchestrator/hygiene.test.ts`

**Interfaces:**
- Consumes: nichts (rein).
- Produces:
  - `export type HygieneClaim = { id: string; sv_id: string | null; geschaedigter_user_id: string | null; created_by_user_id: string | null }`
  - `export function istSeedFixture(claimId: string): boolean`
  - `export function istTestOderSeedFall(claim: HygieneClaim, sets: { testSvIds: Set<string>; testUserIds: Set<string> }): boolean`
  - `export function hatAktiveOffeneTasks(offeneTaskAnzahl: number): boolean`

- [ ] **Step 1: Failing test schreiben**

```typescript
// src/lib/orchestrator/hygiene.test.ts
import { describe, it, expect } from 'vitest'
import { istSeedFixture, istTestOderSeedFall, hatAktiveOffeneTasks } from './hygiene'

const leer = { testSvIds: new Set<string>(), testUserIds: new Set<string>() }
const echterClaim = {
  id: '091eb2eb-d894-45bd-a555-bb7331973c4b',
  sv_id: null, geschaedigter_user_id: 'u-real', created_by_user_id: 'u-real',
}

describe('istSeedFixture', () => {
  it('erkennt das Seed-Fixture-UUID-Muster', () => {
    expect(istSeedFixture('bbbb4444-0000-4000-8000-000000000042')).toBe(true)
    expect(istSeedFixture('cccc5555-0000-4000-8000-000000000050')).toBe(true)
  })
  it('lässt echte v4-UUIDs durch', () => {
    expect(istSeedFixture('091eb2eb-d894-45bd-a555-bb7331973c4b')).toBe(false)
  })
})

describe('istTestOderSeedFall', () => {
  it('false für echten Fall ohne Test-Signal', () => {
    expect(istTestOderSeedFall(echterClaim, leer)).toBe(false)
  })
  it('true bei Seed-UUID', () => {
    expect(istTestOderSeedFall({ ...echterClaim, id: 'bbbb4444-0000-4000-8000-000000000042' }, leer)).toBe(true)
  })
  it('true bei Test-SV', () => {
    const sets = { testSvIds: new Set(['sv-test']), testUserIds: new Set<string>() }
    expect(istTestOderSeedFall({ ...echterClaim, sv_id: 'sv-test' }, sets)).toBe(true)
  })
  it('true bei Test-Kunde (geschaedigter oder creator)', () => {
    const sets = { testSvIds: new Set<string>(), testUserIds: new Set(['u-test']) }
    expect(istTestOderSeedFall({ ...echterClaim, geschaedigter_user_id: 'u-test' }, sets)).toBe(true)
    expect(istTestOderSeedFall({ ...echterClaim, created_by_user_id: 'u-test' }, sets)).toBe(true)
  })
})

describe('hatAktiveOffeneTasks', () => {
  it('≥1 offener Task → true (überspringen)', () => {
    expect(hatAktiveOffeneTasks(1)).toBe(true)
    expect(hatAktiveOffeneTasks(5)).toBe(true)
  })
  it('0 offene Tasks → false (reviewen)', () => {
    expect(hatAktiveOffeneTasks(0)).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/lib/orchestrator/hygiene.test.ts`
Expected: FAIL — `Cannot find module './hygiene'`.

- [ ] **Step 3: Minimale Implementierung**

```typescript
// src/lib/orchestrator/hygiene.ts
// Reine Kandidaten-Hygiene-Praedikate fuer den Orchestrator-Cron.
// Ziel: Test-/Seed-Faelle + aktiv bearbeitete Faelle NICHT reviewen (spart
// Anthropic-Calls, haelt die Annahmequote-Metrik sauber). Siehe Spec §2.

export type HygieneClaim = {
  id: string
  sv_id: string | null
  geschaedigter_user_id: string | null
  created_by_user_id: string | null
}

// Hand-erzeugte Seed-Fixtures tragen das Muster xxxx-0000-4000-8000-... ;
// echte v4-UUIDs haben dort Zufallswerte -> ~0 False-Positives.
export function istSeedFixture(claimId: string): boolean {
  return claimId.includes('-0000-4000-8000-')
}

export function istTestOderSeedFall(
  claim: HygieneClaim,
  sets: { testSvIds: Set<string>; testUserIds: Set<string> },
): boolean {
  if (istSeedFixture(claim.id)) return true
  if (claim.sv_id && sets.testSvIds.has(claim.sv_id)) return true
  if (claim.geschaedigter_user_id && sets.testUserIds.has(claim.geschaedigter_user_id)) return true
  if (claim.created_by_user_id && sets.testUserIds.has(claim.created_by_user_id)) return true
  return false
}

// Ein Fall mit >=1 offenem Task hat laufende Arbeit -> nicht stagnant im
// relevanten Sinn -> ueberspringen.
export function hatAktiveOffeneTasks(offeneTaskAnzahl: number): boolean {
  return offeneTaskAnzahl >= 1
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/lib/orchestrator/hygiene.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestrator/hygiene.ts src/lib/orchestrator/hygiene.test.ts
git commit -m "feat(orchestrator): pure Kandidaten-Hygiene-Praedikate (Test/Seed/offene-Tasks)"
```

---

### Task 3: Hygiene in den Cron verdrahten

**Files:**
- Modify: `src/app/api/cron/claim-orchestrator/route.ts`

**Interfaces:**
- Consumes: `istTestEmail` (Task 1), `istTestOderSeedFall` + `hatAktiveOffeneTasks` (Task 2), `buildClaimContext` (liefert `ctx.offeneTasks`).

- [ ] **Step 1: Imports ergänzen**

In `src/app/api/cron/claim-orchestrator/route.ts` nach den bestehenden Imports (nach `import { reviewClaim } from '@/lib/orchestrator/run'`) einfügen:

```typescript
import { istTestOderSeedFall, hatAktiveOffeneTasks } from '@/lib/orchestrator/hygiene'
import { istTestEmail } from '@/lib/testdaten/ist-test-email'
```

- [ ] **Step 2: Kandidaten-Query um Filter-Felder erweitern**

Ersetze den bestehenden Block (aktuell):

```typescript
    const { data: activeClaims, error: claimsError } = await supabase
      .from('claims')
      .select('id, updated_at')
      .eq('ist_aktiv', true)
      .is('abgeschlossen_am', null)
      .limit(500)

    if (claimsError) {
      throw new Error(`claims-Fetch fehlgeschlagen: ${claimsError.message}`)
    }
```

durch:

```typescript
    const { data: activeClaims, error: claimsError } = await supabase
      .from('claims')
      .select('id, updated_at, sv_id, geschaedigter_user_id, created_by_user_id')
      .eq('ist_aktiv', true)
      .is('abgeschlossen_am', null)
      .limit(500)

    if (claimsError) {
      throw new Error(`claims-Fetch fehlgeschlagen: ${claimsError.message}`)
    }

    // --- Kandidaten-Hygiene: Test-/Seed-Faelle raus (Spec §2) ---
    // Test-SV-IDs (Basis-Tabelle, ist_testaccount-Konvention).
    const { data: testSvs } = await supabase
      .from('sachverstaendige')
      .select('id')
      .eq('ist_testaccount', true)
    const testSvIds = new Set(((testSvs ?? []) as Array<{ id: string }>).map((s) => s.id))

    // Test-Kunde-IDs: Profile der Kandidaten-User laden, per Email-Regex filtern.
    const userIds = [
      ...new Set(
        ((activeClaims ?? []) as Array<{ geschaedigter_user_id: string | null; created_by_user_id: string | null }>)
          .flatMap((c) => [c.geschaedigter_user_id, c.created_by_user_id])
          .filter((x): x is string => !!x),
      ),
    ]
    const testUserIds = new Set<string>()
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, email').in('id', userIds)
      for (const p of (profs ?? []) as Array<{ id: string; email: string | null }>) {
        if (istTestEmail(p.email)) testUserIds.add(p.id)
      }
    }

    const kandidaten = ((activeClaims ?? []) as Array<{
      id: string
      updated_at: string | null
      sv_id: string | null
      geschaedigter_user_id: string | null
      created_by_user_id: string | null
    }>).filter((c) => !istTestOderSeedFall(c, { testSvIds, testUserIds }))
```

- [ ] **Step 3: Loop auf `kandidaten` umstellen + offene-Tasks-Skip einbauen**

Ersetze den Loop-Kopf (aktuell `for (const c of activeClaims ?? []) {`) durch `for (const c of kandidaten) {`.

Ersetze danach den Abschnitt nach `buildClaimContext` (aktuell):

```typescript
      // Stagnierend: vollstaendigen Kontext laden + Claude aufrufen.
      const ctx = await buildClaimContext(c.id as string)
      if (!ctx) continue

      reviewed++
```

durch:

```typescript
      // Stagnierend: vollstaendigen Kontext laden.
      const ctx = await buildClaimContext(c.id as string)
      if (!ctx) continue

      // Kandidaten-Hygiene: aktiv bearbeitete Faelle (>=1 offener Task) NICHT
      // reviewen — sie haben laufende Arbeit, sind nicht stagnant. Spart den
      // Anthropic-Call (ctx.offeneTasks wurde bereits geladen).
      if (hatAktiveOffeneTasks(ctx.offeneTasks.length)) continue

      reviewed++
```

- [ ] **Step 4: Verifizieren (tsc + kein Verhaltens-Regress)**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "cron/claim-orchestrator" || echo "cron clean"`
Expected: `cron clean` (keine Typfehler in der Route). Vorbestehende `@react-pdf`/`sharp`-Fehler ignorieren (Infra).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/claim-orchestrator/route.ts
git commit -m "feat(orchestrator): Cron filtert Test-/Seed-/aktiv-bearbeitete Faelle vor dem Review"
```

---

### Task 4: Stateful Context — Typ + buildClaimContext-Read

**Files:**
- Modify: `src/lib/orchestrator/types.ts`
- Modify: `src/lib/orchestrator/context.ts`
- Modify: `src/lib/orchestrator/context.test.ts` (Fixture kompilierbar halten + Mapper-Test)

**Interfaces:**
- Produces:
  - `ClaimContext.bereitsVorgeschlagen: Array<{ typ: string; haupttext: string; status: string; feedback: string | null }>`
  - `export function proposalHaupttext(payload: Record<string, unknown>): string`

- [ ] **Step 1: Failing test schreiben (pure Mapper)**

In `src/lib/orchestrator/context.test.ts` — die Import-Zeile erweitern und einen Test ergänzen. Ersetze die erste Zeile:

```typescript
import { summarizeClaimForPrompt } from './context'
```

durch:

```typescript
import { summarizeClaimForPrompt, proposalHaupttext } from './context'
```

Und ergänze am Dateiende (nach dem letzten `})`):

```typescript
describe('proposalHaupttext', () => {
  it('nimmt titel, sonst hinweis, sonst grund, sonst —', () => {
    expect(proposalHaupttext({ titel: 'T', hinweis: 'H' })).toBe('T')
    expect(proposalHaupttext({ hinweis: 'H' })).toBe('H')
    expect(proposalHaupttext({ grund: 'G' })).toBe('G')
    expect(proposalHaupttext({})).toBe('—')
  })
})
```

- [ ] **Step 2: Fixture kompilierbar halten**

In derselben Datei `src/lib/orchestrator/context.test.ts` das `ctx`-Fixture um das neue Pflichtfeld ergänzen. Ersetze:

```typescript
  kurzverlauf: ['Fall angelegt', 'SV zugewiesen'],
}
```

durch:

```typescript
  kurzverlauf: ['Fall angelegt', 'SV zugewiesen'],
  bereitsVorgeschlagen: [],
}
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/lib/orchestrator/context.test.ts`
Expected: FAIL — `proposalHaupttext` ist kein Export (bzw. Typfehler wegen fehlendem Feld vor Step 4).

- [ ] **Step 4: Typ ergänzen**

In `src/lib/orchestrator/types.ts` im `ClaimContext`-Typ nach `kurzverlauf: string[] // letzte Timeline-Titel, max 8` einfügen:

```typescript
  /** Frühere Vorschläge DIESES Falls (letzte 8), für Nicht-Wiederholung im Prompt. */
  bereitsVorgeschlagen: Array<{ typ: string; haupttext: string; status: string; feedback: string | null }>
```

- [ ] **Step 5: `proposalHaupttext` + Read implementieren**

In `src/lib/orchestrator/context.ts`:

(a) Nach den Imports (nach `import type { ClaimContext } from './types'`) den Mapper einfügen:

```typescript
/** Kern-Text eines Vorschlags-Payloads (titel > hinweis > grund > —). */
export function proposalHaupttext(payload: Record<string, unknown>): string {
  const t = payload.titel
  const h = payload.hinweis
  const g = payload.grund
  if (typeof t === 'string' && t) return t
  if (typeof h === 'string' && h) return h
  if (typeof g === 'string' && g) return g
  return '—'
}
```

(b) In `buildClaimContext`, nach dem `tasks`-Block (nach der `offeneTasks`-Zuweisung, vor `// --- abgeleitete Felder ---`) einfügen:

```typescript
  // --- frühere Vorschläge dieses Falls (Stateful Context, Spec §1) ---
  const { data: proposalRows } = await db
    .from('ai_claim_proposals')
    .select('vorschlag_typ, payload, status, feedback')
    .eq('claim_id', claimId)
    .order('erstellt_am', { ascending: false })
    .limit(8)

  const bereitsVorgeschlagen = ((proposalRows ?? []) as Array<{
    vorschlag_typ?: string | null
    payload?: Record<string, unknown> | null
    status?: string | null
    feedback?: string | null
  }>).map((r) => ({
    typ: r.vorschlag_typ ?? '',
    haupttext: proposalHaupttext(r.payload ?? {}),
    status: r.status ?? '',
    feedback: r.feedback ?? null,
  }))
```

(c) Im `return`-Objekt von `buildClaimContext` nach `kurzverlauf,` einfügen:

```typescript
    bereitsVorgeschlagen,
```

- [ ] **Step 6: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/lib/orchestrator/context.test.ts`
Expected: PASS (summarizeClaimForPrompt-Tests + proposalHaupttext-Tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/orchestrator/types.ts src/lib/orchestrator/context.ts src/lib/orchestrator/context.test.ts
git commit -m "feat(orchestrator): stateful context — buildClaimContext liest fruehere Vorschlaege"
```

---

### Task 5: summarizeClaimForPrompt-Render + SYSTEM-Prompt (Nicht-Wiederholen)

**Files:**
- Modify: `src/lib/orchestrator/context.ts` (`summarizeClaimForPrompt`)
- Modify: `src/lib/orchestrator/context.test.ts` (Assertions)
- Modify: `src/lib/orchestrator/run.ts` (SYSTEM)

**Interfaces:**
- Consumes: `ClaimContext.bereitsVorgeschlagen` (Task 4).

- [ ] **Step 1: Failing test schreiben**

In `src/lib/orchestrator/context.test.ts` innerhalb `describe('summarizeClaimForPrompt', …)` zwei Tests ergänzen:

```typescript
  it('rendert die Sektion „Bereits vorgeschlagen" wenn Verlauf existiert', () => {
    const s = summarizeClaimForPrompt({
      ...ctx,
      bereitsVorgeschlagen: [
        { typ: 'task', haupttext: 'Kunde anrufen', status: 'verworfen', feedback: 'schon erledigt' },
      ],
    })
    expect(s).toContain('Bereits vorgeschlagen')
    expect(s).toContain('Kunde anrufen')
    expect(s).toContain('verworfen')
    expect(s).toContain('schon erledigt')
  })
  it('lässt die Sektion weg wenn kein Verlauf', () => {
    const s = summarizeClaimForPrompt({ ...ctx, bereitsVorgeschlagen: [] })
    expect(s).not.toContain('Bereits vorgeschlagen')
  })
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/lib/orchestrator/context.test.ts`
Expected: FAIL — die Sektion fehlt noch.

- [ ] **Step 3: Render implementieren**

In `src/lib/orchestrator/context.ts` in `summarizeClaimForPrompt`, vor dem `return [ … ].join('\n\n')` einen Block einfügen:

```typescript
  const vorgeschlagen = ctx.bereitsVorgeschlagen.length
    ? ctx.bereitsVorgeschlagen
        .map(
          (v) =>
            `- [${v.status}${v.feedback ? `: ${v.feedback}` : ''}] ${v.haupttext} (${v.typ})`,
        )
        .join('\n')
    : null
```

Und das `return`-Array so ändern, dass die Sektion nur bei Verlauf erscheint. Ersetze:

```typescript
  return [
    `Fall ${ctx.claimId} — Status: ${ctx.status ?? 'unbekannt'}, Phase: ${ctx.phase ?? 'unbekannt'}.`,
    `Fahrzeug: ${ctx.fahrzeug ?? 'unbekannt'}. Seit ${ctx.tageInaktiv} Tagen keine Aktivität.`,
    `Offene Tasks:\n${tasks}`,
    `Letzte Ereignisse:\n${verlauf}`,
  ].join('\n\n')
```

durch:

```typescript
  const teile = [
    `Fall ${ctx.claimId} — Status: ${ctx.status ?? 'unbekannt'}, Phase: ${ctx.phase ?? 'unbekannt'}.`,
    `Fahrzeug: ${ctx.fahrzeug ?? 'unbekannt'}. Seit ${ctx.tageInaktiv} Tagen keine Aktivität.`,
    `Offene Tasks:\n${tasks}`,
    `Letzte Ereignisse:\n${verlauf}`,
  ]
  if (vorgeschlagen) {
    teile.push(`Bereits vorgeschlagen (NICHT wiederholen):\n${vorgeschlagen}`)
  }
  return teile.join('\n\n')
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/lib/orchestrator/context.test.ts`
Expected: PASS.

- [ ] **Step 5: SYSTEM-Prompt um Nicht-Wiederholen ergänzen**

In `src/lib/orchestrator/run.ts` den `SYSTEM`-String ändern. Ersetze die Zeile:

```typescript
Nutze die Tools, um konkrete Vorschläge zu machen — 0 bis 3 pro Fall. Wenn nichts sinnvoll ist, mache keinen Vorschlag.
```

durch:

```typescript
Nutze die Tools, um konkrete Vorschläge zu machen — 0 bis 3 pro Fall. Wenn nichts sinnvoll ist, mache keinen Vorschlag.
Dir wird ggf. eine Liste „Bereits vorgeschlagen" gezeigt. Wiederhole KEINEN dieser Vorschläge — weder wörtlich noch inhaltlich gleich. Wurde bereits alles Sinnvolle vorgeschlagen, mache KEINEN neuen Vorschlag.
```

- [ ] **Step 6: Verifizieren (tsc)**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "orchestrator/(run|context)" || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orchestrator/context.ts src/lib/orchestrator/context.test.ts src/lib/orchestrator/run.ts
git commit -m "feat(orchestrator): Prompt zeigt fruehere Vorschlaege + verbietet Wiederholung"
```

---

### Task 6: Eskalations-Verb schärfen

**Files:**
- Modify: `src/lib/orchestrator/tools.ts` (`flag_escalation`-Description)
- Modify: `src/lib/orchestrator/run.ts` (SYSTEM)

**Interfaces:**
- Consumes: nichts Neues. **Kein** Schema-Change an `flag_escalation` (Payload bleibt `{ grund }`).

- [ ] **Step 1: Regressions-Test bestätigen (bestehend, muss grün bleiben)**

Run: `npx vitest run src/lib/orchestrator/tools.test.ts`
Expected: PASS (5 Tests) — die drei Tool-Namen inkl. `flag_escalation` bleiben. Dieser Test schützt gegen versehentliche Schema-/Namens-Änderung.

- [ ] **Step 2: `flag_escalation`-Description schärfen**

In `src/lib/orchestrator/tools.ts` in `ORCHESTRATOR_TOOLS` die `description` von `flag_escalation` ersetzen. Ersetze:

```typescript
    description: 'Markiere den Fall als eskalationsbedürftig für eine Rolle.',
```

durch:

```typescript
    description: 'Nur für einen HARTEN, blockierenden Zustand, den eine Rolle SOFORT auflösen muss (z. B. verletzter SLA mit konkretem Owner). Kein Status-Bericht, keine Analyse. `grund` = die konkrete Sofort-Aktion, nicht die Beschreibung. Im Zweifel propose_task statt Eskalation.',
```

- [ ] **Step 3: SYSTEM-Prompt um Eskalations-Bar ergänzen**

In `src/lib/orchestrator/run.ts` den `SYSTEM`-String erweitern. Ersetze die (in Task 5 hinzugefügte) Zeile:

```typescript
Dir wird ggf. eine Liste „Bereits vorgeschlagen" gezeigt. Wiederhole KEINEN dieser Vorschläge — weder wörtlich noch inhaltlich gleich. Wurde bereits alles Sinnvolle vorgeschlagen, mache KEINEN neuen Vorschlag.
```

durch:

```typescript
Dir wird ggf. eine Liste „Bereits vorgeschlagen" gezeigt. Wiederhole KEINEN dieser Vorschläge — weder wörtlich noch inhaltlich gleich. Wurde bereits alles Sinnvolle vorgeschlagen, mache KEINEN neuen Vorschlag.
Eskalationen (flag_escalation) sind selten: nur für HARTE Blocker mit konkreter Sofort-Aktion, kein beschreibender Absatz. Im Zweifel propose_task.
```

- [ ] **Step 4: Test laufen lassen — muss grün bleiben**

Run: `npx vitest run src/lib/orchestrator/tools.test.ts`
Expected: PASS (5 Tests, unverändert — Schema + Namen intakt).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestrator/tools.ts src/lib/orchestrator/run.ts
git commit -m "feat(orchestrator): flag_escalation geschaerft (nur harte Blocker + konkrete Aktion)"
```

---

### Task 7: Feedback-Loop — Reject-Grund-Chips

**Files:**
- Modify: `src/app/admin/ai-vorschlaege/AiVorschlaegeClient.tsx`

**Interfaces:**
- Consumes: `verwerfenVorschlag(id: string, feedback?: string)` (existiert bereits; schreibt `feedback` via `decideProposal`).

- [ ] **Step 1: Reason-Chips + State einbauen**

In `src/app/admin/ai-vorschlaege/AiVorschlaegeClient.tsx`:

(a) Nach der Zeile `const [pendingId, setPendingId] = useState<string | null>(null)` ergänzen:

```typescript
  // Fall-ID, deren „Verwerfen" gerade nach einem Grund fragt.
  const [begruendetId, setBegruendetId] = useState<string | null>(null)
  const VERWERF_GRUENDE = ['Schon erledigt', 'Nicht relevant', 'Unpräzise/falsch'] as const
```

(b) Den Aktionen-Block ersetzen. Ersetze:

```typescript
          {/* Aktionen */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="navy"
              size="sm"
              loading={pendingId === v.id}
              onClick={() => run(v.id, () => annehmenVorschlag(v.id), 'Vorschlag angenommen')}
            >
              Annehmen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={pendingId === v.id}
              onClick={() => run(v.id, () => verwerfenVorschlag(v.id), 'Vorschlag verworfen')}
            >
              Verwerfen
            </Button>
          </div>
```

durch:

```typescript
          {/* Aktionen */}
          {begruendetId === v.id ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-caption text-claimondo-ondo">Grund:</span>
              {VERWERF_GRUENDE.map((grund) => (
                <Button
                  key={grund}
                  variant="ghost"
                  size="sm"
                  loading={pendingId === v.id}
                  onClick={() => {
                    setBegruendetId(null)
                    run(v.id, () => verwerfenVorschlag(v.id, grund), 'Vorschlag verworfen')
                  }}
                >
                  {grund}
                </Button>
              ))}
              <Button variant="bare" size="sm" onClick={() => setBegruendetId(null)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <Button
                variant="navy"
                size="sm"
                loading={pendingId === v.id}
                onClick={() => run(v.id, () => annehmenVorschlag(v.id), 'Vorschlag angenommen')}
              >
                Annehmen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={pendingId === v.id}
                onClick={() => setBegruendetId(v.id)}
              >
                Verwerfen
              </Button>
            </div>
          )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "AiVorschlaegeClient" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: component-set-Ratchet (neue Buttons müssen primitives sein)**

Run: `npm run check:component-set -- --ratchet`
Expected: `OK — … 0 neue.` (die Chips nutzen `@/components/primitives/Button`, kein handgerolltes `<button>`).

- [ ] **Step 4: Manueller Smoke (kein Unit-Test für reine UI-State-Logik)**

`npm run build` grün; im Admin-Portal `/admin/ai-vorschlaege`: „Verwerfen" zeigt die drei Grund-Chips; Klick auf einen Chip verwirft mit Grund (Toast „Vorschlag verworfen"); „Abbrechen" schließt die Chips. (Verifikation der Persistenz: der Grund landet in `ai_claim_proposals.feedback` — bereits durch `decideProposal` verdrahtet.)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/ai-vorschlaege/AiVorschlaegeClient.tsx
git commit -m "feat(orchestrator): Reject-Grund-Chips schliessen den Feedback-Loop"
```

---

## Self-Review

**1. Spec-Coverage:**
- Spec §① Stateful Context → Task 4 (Typ + Read) + Task 5 (Render + Prompt). ✓
- Spec §② Kandidaten-Hygiene → Task 1 (Email-Util) + Task 2 (Prädikate) + Task 3 (Cron-Wiring: Test-SV + Test-Email + Seed-UUID + offene-Tasks). ✓
- Spec §③ Feedback-Loop → Task 7 (Chips → `verwerfenVorschlag(id, grund)`). ✓
- Spec §④ Eskalations-Gating (Schärfen) → Task 6. ✓
- Kein DDL → keine Migration in irgendeinem Task. ✓
- Testing (pure Funktionen TDD) → Tasks 1,2,4,5 haben RED→GREEN; Task 6 nutzt bestehenden Regressions-Test; Task 7 = tsc+component-set+manuell (reine UI-State-Logik, E2E-abgedeckt). ✓

**2. Placeholder-Scan:** Kein TBD/TODO; jeder Code-Step zeigt vollständigen Code + exakte Pfade + Commands. ✓

**3. Typ-Konsistenz:**
- `ClaimContext.bereitsVorgeschlagen` (Task 4) — Shape `{ typ; haupttext; status; feedback }` identisch in Typ-Def, Read-Mapping, Render (Task 5), Test-Fixture. ✓
- `proposalHaupttext(payload)` (Task 4) — konsistent verwendet in Read. ✓
- `istTestOderSeedFall(claim, { testSvIds, testUserIds })` / `hatAktiveOffeneTasks(number)` (Task 2) — Signaturen exakt so im Cron (Task 3) aufgerufen. ✓
- `istTestEmail(email)` (Task 1) — so im Cron (Task 3) genutzt. ✓
- Task 5 + Task 6 editieren beide `run.ts` SYSTEM sequenziell: Task 6s `old_string` matcht exakt Task 5s Ergebnis-Zeile. ✓

**Deviation von der Spec:** Der pick-dispatcher-Boy-Scout (Spec §② erwähnt „pick-dispatcher als Boy-Scout nachgezogen") ist bewusst **deferred** (Shared-File-Trampel-Risiko + Scope). Die Regex lebt kanonisch in `ist-test-email.ts`; pick-dispatcher behält seine Kopie vorübergehend. Im Abschluss-Report dokumentieren.
