# Werkstatt-Embed-Finder (B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine oeffentliche Embed-Seite `/embed/werkstatt-finder`, auf der ein Kunde eine echte Partner-Werkstatt in seiner Naehe findet, auswaehlt und damit db-driven als Reparateur an den entstehenden Lead/Claim vermittelt wird — strecken-unabhaengig (Haftpflicht wie Selbstzahler).

**Architecture:** Der oeffentliche Finder liest echte Partner via `findWerkstaetten({nurEchte:true})` (Test-Werkstaetten email-basiert ausgefiltert), zeigt sie geo-ranked in `WerkstattFinderMap`. Der Pick erzeugt via `createLead(...)` einen Lead mit `reparatur_werkstatt_id=X`/`quelle='embed'` (kanonischer `buildZuweisungPatch`) — aber nur, wenn ein **Write-Time-Test-Guard** (`istInterneEmail(kunde) === istInterneEmail(werkstatt)`) passt. Danach `ensureCanonicalFlowLinkForLead` → Redirect in den bestehenden `/flow`, der die Strecke verzweigt. Alle `reparatur_werkstatt_*`-Felder ueberleben `convertLeadToClaim` (verifiziert). Kein Fern-Treffer: 0 Partner in der Naehe → Lead ohne Werkstatt → Dispatcher.

**Tech Stack:** Next.js 15 App Router (Server Components + Server Actions), Supabase (service-role Admin-Client), Mapbox (WerkstattFinderMap), vitest (env=node), Playwright (Prod-Smoke).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-07-werkstatt-embed-finder-b-design.md`. Roadmap Bau 3/4.
- **Finder-Pick = Reparateur, NIE Vermittler:** immer `reparatur_werkstatt_id` + `reparatur_werkstatt_quelle='embed'`, NIE `werkstatt_id`. Keine 150-EUR-Praemie.
- **Db-driven ueber Kanon:** Zuweisung ausschliesslich via `buildZuweisungPatch(werkstattId, null, 'embed')` aus `src/lib/werkstatt/vermittlung-core.ts`. Kein neuer Assignment-Pfad.
- **Test-Guard (Write-Time):** ein Werkstatt-Assign passiert nur, wenn `istInterneEmail(kundeEmail) === istInterneEmail(werkstattEmail)`. Test-Claim erreicht NIE eine echte Werkstatt und umgekehrt. SSoT: `src/lib/testdaten/interne-identitaet.ts`.
- **Supply-Gate:** kein Partner in der Naehe ODER Guard blockt → Lead OHNE Werkstatt (Dispatcher matcht). Niemals Fern-Treffer erzwingen.
- **Lead-Konstanten:** `source_channel='werkstatt_finder'` (Spalte ist `text`, keine Migration noetig), `status='neu'` (lead_status-Enum, = DB-Default).
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` (nie throw), `revalidatePath` bei Writes wo eine Server-Component betroffen ist. Non-kritische Sub-Ops (Flow-Link) in try/catch.
- **UI-Sprache:** alle nutzersichtbaren Strings Deutsch mit echten Umlauten (ä/ö/ü/ß).
- **Komponenten:** `primitives/*` (Button/Card) + `shared/*`; Claimondo-Tokens (`bg-claimondo-*`, keine Inline-Hex, keine Tailwind-Default-Radien → `rounded-ios-*`).
- **DDL (falls ueberhaupt):** nur via Supabase-Plugin `apply_migration` (Regel 2). Es wird KEINE erwartet.
- **Kein Push auf main** (Regel 1) — PR gegen `staging`.

---

### Task 1: `findWerkstaetten` Test-Ausgrenzung (`nurEchte`)

**Files:**
- Modify: `src/lib/werkstatt/finder.ts`
- Test: `src/lib/werkstatt/finder.test.ts` (existiert ggf. schon — sonst anlegen)

**Interfaces:**
- Consumes: `istInterneEmail` aus `src/lib/testdaten/interne-identitaet.ts` — `istInterneEmail(email: string | null | undefined): boolean`.
- Produces: `filterEchteWerkstaetten<T extends { email: string | null }>(rows: T[]): T[]` (pure, exportiert) + erweiterte `findWerkstaetten`-Signatur mit optionalem `nurEchte?: boolean` (Default `false` = unveraendertes Verhalten fuer die 2 bestehenden Caller).

- [ ] **Step 1: Write the failing test**

In `src/lib/werkstatt/finder.test.ts` ergaenzen (oder Datei mit diesem Inhalt anlegen; `import { describe, it, expect } from 'vitest'`):

```typescript
import { filterEchteWerkstaetten } from './finder'

describe('filterEchteWerkstaetten', () => {
  const rows = [
    { id: '1', email: 'info@schneider-ruhl.de' },      // echt
    { id: '2', email: 'werkstatt-smoke@claimondo.de' }, // intern (Domain)
    { id: '3', email: 'test.werkstatt@web.de' },        // Test-Marker
    { id: '4', email: null },                           // ohne Email -> echt behandelt
  ]
  it('behaelt nur externe/echte Werkstaetten', () => {
    const echte = filterEchteWerkstaetten(rows)
    expect(echte.map((r) => r.id)).toEqual(['1', '4'])
  })
  it('ist eine reine Funktion ohne Seiteneffekt', () => {
    const copy = [...rows]
    filterEchteWerkstaetten(rows)
    expect(rows).toEqual(copy)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/werkstatt/finder.test.ts`
Expected: FAIL — `filterEchteWerkstaetten is not a function` / not exported.

- [ ] **Step 3: Implement the pure filter + wire `nurEchte`**

In `src/lib/werkstatt/finder.ts`:

Am Kopf den Import ergaenzen:
```typescript
import { istInterneEmail } from '@/lib/testdaten/interne-identitaet'
```

Nach `computePasst(...)` die pure Funktion ergaenzen:
```typescript
/**
 * Filtert Test-/interne Werkstaetten (email-basiert, SSoT interne-identitaet.ts) raus.
 * Werkstaetten ohne Email gelten als echt (kein Test-Signal). Fuer die oeffentliche
 * Embed-Nutzung: ein echter Kunde darf keine Test-Werkstatt sehen (und umgekehrt).
 */
export function filterEchteWerkstaetten<T extends { email: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !istInterneEmail(r.email))
}
```

`SELECT_COLS` um `email` erweitern (intern gebraucht, wird vor Rueckgabe gestrippt):
```typescript
const SELECT_COLS = 'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten'
const SELECT_COLS_INTERN = SELECT_COLS + ',email'
```

`findWerkstaetten`-Signatur + Ladepfad anpassen:
```typescript
export async function findWerkstaetten(input: {
  lat?: number
  lng?: number
  plz?: string
  limit?: number
  kategorie?: string | null
  nurEchte?: boolean
}): Promise<WerkstattFinderRow[]> {
  const limit = input.limit ?? 10
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('werkstaetten')
    .select(SELECT_COLS_INTERN)
    .eq('status', STATUS_AKTIV)

  if (error || !data) return []

  // Test-Ausgrenzung fuer oeffentliche Caller, dann email strippen (nicht Teil von WerkstattFinderRow).
  const withEmail = data as Array<Omit<WerkstattFinderRow, 'distanz_km' | 'passt'> & { email: string | null }>
  const gefiltert = input.nurEchte ? filterEchteWerkstaetten(withEmail) : withEmail
  const rows = gefiltert.map(({ email: _email, ...r }) => r)

  if (input.lat !== undefined && input.lng !== undefined) {
    return rankWerkstaetten(rows, { lat: input.lat, lng: input.lng }, input.kategorie).slice(0, limit)
  }
  if (input.plz) {
    return rows
      .map((r) => ({ ...r, distanz_km: Infinity, passt: computePasst(r.faehigkeiten, input.kategorie) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .slice(0, limit)
  }
  return []
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/werkstatt/finder.test.ts`
Expected: PASS (2 passing). Wenn die Datei schon andere Tests hatte: alle weiterhin gruen.

- [ ] **Step 5: Typecheck die geaenderte Datei**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler in `finder.ts` (bestehende Repo-weite Fehler ignorieren — CI ist autoritativ).

- [ ] **Step 6: Commit**

```bash
git add src/lib/werkstatt/finder.ts src/lib/werkstatt/finder.test.ts
git commit -m "feat(werkstatt): findWerkstaetten nurEchte-Filter (Test-Werkstaetten raus fuer public embed)"
```

---

### Task 2: B-Kern — Test-Guard + Lead-Extra-Builder (pure)

**Files:**
- Create: `src/lib/werkstatt/embed-finder-core.ts`
- Test: `src/lib/werkstatt/embed-finder-core.test.ts`

**Interfaces:**
- Consumes: `istInterneEmail` (`@/lib/testdaten/interne-identitaet`); `buildZuweisungPatch(werkstattId: string, userId: string | null, quelle: VermittlungQuelle): Record<string, unknown>` (`@/lib/werkstatt/vermittlung-core`).
- Produces:
  - `darfWerkstattZuweisen(kundeEmail: string | null | undefined, werkstattEmail: string | null | undefined): boolean`
  - `buildWerkstattFinderLeadExtra(input: WerkstattFinderLeadInput): Record<string, unknown>`
  - `type WerkstattFinderLeadInput = { werkstattId: string | null; werkstattEmail: string | null; kundeEmail: string | null; lat?: number | null; lng?: number | null; ort?: string | null }`

- [ ] **Step 1: Write the failing test**

`src/lib/werkstatt/embed-finder-core.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { darfWerkstattZuweisen, buildWerkstattFinderLeadExtra } from './embed-finder-core'

describe('darfWerkstattZuweisen', () => {
  it('erlaubt echt+echt', () => {
    expect(darfWerkstattZuweisen('kunde@web.de', 'info@schneider-ruhl.de')).toBe(true)
  })
  it('erlaubt test+test', () => {
    expect(darfWerkstattZuweisen('test-kunde@claimondo.de', 'werkstatt-smoke@claimondo.de')).toBe(true)
  })
  it('blockt echt-Kunde + Test-Werkstatt', () => {
    expect(darfWerkstattZuweisen('kunde@web.de', 'werkstatt-smoke@claimondo.de')).toBe(false)
  })
  it('blockt Test-Kunde + echte Werkstatt', () => {
    expect(darfWerkstattZuweisen('e2e@claimondo.de', 'info@schneider-ruhl.de')).toBe(false)
  })
})

describe('buildWerkstattFinderLeadExtra', () => {
  it('weist Reparateur zu (quelle=embed) wenn Guard passt', () => {
    const extra = buildWerkstattFinderLeadExtra({
      werkstattId: 'ws-1', werkstattEmail: 'info@schneider-ruhl.de',
      kundeEmail: 'kunde@web.de', lat: 51.2, lng: 6.7, ort: 'Ratingen',
    })
    expect(extra.reparatur_werkstatt_id).toBe('ws-1')
    expect(extra.reparatur_werkstatt_quelle).toBe('embed')
    expect(extra.reparatur_vermittlung_status).toBe('vermittelt')
    expect(extra.reparaturwunsch).toBe('reparatur')
    expect(extra.fahrzeug_standort_lat).toBe(51.2)
    expect(extra.fahrzeug_standort_lng).toBe(6.7)
  })
  it('Supply-Gate: kein werkstattId -> keine Werkstatt-Felder, nur Geo', () => {
    const extra = buildWerkstattFinderLeadExtra({
      werkstattId: null, werkstattEmail: null, kundeEmail: 'kunde@web.de', lat: 52.5, lng: 13.4, ort: 'Berlin',
    })
    expect(extra.reparatur_werkstatt_id).toBeUndefined()
    expect(extra.reparaturwunsch).toBeUndefined()
    expect(extra.fahrzeug_standort_lat).toBe(52.5)
  })
  it('Guard-Block: echt-Kunde + Test-Werkstatt -> keine Werkstatt-Felder', () => {
    const extra = buildWerkstattFinderLeadExtra({
      werkstattId: 'ws-test', werkstattEmail: 'werkstatt-smoke@claimondo.de',
      kundeEmail: 'kunde@web.de', lat: 51, lng: 7, ort: 'Koeln',
    })
    expect(extra.reparatur_werkstatt_id).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/werkstatt/embed-finder-core.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement the pure core**

`src/lib/werkstatt/embed-finder-core.ts`:

```typescript
// Pure Kern des Werkstatt-Embed-Finders (client-safe, kein Server-Import):
// Write-Time-Test-Guard + Bau des createLead-`extra`-Objekts. Die Zuweisung nutzt den
// kanonischen buildZuweisungPatch (Reparateur-Slot, quelle='embed') — NIE werkstatt_id.
import { istInterneEmail } from '@/lib/testdaten/interne-identitaet'
import { buildZuweisungPatch } from '@/lib/werkstatt/vermittlung-core'

export type WerkstattFinderLeadInput = {
  werkstattId: string | null
  werkstattEmail: string | null
  kundeEmail: string | null
  lat?: number | null
  lng?: number | null
  ort?: string | null
}

/**
 * Darf die (gewaehlte) Werkstatt dem Kunden zugewiesen werden? Nur wenn beide dieselbe
 * "Test-Ness" haben — so erreicht ein Test-Claim NIE eine echte Werkstatt und umgekehrt
 * (analog A-Trigger, hier am Write-Pfad des Embed-Finders).
 */
export function darfWerkstattZuweisen(
  kundeEmail: string | null | undefined,
  werkstattEmail: string | null | undefined,
): boolean {
  return istInterneEmail(kundeEmail) === istInterneEmail(werkstattEmail)
}

/**
 * Baut das `extra`-Objekt fuer createLead. Weist die Werkstatt als Reparateur zu
 * (buildZuweisungPatch + reparaturwunsch='reparatur') NUR wenn eine gewaehlt wurde UND
 * der Test-Guard passt. Sonst (Supply-Gate ODER Guard-Block): nur Geo, keine Werkstatt.
 */
export function buildWerkstattFinderLeadExtra(input: WerkstattFinderLeadInput): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    fahrzeug_standort_lat: input.lat ?? null,
    fahrzeug_standort_lng: input.lng ?? null,
    fahrzeug_standort_adresse: input.ort ?? null,
  }
  if (input.werkstattId && darfWerkstattZuweisen(input.kundeEmail, input.werkstattEmail)) {
    Object.assign(extra, buildZuweisungPatch(input.werkstattId, null, 'embed'), {
      reparaturwunsch: 'reparatur',
    })
  }
  return extra
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/werkstatt/embed-finder-core.test.ts`
Expected: PASS (8 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/werkstatt/embed-finder-core.ts src/lib/werkstatt/embed-finder-core.test.ts
git commit -m "feat(werkstatt): B embed-finder pure core (Write-Time-Test-Guard + Reparateur-Lead-Extra)"
```

---

### Task 3: Server-Action `erstelleWerkstattFinderLead`

**Files:**
- Create: `src/app/embed/werkstatt-finder/actions.ts`
- (Verifikation: Build + Smoke in Task 6 — die Entscheidungslogik ist bereits in Task 2 TDD-getestet; die Action ist reine Verdrahtung.)

**Interfaces:**
- Consumes: `createLead(client, base, extra)` (`@/lib/leads/create-lead`), `createAdminClient()` (`@/lib/supabase/admin`), `buildWerkstattFinderLeadExtra` (Task 2), `ensureCanonicalFlowLinkForLead(leadId, opts?)` (`@/lib/start-link/ensure-flowlink-for-lead`), `getConsentedGaClientId()` (`@/lib/analytics/ga4-conversions`).
- Produces: `erstelleWerkstattFinderLead(payload: WerkstattFinderLeadPayload): Promise<{ ok: true; token: string } | { ok: false; error: string }>` und `type WerkstattFinderLeadPayload`.

- [ ] **Step 1: Werkstatt-Email-Loader-Signatur festlegen (Konsum von create-lead pruefen)**

Vor dem Schreiben: `src/lib/leads/create-lead.ts` lesen und die exakten Typen `LeadBase` / `LeadExtra` / `CreateLeadResult` bestaetigen (Task-Interfaces oben). `createLead` erwartet `base.source_channel` + `base.status` als Pflicht.

- [ ] **Step 2: Action implementieren**

`src/app/embed/werkstatt-finder/actions.ts`:

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { buildWerkstattFinderLeadExtra } from '@/lib/werkstatt/embed-finder-core'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { getConsentedGaClientId } from '@/lib/analytics/ga4-conversions'

export type WerkstattFinderLeadPayload = {
  vorname?: string | null
  nachname?: string | null
  email: string
  telefon?: string | null
  werkstattId?: string | null
  lat?: number | null
  lng?: number | null
  ort?: string | null
}

/**
 * Oeffentlicher Embed-Finder: legt einen Lead an (Reparateur-Zuweisung nur wenn gewaehlt
 * UND Test-Guard passt, sonst Supply-Gate=ohne Werkstatt) und liefert einen FlowLink-Token,
 * mit dem der Kunde in den bestehenden /flow einsteigt (dieser verzweigt die Strecke).
 */
export async function erstelleWerkstattFinderLead(
  payload: WerkstattFinderLeadPayload,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!payload.email?.trim()) return { ok: false, error: 'E-Mail fehlt' }

  const admin = createAdminClient()

  // Werkstatt-Email fuer den Test-Guard (nur wenn eine Werkstatt gewaehlt wurde).
  let werkstattEmail: string | null = null
  if (payload.werkstattId) {
    const { data: ws } = await admin
      .from('werkstaetten')
      .select('email')
      .eq('id', payload.werkstattId)
      .maybeSingle()
    werkstattEmail = (ws?.email as string | null) ?? null
  }

  const gaClientId = await getConsentedGaClientId()

  const extra = buildWerkstattFinderLeadExtra({
    werkstattId: payload.werkstattId ?? null,
    werkstattEmail,
    kundeEmail: payload.email,
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    ort: payload.ort ?? null,
  })
  if (gaClientId) (extra as Record<string, unknown>).ga_client_id = gaClientId

  const result = await createLead(
    admin,
    {
      vorname: payload.vorname ?? null,
      nachname: payload.nachname ?? null,
      email: payload.email,
      telefon: payload.telefon ?? null,
      source_channel: 'werkstatt_finder',
      status: 'neu',
    },
    extra,
  )
  if (!result.ok) return { ok: false, error: result.error }

  // Non-kritisch: FlowLink erzeugen. Schlaegt er fehl, ist der Lead trotzdem da (Dispatcher greift).
  try {
    const link = await ensureCanonicalFlowLinkForLead(result.id)
    if (link.ok) return { ok: true, token: link.token }
    return { ok: false, error: link.error }
  } catch (err) {
    console.error('[werkstatt-finder] FlowLink fehlgeschlagen', err)
    return { ok: false, error: 'Flow-Link konnte nicht erstellt werden' }
  }
}
```

Hinweis Feld-Namen: `createLead`s `CreateLeadResult` liefert bei Erfolg `{ ok: true; id: string }` — falls die reale Signatur abweicht (z. B. `{ id }` ohne `ok`), in Step 1 gepruefte Form verwenden und den Erfolgs-Check hier angleichen.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler in `actions.ts`. `createLead`/`ensureCanonicalFlowLinkForLead`-Typen muessen passen (in Step 1 verifiziert).

- [ ] **Step 4: Commit**

```bash
git add src/app/embed/werkstatt-finder/actions.ts
git commit -m "feat(werkstatt): erstelleWerkstattFinderLead action (createLead + guard-extra + flowlink)"
```

---

### Task 4: Oeffentliche Embed-Seite `page.tsx`

**Files:**
- Create: `src/app/embed/werkstatt-finder/page.tsx`
- Referenz-Vorlage (nur lesen, NICHT aendern): `src/app/embed/gutachter-finder/page.tsx`, `src/app/embed/gutachter-finder/_lib/trusted-origin.ts`, `src/app/embed/gutachter-finder/_components/ConsentBridge.tsx`

**Interfaces:**
- Consumes: `isTrustedParentOrigin`, `ConsentBridge` (per Import aus den gutachter-finder-Pfaden — DRY, ohne die Hot-Lane-Dateien zu veraendern); `WerkstattFinderEmbedClient` (Task 5).
- Produces: die Route `/embed/werkstatt-finder` (Server Component), die `searchParams: { lat?, lng?, plz? }` entgegennimmt und den Client rendert.

- [ ] **Step 1: Vorlage lesen**

`src/app/embed/gutachter-finder/page.tsx` vollstaendig lesen — Struktur (searchParams-Await, GTM-Block, `<ConsentBridge/>`, Client-Render, iframe-Freigabe/`X-Frame`-Verhalten) uebernehmen.

- [ ] **Step 2: Seite implementieren**

`src/app/embed/werkstatt-finder/page.tsx`:

```typescript
import { ConsentBridge } from '../gutachter-finder/_components/ConsentBridge'
import { WerkstattFinderEmbedClient } from './WerkstattFinderEmbedClient'

export const dynamic = 'force-dynamic'

export default async function WerkstattFinderEmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string; plz?: string }>
}) {
  const sp = await searchParams
  const lat = sp.lat ? Number(sp.lat) : undefined
  const lng = sp.lng ? Number(sp.lng) : undefined
  const plz = sp.plz?.trim() || undefined

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ConsentBridge />
      <WerkstattFinderEmbedClient
        initialLat={Number.isFinite(lat) ? lat : undefined}
        initialLng={Number.isFinite(lng) ? lng : undefined}
        initialPlz={plz}
      />
    </div>
  )
}
```

(Falls die gutachter-Vorlage einen GTM-Block via env `GF_GTM_ID` rendert und B dasselbe Tracking will, den Block 1:1 uebernehmen. MVP: nur `ConsentBridge` + Client.)

- [ ] **Step 3: Build-Check der Route**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler. (Voller `npm run build` in Task 6 / CI.)

- [ ] **Step 4: Commit**

```bash
git add src/app/embed/werkstatt-finder/page.tsx
git commit -m "feat(werkstatt): /embed/werkstatt-finder public page (trusted-origin + consent template)"
```

---

### Task 5: `WerkstattFinderEmbedClient`

**Files:**
- Create: `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx`
- Modify: `src/lib/werkstatt/finder.ts` — NICHT noetig (findWerkstaetten ist server-only via createAdminClient). Der Client ruft eine kleine Such-Action.
- Create (Such-Action): in `src/app/embed/werkstatt-finder/actions.ts` (Task 3 erweitern) eine `sucheEchteWerkstaetten(input)`-Action.

**Interfaces:**
- Consumes: `WerkstattFinderMap` (`@/components/kunde/WerkstattFinderMap`, Props `{ werkstaetten: WerkstattFinderRow[]; center: {lat:number;lng:number} | null; onSelect: (id: string) => void; selectedId?: string | null; loading?: boolean }`); `erstelleWerkstattFinderLead` (Task 3); `WerkstattFinderRow` (`@/lib/werkstatt/finder`); primitives `Button`, shared `SectionCard`, `forms/TextField`.
- Produces: das Client-UI + eine neue Such-Action `sucheEchteWerkstaetten`.

- [ ] **Step 1: Such-Action ergaenzen (Task-3-Datei)**

In `src/app/embed/werkstatt-finder/actions.ts` ergaenzen (findWerkstaetten ist server-only, darum ueber eine Action):

```typescript
import { findWerkstaetten, type WerkstattFinderRow } from '@/lib/werkstatt/finder'

export async function sucheEchteWerkstaetten(input: {
  lat?: number
  lng?: number
  plz?: string
}): Promise<WerkstattFinderRow[]> {
  return findWerkstaetten({ ...input, nurEchte: true, limit: 10 })
}
```

- [ ] **Step 2: Client implementieren**

`src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx` (`'use client'`). Flow: (a) beim Mount mit initialen lat/lng/plz `sucheEchteWerkstaetten` → Liste; (b) `WerkstattFinderMap` zeigt Ergebnisse, `onSelect` setzt `selectedId`; (c) Kurz-Kontaktformular (Vorname/Nachname/E-Mail/Telefon); (d) Absenden → `erstelleWerkstattFinderLead({...kontakt, werkstattId: selectedId, lat, lng, ort})` → bei `ok` `window.location.href = /flow/${token}`; (e) Supply-Gate: 0 Treffer → Hinweis „Wir finden die passende Werkstatt fuer dich" + Absenden ohne `werkstattId` erlaubt (Dispatcher matcht).

Konkrete Struktur:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives/Button'
import { WerkstattFinderMap } from '@/components/kunde/WerkstattFinderMap'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { sucheEchteWerkstaetten, erstelleWerkstattFinderLead } from './actions'

type Props = { initialLat?: number; initialLng?: number; initialPlz?: string }

export function WerkstattFinderEmbedClient({ initialLat, initialLng, initialPlz }: Props) {
  const [rows, setRows] = useState<WerkstattFinderRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ vorname: '', nachname: '', email: '', telefon: '' })
  const [sending, setSending] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    setLoading(true)
    sucheEchteWerkstaetten({ lat: initialLat, lng: initialLng, plz: initialPlz })
      .then((r) => { if (aktiv) setRows(r) })
      .finally(() => { if (aktiv) setLoading(false) })
    return () => { aktiv = false }
  }, [initialLat, initialLng, initialPlz])

  const center = initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  const gewaehlt = rows.find((r) => r.id === selectedId) ?? null

  async function absenden() {
    setFehler(null)
    if (!form.email.trim()) { setFehler('Bitte E-Mail angeben.'); return }
    setSending(true)
    const res = await erstelleWerkstattFinderLead({
      vorname: form.vorname || null,
      nachname: form.nachname || null,
      email: form.email,
      telefon: form.telefon || null,
      werkstattId: selectedId,
      lat: initialLat ?? null,
      lng: initialLng ?? null,
      ort: gewaehlt?.adresse_ort ?? null,
    })
    setSending(false)
    if (res.ok) { window.location.href = `/flow/${res.token}` }
    else setFehler(res.error)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-heading-md text-claimondo-navy">Werkstatt in deiner Naehe finden</h1>
      <WerkstattFinderMap
        werkstaetten={rows}
        center={center}
        onSelect={setSelectedId}
        selectedId={selectedId}
        loading={loading}
      />
      {!loading && rows.length === 0 && (
        <p className="text-body-sm text-claimondo-slate">
          Wir haben aktuell keine Partner-Werkstatt in direkter Naehe — kein Problem: gib deine
          Kontaktdaten an, wir finden die passende Werkstatt fuer dich.
        </p>
      )}
      <div className="space-y-2">
        <input className="w-full rounded-ios-md border border-claimondo-border p-2" placeholder="Vorname"
          value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} />
        <input className="w-full rounded-ios-md border border-claimondo-border p-2" placeholder="Nachname"
          value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} />
        <input className="w-full rounded-ios-md border border-claimondo-border p-2" placeholder="E-Mail" type="email"
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="w-full rounded-ios-md border border-claimondo-border p-2" placeholder="Telefon"
          value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
      </div>
      {fehler && <p className="text-body-sm text-danger-strong">{fehler}</p>}
      <Button onClick={absenden} loading={sending} disabled={sending}>
        {gewaehlt ? `Weiter mit ${gewaehlt.name}` : 'Passende Werkstatt anfragen'}
      </Button>
    </div>
  )
}
```

(Boy-Scout: wenn `forms/TextField` aus `@/components/shared/forms/TextField` sauber passt, die vier `<input>` dadurch ersetzen — sonst obige token-konforme Inputs behalten. Kein handgerollter Button — `primitives/Button`.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Route `/embed/werkstatt-finder` kompiliert. (Falls `@turf/union` lokal fehlt = pre-existing #3755 → CI ist autoritativ; dann nur `npx tsc --noEmit` fuer die neuen Dateien gruen.)

- [ ] **Step 4: Component-Set / Token-Audit Ratchets**

Run: `npm run check:component-set -- --warn` und `npm run check:token-audit`
Expected: 0 neue Verstoesse (Button aus primitives, Tokens statt Hex, `rounded-ios-*`).

- [ ] **Step 5: Commit**

```bash
git add src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx src/app/embed/werkstatt-finder/actions.ts
git commit -m "feat(werkstatt): WerkstattFinderEmbedClient (finder + pick + kontakt + flow-redirect)"
```

---

### Task 6: Prod-Smoke (nur Test-Accounts)

**Files:**
- Create (LOKAL, NICHT committen — enthaelt Passwoerter): `scripts/prod-smoke-werkstatt-finder.mjs`

**Interfaces:**
- Consumes: Playwright (`playwright`), `./smoke/helpers.mjs` falls Login noetig (der Embed ist public → i. d. R. kein Login).

- [ ] **Step 1: Smoke-Script schreiben**

`scripts/prod-smoke-werkstatt-finder.mjs` — SW-frei (Broadcast), gegen `https://app.claimondo.de/embed/werkstatt-finder`. Checks: (1) Seite rendert (kein leerer Shell/Error), (2) Karte + Liste laden, (3) **nur echte Partner sichtbar** (keine „SMOKE"/„Test"-Werkstatt in der Liste — der oeffentliche Finder ist `nurEchte`), (4) Kontaktfeld absendbar. Fuer den **Zuweisungs-Pfad** mit Test-Daten: separat verifizieren, dass ein Test-Kunde (`test-kunde@claimondo.de`) NICHT an eine echte Werkstatt zugewiesen wird (Guard) — via kurzem SQL-Read nach einem Test-Submit ODER als Unit-Beleg (Task 2 deckt das bereits ab; der Smoke prueft primaer die public-Sicht).

```javascript
import { chromium } from 'playwright'
const BASE = 'https://app.claimondo.de'
const results = []
const check = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? ' — ' + d : ''}`) }
const browser = await chromium.launch()
const ctx = await browser.newContext({ serviceWorkers: 'block' })
try {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/embed/werkstatt-finder?lat=51.3&lng=6.85`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
  const body = (await page.textContent('body').catch(() => '')) || ''
  check('Seite rendert', body.length > 200 && !/Application error|client-side exception/i.test(body))
  check('Finder-Ueberschrift da', /Werkstatt in deiner N/i.test(body))
  check('keine Test-Werkstatt sichtbar (nurEchte)', !/SMOKE|Test-Werkstatt|werkstatt-smoke/i.test(body))
} finally { await browser.close() }
const passed = results.filter((r) => r.ok).length
console.log(`\n=== ${passed}/${results.length} PASS ===`)
process.exit(passed === results.length ? 0 : 1)
```

- [ ] **Step 2: Smoke lokal ausfuehren (nach Deploy)**

Run: `node scripts/prod-smoke-werkstatt-finder.mjs`
Expected (nach staging→main-Deploy): 3/3 PASS. Vor Deploy: Seite 404 → als Baseline dokumentieren.

- [ ] **Step 3: PR eroeffnen**

```bash
git push -u origin kitta/werkstatt-embed-finder
gh pr create --base staging --title "feat(werkstatt): B — /embed/werkstatt-finder (db-driven Reparateur-Vermittlung)" --body "..."
```

PR-Body: Spec-Link, die 4 Kern-Entscheidungen, Audit-7-Punkte, Test-Guard-Erklaerung, Smoke-Status.

---

## Self-Review

**1. Spec coverage:**
- Oeffentliche `/embed/werkstatt-finder` → Task 4. ✓
- Finder zeigt In-DB-Partner, Test raus → Task 1 (`nurEchte`) + Task 5. ✓
- Pick = Reparateur, quelle='embed', kein Praemie → Task 2 (`buildZuweisungPatch(...,'embed')`, nie werkstatt_id). ✓
- Db-driven via kanonischem Patch → Task 2. ✓
- Test-Guard (Write-Time) → Task 2 (`darfWerkstattZuweisen`). ✓
- Supply-Gate → Task 2 (kein werkstattId → keine Werkstatt-Felder) + Task 5 (UI-Hinweis). ✓
- Beide Strecken → Task 3 (FlowLink → bestehender /flow verzweigt). ✓
- convertLeadToClaim traegt Felder → verifiziert (Explore), kein Task noetig. ✓
- Smoke (test-only) → Task 6. ✓

**2. Placeholder-Scan:** Keine TBD/TODO. Zwei bewusste „confirm at task start"-Punkte (createLead-Result-Shape in T3 Step 1; forms/TextField-Passung in T5) sind Verifikations-Schritte gegen echte Dateien, keine Platzhalter — beide mit Fallback-Verhalten spezifiziert.

**3. Type-Konsistenz:** `WerkstattFinderRow` (finder.ts) einheitlich in T1/T5. `buildZuweisungPatch(werkstattId, userId, quelle)` konsistent mit vermittlung-core.ts (gelesen). `createLead(client, base, extra)` + `ensureCanonicalFlowLinkForLead(leadId)` → `{ok:true, token}` konsistent aus Explore. `source_channel='werkstatt_finder'` (text) + `status='neu'` (enum) DB-verifiziert. `quelle='embed'` ∈ VermittlungQuelle (gelesen).

**Offene Build-Verifikation (in den Tasks verankert):** createLead-Erfolgs-Shape (`{ok:true;id}` vs `{id}`) in T3 Step 1 gegen die echte Datei pruefen und den Check angleichen.
