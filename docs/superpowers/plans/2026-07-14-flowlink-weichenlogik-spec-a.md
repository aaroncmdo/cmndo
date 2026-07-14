# FlowLink-Weichenlogik (Spec A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der FlowLink verzweigt DB-getrieben nach `schuldfrage`/`abrechnungsweg` statt nach Termin-Zustand — Kasko/Selbstzahler sehen nie den Gutachter-Finder, Teilschuld landet als echter Rückruf beim Dispatch, und die Feststellung zeigt bei Kasko/Selbstzahler keine Unfall-Felder.

**Architecture:** Eine **pure, client-safe Funktion** `resolveFlowWeichen()` (nach dem Muster von `abrechnungsweg.ts`) wird zur einzigen Quelle aller FlowLink-Weichen. `page.tsx` speist sie mit den Lead-Feldern (die dort per `select('*')` schon alle vorliegen) und reicht das Ergebnis als Props an `FlowWizardKfz` — statt es dort lossy zu rekonstruieren. Der Rückruf nutzt den bestehenden idempotenten `upsertReservierungsRueckruf`.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript, Supabase, vitest.

## Global Constraints

- **Kein DDL.** Alle Felder existieren (`leads.schuldfrage/eigene_versicherung/freie_werkstattwahl/reparaturwunsch/service_typ/schadenart/werkstatt_id/reparatur_werkstatt_id`).
- **Client-safe:** `resolveFlowWeichen` importiert **nichts** aus `'use server'`-Files, keine Supabase-Imports (wie `src/lib/werkstatt/abrechnungsweg.ts`).
- **Mount-Capping:** Jedes STEPS-Präsenz-Flag in `FlowWizardKfz` MUSS beim Mount via `useState(...)` gecappt werden — sonst schrumpft `STEPS` mid-flow durch RSC-Re-Render (LeadRealtimeRefresh) und der Step-Index wird stale. Bestehendes Muster: `const [initialNeedsBooking] = useState(needsBooking === true)`.
- **Vokabular (nicht raten):** `schuldfrage ∈ 'gegner'|'unklar'|'eigenverantwortung'`; `eigene_versicherung ∈ 'ja'|'nein'` (text!); `abrechnungsweg ∈ 'haftpflicht'|'kasko'|'selbstzahler'|'nicht_zutreffend'`; `admin_termine.status ∈ 'offen'|'erledigt'|'abgesagt'`.
- **Umlaute** in allen nutzersichtbaren Strings (ä/ö/ü/ß).
- **Kollision:** `src/lib/makler/erstelle-anfrage.ts` + `NeueAnfrageDrawer.tsx` gehören Session `00fa466c` — **NICHT anfassen**.
- **Regel 4:** Nach dem PR Prod-Playwright-Smoke.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/lib/self-service/flow-weichen.ts` (**neu**) | **Die SSoT.** Pure Funktion `resolveFlowWeichen(input) → FlowWeichen`. Kennt die ganze Matrix. |
| `src/lib/self-service/__tests__/flow-weichen.test.ts` (**neu**) | Tests für jeden Weg der Matrix. |
| `src/app/flow/[token]/page.tsx` (mod) | Speist `resolveFlowWeichen` mit dem Lead; die Gates (`needsBooking`/`needsWerkstatt`/`feststellungNeeded`) folgen ihr; reicht Weichen + fehlende Lead-Felder an den Wizard. |
| `src/app/flow/[token]/FlowWizardKfz.tsx` (mod) | Nimmt die Weichen als Props (kein lossy `istHaftpflicht` mehr); neuer `rueckruf`-Step. |
| `src/app/flow/[token]/FlowRueckrufStep.tsx` (**neu**) | Teilschuld-Zweig: Rückruf beim Dispatch anfordern (UI). |
| `src/app/flow/[token]/self-service-actions.ts` (mod) | Server-Action `fordereRueckrufAn(token)` → `upsertReservierungsRueckruf`. |
| `src/app/flow/[token]/feststellung-steps.ts` (mod) | Unfall-Steps bekommen eine Zweig-Bedingung (nur Haftpflicht/Teilschuld). |

---

## Task 1: Die pure Weichen-Logik (das Fundament)

**Files:**
- Create: `src/lib/self-service/flow-weichen.ts`
- Test: `src/lib/self-service/__tests__/flow-weichen.test.ts`

**Interfaces:**
- Consumes: `resolveAbrechnungsweg`, `istWerkstattReparaturWeg` aus `@/lib/werkstatt/abrechnungsweg` (beide bereits pure + getestet).
- Produces:
  ```ts
  export type FeststellungZweig = 'unfall' | 'schaden'
  export type FlowWeichen = {
    abrechnungsweg: Abrechnungsweg | null
    brauchtGutachter: boolean      // Gutachter-Finder/Termin-Step zeigen?
    brauchtWerkstatt: boolean      // Werkstatt-Finder zeigen?
    brauchtRueckruf: boolean       // Teilschuld -> Rueckruf beim Dispatch
    feststellungZweig: FeststellungZweig
  }
  export function resolveFlowWeichen(input: {
    schuldfrage: string | null
    ueberEigeneVersicherung: boolean | null
    freieWerkstattwahl: boolean | null
    serviceTyp: string | null
    hatSvTermin: boolean           // terminMitSv || terminPending
    hatWerkstatt: boolean          // reparatur_werkstatt_id || werkstatt_id gesetzt
  }): FlowWeichen
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/self-service/__tests__/flow-weichen.test.ts
import { describe, it, expect } from 'vitest'
import { resolveFlowWeichen } from '../flow-weichen'

const basis = {
  schuldfrage: null as string | null,
  ueberEigeneVersicherung: null as boolean | null,
  freieWerkstattwahl: null as boolean | null,
  serviceTyp: 'komplett' as string | null,
  hatSvTermin: false,
  hatWerkstatt: false,
}

describe('resolveFlowWeichen', () => {
  it('gegner (Haftpflicht) -> Gutachter ja, Werkstatt ja, kein Rueckruf, Feststellung unfall', () => {
    expect(resolveFlowWeichen({ ...basis, schuldfrage: 'gegner' })).toEqual({
      abrechnungsweg: 'haftpflicht',
      brauchtGutachter: true,
      brauchtWerkstatt: true,
      brauchtRueckruf: false,
      feststellungZweig: 'unfall',
    })
  })

  it('unklar (Teilschuld) -> NUR Rueckruf, kein Gutachter, keine Werkstatt', () => {
    expect(resolveFlowWeichen({ ...basis, schuldfrage: 'unklar' })).toEqual({
      abrechnungsweg: null,
      brauchtGutachter: false,
      brauchtWerkstatt: false,
      brauchtRueckruf: true,
      feststellungZweig: 'unfall',
    })
  })

  it('eigenverantwortung + Kasko (freie Wahl) -> KEIN Gutachter, Werkstatt ja, Feststellung schaden', () => {
    expect(resolveFlowWeichen({
      ...basis, schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: true, freieWerkstattwahl: true,
    })).toEqual({
      abrechnungsweg: 'kasko',
      brauchtGutachter: false,
      brauchtWerkstatt: true,
      brauchtRueckruf: false,
      feststellungZweig: 'schaden',
    })
  })

  it('eigenverantwortung ohne Kasko (Selbstzahler) -> KEIN Gutachter, Werkstatt ja, Feststellung schaden', () => {
    expect(resolveFlowWeichen({
      ...basis, schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: false,
    })).toEqual({
      abrechnungsweg: 'selbstzahler',
      brauchtGutachter: false,
      brauchtWerkstatt: true,
      brauchtRueckruf: false,
      feststellungZweig: 'schaden',
    })
  })

  // Der Kern-Bug: schuldfrage kommt VORBELEGT rein (kein Quali-Step) -> Short-Circuit greift nicht.
  it('REGRESSION: Selbstzahler mit vorbelegter schuldfrage sieht KEINEN Gutachter-Finder', () => {
    const w = resolveFlowWeichen({
      ...basis, schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: false, hatSvTermin: false,
    })
    expect(w.brauchtGutachter).toBe(false)
  })

  it('nur_gutachter ist eine Haftpflicht-Variante -> Gutachter ja, KEINE Werkstatt', () => {
    const w = resolveFlowWeichen({ ...basis, schuldfrage: 'gegner', serviceTyp: 'nur_gutachter' })
    expect(w.brauchtGutachter).toBe(true)
    expect(w.brauchtWerkstatt).toBe(false)
  })

  it('Anzeige-Regel: SV-Termin vorhanden -> kein Gutachter-Finder mehr', () => {
    const w = resolveFlowWeichen({ ...basis, schuldfrage: 'gegner', hatSvTermin: true })
    expect(w.brauchtGutachter).toBe(false)
  })

  it('Anzeige-Regel: Werkstatt vorhanden -> kein Werkstatt-Finder mehr', () => {
    const w = resolveFlowWeichen({
      ...basis, schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: false, hatWerkstatt: true,
    })
    expect(w.brauchtWerkstatt).toBe(false)
  })

  it('schuldfrage noch unbekannt (null) -> nichts erzwingen (Quali-Step entscheidet)', () => {
    expect(resolveFlowWeichen(basis)).toEqual({
      abrechnungsweg: null,
      brauchtGutachter: false,
      brauchtWerkstatt: false,
      brauchtRueckruf: false,
      feststellungZweig: 'unfall',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/self-service/__tests__/flow-weichen.test.ts`
Expected: FAIL — `Failed to resolve import "../flow-weichen"`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/self-service/flow-weichen.ts
import { resolveAbrechnungsweg, type Abrechnungsweg } from '@/lib/werkstatt/abrechnungsweg'

export type FeststellungZweig = 'unfall' | 'schaden'

export type FlowWeichen = {
  abrechnungsweg: Abrechnungsweg | null
  brauchtGutachter: boolean
  brauchtWerkstatt: boolean
  brauchtRueckruf: boolean
  feststellungZweig: FeststellungZweig
}

export type FlowWeichenInput = {
  schuldfrage: string | null
  ueberEigeneVersicherung: boolean | null
  freieWerkstattwahl: boolean | null
  serviceTyp: string | null
  hatSvTermin: boolean
  hatWerkstatt: boolean
}

/**
 * Die EINE Weiche des kanonischen FlowLinks. Alles haengt an der schuldfrage:
 *   gegner            -> Haftpflicht: Gutachter + Werkstatt, volle Unfall-Feststellung
 *   unklar            -> Teilschuld: NUR Rueckruf beim Dispatch (Schuld erst klaeren)
 *   eigenverantwortung-> Kasko/Selbstzahler: KEIN Gutachter, Werkstatt anbieten, nur Schaden-Feststellung
 * Anzeige-Regel: ist der SV/die Werkstatt schon zugeordnet, wird sie ANGEZEIGT statt gesucht.
 */
export function resolveFlowWeichen(input: FlowWeichenInput): FlowWeichen {
  const { schuldfrage, ueberEigeneVersicherung, serviceTyp, hatSvTermin, hatWerkstatt } = input

  const abrechnungsweg = resolveAbrechnungsweg({ schuldfrage, ueberEigeneVersicherung })
  const istNurGutachter = serviceTyp === 'nur_gutachter'
  const istTeilschuld = schuldfrage === 'unklar'
  const istEigenverantwortung = schuldfrage === 'eigenverantwortung'

  // Kasko/Selbstzahler = Werkstatt-Reparatur-Weg -> KEIN SV-Gutachten.
  const istReparaturWeg = abrechnungsweg === 'kasko' || abrechnungsweg === 'selbstzahler'

  // Gutachter: nur auf dem Haftpflicht-Weg, und nur solange keiner zugeordnet ist.
  const brauchtGutachter =
    !hatSvTermin && !istTeilschuld && !istReparaturWeg && abrechnungsweg === 'haftpflicht'

  // Werkstatt: auf dem Reparatur-Weg immer; bei Haftpflicht auch (nach dem Gutachten),
  // aber nie bei nur_gutachter und nie, wenn schon eine haengt.
  const brauchtWerkstatt =
    !hatWerkstatt && !istTeilschuld && !istNurGutachter &&
    (istReparaturWeg || abrechnungsweg === 'haftpflicht')

  return {
    abrechnungsweg,
    brauchtGutachter,
    brauchtWerkstatt,
    brauchtRueckruf: istTeilschuld,
    feststellungZweig: istEigenverantwortung ? 'schaden' : 'unfall',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/self-service/__tests__/flow-weichen.test.ts`
Expected: PASS (9/9)

- [ ] **Step 5: Commit**

```bash
git add src/lib/self-service/flow-weichen.ts src/lib/self-service/__tests__/flow-weichen.test.ts
git commit -m "feat(flow): resolveFlowWeichen — die eine DB-getriebene FlowLink-Weiche (pure, getestet)"
```

---

## Task 2: Die Weichen-Inputs an den Client durchreichen (schliesst den lossy-Bug)

**Problem:** `FlowWizardKfz.tsx:287` berechnet `istHaftpflicht` mit **hardcodiertem** `ueberEigeneVersicherung: null` — weil `eigene_versicherung` nie an den Client geht. Der Client kann den Abrechnungsweg heute nicht kennen.

**Files:**
- Modify: `src/app/flow/[token]/page.tsx` (Lead-Props ~Z. 502-551)
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (Z. 287 + Props-Typ)

**Interfaces:**
- Produces: `FlowWizardKfz` erhält neu die Prop `weichen: FlowWeichen` (aus Task 1).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/self-service/__tests__/flow-weichen.test.ts  (ergaenzen)
it('REGRESSION (lossy istHaftpflicht): eigenverantwortung+Kasko darf NICHT als haftpflicht gelten', () => {
  const w = resolveFlowWeichen({
    schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: true, freieWerkstattwahl: true,
    serviceTyp: 'komplett', hatSvTermin: false, hatWerkstatt: false,
  })
  expect(w.abrechnungsweg).toBe('kasko')
  expect(w.abrechnungsweg).not.toBe('haftpflicht')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/self-service/__tests__/flow-weichen.test.ts -t lossy`
Expected: PASS bereits (Task 1 deckt es ab) — dieser Test **fixiert** die Regression. Wenn er fehlschlägt, ist Task 1 falsch.

- [ ] **Step 3: page.tsx — Weichen berechnen und durchreichen**

In `page.tsx`, **nach** `terminMitSv`/`terminPending` (ca. Z. 270) und **vor** den Gates:

```ts
import { resolveFlowWeichen } from '@/lib/self-service/flow-weichen'

const weichen = resolveFlowWeichen({
  schuldfrage: (lead.schuldfrage as string | null) ?? null,
  ueberEigeneVersicherung:
    lead.eigene_versicherung === 'ja' ? true : lead.eigene_versicherung === 'nein' ? false : null,
  freieWerkstattwahl: (lead.freie_werkstattwahl as boolean | null) ?? null,
  serviceTyp: (lead.service_typ as string | null) ?? null,
  hatSvTermin: Boolean(terminMitSv) || terminPending,
  hatWerkstatt: Boolean(lead.reparatur_werkstatt_id ?? lead.werkstatt_id),
})
```

Und die Prop an den Wizard (im `<FlowWizardKfz …>`-Block):
```tsx
weichen={weichen}
```

- [ ] **Step 4: FlowWizardKfz.tsx — lossy-Berechnung ersetzen**

Props-Typ ergänzen: `weichen: FlowWeichen`.

Z. 287-289 **ersetzen**:
```ts
// VORHER (lossy — ueberEigeneVersicherung hardcoded null):
// const istHaftpflicht = resolveAbrechnungsweg({ schuldfrage: schuldfrageWahl, ueberEigeneVersicherung: null }) === 'haftpflicht'

// NACHHER: der Server kennt eigene_versicherung, der Client nicht -> Server-Wahrheit nutzen.
// Waehlt der Kunde die Schuldfrage erst im Quali-Step, liefert der Step den Weg selbst nach.
const istHaftpflicht = weichen.abrechnungsweg === 'haftpflicht'
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` (mit `NODE_OPTIONS=--max-old-space-size=8192`)
Expected: keine Fehler. (Exit 134 = OOM-Crash, **nicht** grün — dann Speicher erhöhen.)

- [ ] **Step 6: Commit**

```bash
git add src/app/flow/[token]/page.tsx src/app/flow/[token]/FlowWizardKfz.tsx src/lib/self-service/__tests__/flow-weichen.test.ts
git commit -m "fix(flow): eigene_versicherung an den Client durchreichen — istHaftpflicht war lossy (hardcoded null)"
```

---

## Task 3: `needsBooking` an die Weiche koppeln (DER Kern-Fix)

**Files:**
- Modify: `src/app/flow/[token]/page.tsx:273` (`needsBooking`), `:285` (`needsWerkstatt`)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/self-service/__tests__/flow-weichen.test.ts  (ergaenzen)
// Aarons "loses Ende": Lead kommt mit schon gesetzter schuldfrage rein (egal welche Tuer),
// der Quali-Step entfaellt (qualiPending=false) -> der Short-Circuit greift NICHT.
// Frueher: needsBooking war rein terminzustands-gegatet -> Gutachter-Finder erschien faelschlich.
it('REGRESSION loses Ende: Kasko-Lead ohne Termin und ohne Quali-Step -> KEIN Gutachter, ABER Werkstatt', () => {
  const w = resolveFlowWeichen({
    schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: true, freieWerkstattwahl: true,
    serviceTyp: 'komplett', hatSvTermin: false, hatWerkstatt: false,
  })
  expect(w.brauchtGutachter).toBe(false)   // frueher: true (Bug)
  expect(w.brauchtWerkstatt).toBe(true)
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/lib/self-service/__tests__/flow-weichen.test.ts`
Expected: PASS (Task 1 deckt die Logik ab; der Test fixiert die Regression).

- [ ] **Step 3: page.tsx — die Gates an die Weiche koppeln**

```ts
// Z. 273-274 — VORHER:
// const needsBooking = !terminMitSv && !terminPending && process.env.CANONICAL_FLOWLINK_ENABLED === 'true'
// NACHHER: zusaetzlich abrechnungsweg-gegatet (Kasko/Selbstzahler/Teilschuld -> kein Gutachter-Finder).
const needsBooking =
  !terminMitSv && !terminPending &&
  process.env.CANONICAL_FLOWLINK_ENABLED === 'true' &&
  // schuldfrage noch offen? -> Quali-Step entscheidet, Termin-Step bleibt moeglich.
  (lead.schuldfrage == null || weichen.brauchtGutachter)

// Z. 285-287 — needsWerkstatt zusaetzlich weichen-gegatet:
const needsWerkstatt =
  process.env.CANONICAL_FLOWLINK_ENABLED === 'true' &&
  brauchtWerkstattVermittlung(lead as unknown as BedarfRow) &&
  (lead.schuldfrage == null || weichen.brauchtWerkstatt)
```

*Warum `lead.schuldfrage == null` als Escape:* Ist die Schuldfrage noch unbekannt, läuft der Kunde durch den Quali-Step — der setzt sie und routet danach selbst (bestehender Short-Circuit). Erst **mit** gesetzter Schuldfrage darf die Weiche hart gaten. Das ist genau die Lücke, die heute offen ist.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/app/flow/[token]/page.tsx src/lib/self-service/__tests__/flow-weichen.test.ts
git commit -m "fix(flow): needsBooking/needsWerkstatt abrechnungsweg-gegatet — Kasko/Selbstzahler sehen keinen Gutachter-Finder mehr"
```

---

## Task 4: Teilschuld → echter Rückruf beim Dispatch

**Kontext:** `schuldfrage='unklar'` läuft heute via `sende('unklar')` → `bewerteSchuldfrage` = `weiter_mit_flag` → `onWeiter()` → **Feststellung/Termin** (also in den Gutachter-Zweig). Und `aendereTerminFlow` setzt nur `leads.status='rueckruf'` **ohne** `admin_termine`-Insert → der Rückruf erscheint **nicht** in der Dispatch-Queue.

**Files:**
- Create: `src/app/flow/[token]/FlowRueckrufStep.tsx`
- Modify: `src/app/flow/[token]/self-service-actions.ts` (neue Action `fordereRueckrufAn`)
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (neuer `rueckruf`-Step in `StepId` + STEPS)
- Test: `src/app/flow/[token]/__tests__/rueckruf-flow.test.ts`

**Interfaces:**
- Consumes: `upsertReservierungsRueckruf({ leadId, startIso, vonKunde })` aus `@/lib/embed/reservierungs-rueckruf` (idempotent, schreibt `admin_termine` typ='rueckruf' status='offen' + weist dem Lead-Dispatcher zu).
- Produces: `fordereRueckrufAn(token: string, wunschzeitIso?: string): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/flow/[token]/__tests__/rueckruf-flow.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsertSpy = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/embed/reservierungs-rueckruf', () => ({
  upsertReservierungsRueckruf: (...args: unknown[]) => upsertSpy(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Lead-Lookup ueber den Token mocken (Muster B: Queue-basierter Supabase-Mock)
let responseQueue: Array<{ data: unknown; error: unknown }> = []
const nextResponse = () => responseQueue.shift() ?? { data: null, error: null }
function makeBuilder() {
  const h: Record<string, unknown> = {}
  h.select = () => h; h.eq = () => h; h.in = () => h; h.order = () => h; h.limit = () => h
  h.maybeSingle = () => Promise.resolve(nextResponse())
  h.single = () => Promise.resolve(nextResponse())
  h.then = (r: (v: unknown) => unknown) => Promise.resolve(nextResponse()).then(r)
  return h
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => makeBuilder(), update: () => makeBuilder() }) }),
}))

import { fordereRueckrufAn } from '../self-service-actions'

describe('fordereRueckrufAn', () => {
  beforeEach(() => { upsertSpy.mockClear(); responseQueue = [] })

  it('legt einen Dispatch-Rueckruf ueber upsertReservierungsRueckruf an', async () => {
    responseQueue = [{ data: { lead_id: 'lead-1' }, error: null }]  // flow_links -> lead
    const r = await fordereRueckrufAn('tok-123')
    expect(r.ok).toBe(true)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const arg = upsertSpy.mock.calls[0][0] as { leadId: string; vonKunde: boolean }
    expect(arg.leadId).toBe('lead-1')
    expect(arg.vonKunde).toBe(true)
  })

  it('ungueltiger Token -> ok:false, kein Rueckruf', async () => {
    responseQueue = [{ data: null, error: null }]
    const r = await fordereRueckrufAn('tok-weg')
    expect(r.ok).toBe(false)
    expect(upsertSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/flow/[token]/__tests__/rueckruf-flow.test.ts`
Expected: FAIL — `fordereRueckrufAn is not a function` (Export existiert nicht).

- [ ] **Step 3: Server-Action implementieren**

In `src/app/flow/[token]/self-service-actions.ts` (Result-Object-Pattern, kein throw):

```ts
import { upsertReservierungsRueckruf } from '@/lib/embed/reservierungs-rueckruf'

/**
 * Teilschuld-Zweig: der Kunde fordert einen Rueckruf beim Dispatch an.
 * Nutzt den idempotenten upsert (genau EIN offener Rueckruf pro Lead) -> admin_termine typ='rueckruf'.
 * Der bestehende aendereTerminFlow setzte nur leads.status='rueckruf' und erzeugte KEINEN Dispatch-Task.
 */
export async function fordereRueckrufAn(
  token: string,
  wunschzeitIso?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  const { data: link } = await supabase
    .from('flow_links').select('lead_id').eq('token', token).maybeSingle()
  const leadId = (link?.lead_id as string | undefined) ?? null
  if (!leadId) return { ok: false, error: 'Link ungültig' }

  const res = await upsertReservierungsRueckruf({
    leadId,
    startIso: wunschzeitIso ?? new Date().toISOString(),
    vonKunde: true,
  })
  if (!res.ok) return { ok: false, error: res.error ?? 'Rückruf konnte nicht angelegt werden' }

  revalidatePath('/dispatch/rueckrufe')
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/flow/[token]/__tests__/rueckruf-flow.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: UI-Step + STEPS-Verdrahtung**

`FlowRueckrufStep.tsx` (neu) — Kunde sieht: „Bei geteilter Schuld klären wir die Haftung persönlich. Wir rufen dich zurück." + Button „Rückruf anfordern" → `fordereRueckrufAn(token)` → Bestätigung.

In `FlowWizardKfz.tsx`:
```ts
type StepId = … | 'rueckruf'                                        // Z. 116 ergaenzen
const [initialBrauchtRueckruf] = useState(weichen.brauchtRueckruf)  // Mount-Capping (Pflicht!)

// im incomplete-Zweig, ANSTELLE von 'termin'/'gutachter':
...(initialBrauchtRueckruf
  ? [{ id: 'rueckruf' as StepId, label: 'Rückruf' }]
  : [{ id: 'termin' as StepId, label: 'Termin' }, { id: 'gutachter' as StepId, label: 'Ihr Gutachter' }]),
```

Und im Quali-Step: Wählt der Kunde `'unklar'`, muss `FlowQualiStep` künftig zum `rueckruf`-Step springen statt `onWeiter()` (analog zum bestehenden `onSelbstzahler`-Sprung):
```ts
// FlowQualiStep.sende(): nach r.ok
if (schuldfrage === 'unklar') { onRueckruf?.(); return }
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/app/flow/[token]` && `npx tsc --noEmit`
Expected: alle grün.

- [ ] **Step 7: Commit**

```bash
git add src/app/flow/[token]/FlowRueckrufStep.tsx src/app/flow/[token]/self-service-actions.ts src/app/flow/[token]/FlowWizardKfz.tsx src/app/flow/[token]/FlowQualiStep.tsx src/app/flow/[token]/__tests__/rueckruf-flow.test.ts
git commit -m "feat(flow): Teilschuld -> echter Rueckruf beim Dispatch (admin_termine via upsertReservierungsRueckruf)"
```

---

## Task 5: Feststellung zweigeteilt (Unfall-Felder raus bei Kasko/Selbstzahler)

**Kontext:** `FESTSTELLUNG_STEPS` (`feststellung-steps.ts:22-44`) hat 11 Steps. Die **Unfall**-Steps sind `hergang`, `wann_wo`, `polizei_zeugen`, `gegner` (letzterer hat bereits `conditional_on: { schuldfrage: 'gegner' }` — die Conditional-Infra existiert also, `meetsCondition` Z. 65-76).

**Files:**
- Modify: `src/app/flow/[token]/feststellung-steps.ts`
- Test: `src/app/flow/[token]/feststellung-steps.test.ts` (existiert bereits — erweitern)

- [ ] **Step 1: Write the failing test**

```ts
// src/app/flow/[token]/feststellung-steps.test.ts  (ergaenzen)
it('Kasko/Selbstzahler: Unfall-Steps (wann_wo, polizei_zeugen, gegner) sind aus, Fahrzeug/Schaden bleiben', () => {
  const aktiv = computeActiveFeststellungSteps(felderByKey, {
    schuldfrage: 'eigenverantwortung', feststellung_zweig: 'schaden',
  })
  const ids = aktiv.map((s) => s.id)
  expect(ids).not.toContain('wann_wo')
  expect(ids).not.toContain('polizei_zeugen')
  expect(ids).not.toContain('gegner')
  expect(ids).toContain('dein_fahrzeug')     // Fahrzeug bleibt (Werkstatt-Matching!)
  expect(ids).toContain('fahrzeugschein')    // ZB1 bleibt (Fahrzeugklasse!)
  expect(ids).toContain('unfalltyp')         // was ist kaputt bleibt
})

it('Haftpflicht: alle Unfall-Steps aktiv', () => {
  const aktiv = computeActiveFeststellungSteps(felderByKey, {
    schuldfrage: 'gegner', feststellung_zweig: 'unfall',
  })
  const ids = aktiv.map((s) => s.id)
  expect(ids).toContain('wann_wo')
  expect(ids).toContain('polizei_zeugen')
  expect(ids).toContain('gegner')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/flow/[token]/feststellung-steps.test.ts`
Expected: FAIL — `wann_wo` ist noch enthalten (keine Zweig-Bedingung).

- [ ] **Step 3: Implementation — Zweig-Bedingung auf den Unfall-Steps**

In `feststellung-steps.ts`: den Unfall-Steps (`hergang`, `wann_wo`, `polizei_zeugen`, `gegner`) ein `conditional_on: { feststellung_zweig: 'unfall' }` geben (zusätzlich zur bestehenden `gegner`-Bedingung), und `FlowFeststellungStep` gibt den Zweig aus `weichen.feststellungZweig` in die `values` hinein (die `meetsCondition`-Infra wertet ihn dann aus — keine neue Mechanik).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/flow/[token]/feststellung-steps.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/flow/[token]/feststellung-steps.ts src/app/flow/[token]/feststellung-steps.test.ts src/app/flow/[token]/FlowFeststellungStep.tsx src/app/flow/[token]/FlowWizardKfz.tsx
git commit -m "feat(flow): Feststellung zweigeteilt — Kasko/Selbstzahler ohne Unfall-Felder (Fahrzeug+Schaden bleiben)"
```

---

## Task 6: Vollständiger Build + Prod-Smoke (Regel 4)

- [ ] **Step 1: Voller Build**

Run: `npm run build` (Next.js 15 findet Route-/Validator-Fehler, die `tsc` allein nicht sieht — `page.tsx` ist eine Route!)
Expected: Compiled successfully.

- [ ] **Step 2: Alle Gates**

```bash
npx vitest run src/lib/self-service src/app/flow src/lib/werkstatt
npm run check:flag-drift
npm run check:knip -- --warn
```

- [ ] **Step 3: PR gegen staging**

```bash
gh pr create --base staging --title "feat(flow): FlowLink-Weichenlogik DB-getrieben (Spec A)" --body "…"
```

- [ ] **Step 4: Prod-Playwright-Smoke (nach Deploy)**

Flows:
1. **Kasko-Lead mit vorbelegter schuldfrage** → `/flow/<token>` → **kein** Termin-Step, **Werkstatt**-Step da. *(Der Kern-Bug.)*
2. **Teilschuld** (`unklar`) → Rückruf-Step → „Rückruf anfordern" → in `/dispatch/rueckrufe` sichtbar (Live-DB-Check `admin_termine typ='rueckruf' status='offen'`).
3. **Haftpflicht** → Feststellung(voll) → Termin → Gutachter → SA (unverändert = Regression-Check).
4. **Selbstzahler** → Feststellung **ohne** Unfall-Felder (kein `wann_wo`/`polizei_zeugen`/`gegner`).

Test-Konten mit `telefon = NULL` (keine echten SMS/WA).

---

## Self-Review

**Spec-Coverage:** §1 schuldfrage-Weiche → Task 1. §3 Matrix (alle 7 Wege) → Task-1-Tests. §4 Anzeige-Regel (`hatSvTermin`/`hatWerkstatt`) → Task 1. §5 Feststellung zweigeteilt → Task 5. §9 der Kern-Fix (`needsBooking`) → Task 3. Teilschuld→Rückruf → Task 4.
**Nicht in Spec A** (bewusst): Werkstatt-**Matching** (Marke/Klasse/Ranking) = Spec B; Werkstatt-**Finder-UI** = Spec C; Einstiegspunkte = Spec D; KVA-Auftrag = Spec E. Der bestehende Werkstatt-Finder (Geo + Gewerke) trägt Spec A.
**Typ-Konsistenz:** `FlowWeichen` wird in Task 1 definiert und in Tasks 2/3/4/5 unter demselben Namen konsumiert. `resolveFlowWeichen` nimmt `ueberEigeneVersicherung: boolean|null` (nicht den DB-Text `'ja'|'nein'`) — die Umwandlung passiert **einmal** in `page.tsx` (Task 2, Step 3).
