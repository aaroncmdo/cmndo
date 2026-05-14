# AAR-894 — Dispatcher-Karte v1 (Leads-Triage-Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echte Mapbox-Karte unter `/dispatch/karte` mit Triage-Backlog-Leads als klickbaren Pins (Popup + Detail-Link) und Supabase-Realtime-Updates.

**Architecture:** Server-Component lädt Triage-Leads (hybrid geo: `leads.besichtigungsort_lat/lng` → `unfallort_lat/lng` → PLZ-Centroid via neuer `plz_geo`-Tabelle → "nicht lokalisierbar"-Liste) und übergibt initialen Snapshot an `DispatchKarteClient`. Client mountet Mapbox-GL via `ensureMapboxInitialized()`, rendert Marker, abonniert `leads`+`auftraege`-Realtime und refetched on-event via Server-Action.

**Tech Stack:** Next.js 15 App-Router, Supabase (Postgres + Realtime), Mapbox-GL-JS (bereits im Bundle, `src/lib/mapbox/client.ts`), TypeScript, Vitest für pure-function-Tests, Tailwind/Claimondo-Tokens.

**Linear:** [AAR-894](https://linear.app/aaroncmndo/issue/AAR-894/dispatcher-karte-v1-leads-triage-layer)

---

## File Structure

**Create:**
- `supabase/migrations/<timestamp>_create_plz_geo.sql` — Tabelle + RLS (read-only für authenticated)
- `scripts/seed-plz-geo.mjs` — One-Shot-Seed aus OpenPLZ (BSD-Daten von zauberware/postal-codes-json-xml-csv)
- `src/lib/dispatch/karte/types.ts` — `TriageLeadPin`, `UnlocalizedLead`, `TriageSnapshot`
- `src/lib/dispatch/karte/triage-leads.ts` — `resolveLeadGeo()` (pure), `getTriageLeads()` (server)
- `src/lib/dispatch/karte/triage-leads.test.ts` — Vitest-Tests für `resolveLeadGeo`
- `src/app/dispatch/karte/page.tsx` — Server-Component, RBAC kommt vom `dispatch/layout.tsx`
- `src/app/dispatch/karte/DispatchKarteClient.tsx` — Mapbox-Container, Marker, Popup-Mount
- `src/app/dispatch/karte/LeadPopup.tsx` — Popup-Card (Kunde, Schadenstyp, Alter, Detail-Link)
- `src/app/dispatch/karte/UnlocalizedSidebar.tsx` — Liste der Leads ohne Geo
- `src/app/dispatch/karte/useTriageRealtime.ts` — `leads` + `auftraege` Subscription + Refetch-Callback
- `src/app/dispatch/karte/actions.ts` — `refetchTriageSnapshot()` Server-Action

**Modify:**
- `src/app/dispatch/_components/DispatchNav.tsx` — neuen Nav-Eintrag "Karte"

**No changes:** `src/app/dispatch/layout.tsx` (RBAC bereits korrekt für `['dispatch','admin']`).

---

## Task 1: PLZ-Centroid-Tabelle anlegen

**Files:**
- Create: `supabase/migrations/<timestamp>_create_plz_geo.sql`

- [ ] **Step 1: Migration generieren**

Run:
```
npx supabase migration new create_plz_geo
```
Expected: Datei `supabase/migrations/<YYYYMMDDHHMMSS>_create_plz_geo.sql` wird erstellt.

- [ ] **Step 2: SQL in Migration einfügen**

```sql
-- AAR-894: PLZ→Geo-Centroid Lookup für Dispatcher-Karte v1.
-- Quelle: zauberware/postal-codes-json-xml-csv (BSD). Seed via scripts/seed-plz-geo.mjs.
-- Read-only für alle authenticated Nutzer. Keine Inserts/Updates aus dem App-Code.

CREATE TABLE IF NOT EXISTS public.plz_geo (
  plz text PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  ort text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plz_geo_lat_lng_idx ON public.plz_geo (lat, lng);

ALTER TABLE public.plz_geo ENABLE ROW LEVEL SECURITY;

-- Alle eingeloggten Rollen dürfen lesen
CREATE POLICY "plz_geo_read_authenticated"
  ON public.plz_geo
  FOR SELECT
  TO authenticated
  USING (true);

-- Kein Insert/Update/Delete aus dem App-Code — nur per service_role (Seed-Script)
COMMENT ON TABLE public.plz_geo IS
  'PLZ→Centroid Lookup für Karten-Fallback wenn leads keine eigene Geo haben. AAR-894.';
```

- [ ] **Step 3: Migration applizieren**

Run:
```
npx supabase db push
```
Expected: `Applied migration <YYYYMMDDHHMMSS>_create_plz_geo.sql`.

- [ ] **Step 4: Tabelle verifizieren**

Run:
```
npx supabase db query --linked --command "SELECT count(*) FROM plz_geo;"
```
Expected: `count = 0` (noch nicht geseedet).

- [ ] **Step 5: Commit**

```
git add supabase/migrations/*_create_plz_geo.sql
git commit -m "feat(AAR-894): plz_geo Tabelle für Dispatcher-Karte-Fallback anlegen"
```

---

## Task 2: PLZ-Centroid-Seed-Script

**Files:**
- Create: `scripts/seed-plz-geo.mjs`

- [ ] **Step 1: Datenquelle prüfen**

Verifiziere im Browser dass `https://raw.githubusercontent.com/zauberware/postal-codes-json-xml-csv/master/data/DE.json` erreichbar ist und Format `[{ "zipcode": "01067", "place": "Dresden", "latitude": "51.0509", "longitude": "13.7383" }, ...]` liefert.

Falls die Quelle weg ist: Alternative `https://datahub.io/core/zipcode-data` oder `https://www.suche-postleitzahl.org/downloads`. Bei Wechsel das Mapping in Step 2 anpassen.

- [ ] **Step 2: Script schreiben**

```javascript
#!/usr/bin/env node
// AAR-894: Seedet plz_geo aus zauberware/postal-codes-json-xml-csv (BSD).
// Idempotent (ON CONFLICT DO UPDATE). Service-Role-Key erforderlich.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SOURCE_URL =
  'https://raw.githubusercontent.com/zauberware/postal-codes-json-xml-csv/master/data/DE.json'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY benötigt')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

async function loadSource() {
  if (process.argv[2]) {
    // Lokaler Datei-Pfad als Override
    return JSON.parse(readFileSync(process.argv[2], 'utf8'))
  }
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Fetch ${SOURCE_URL} → ${res.status}`)
  return await res.json()
}

function normalize(entry) {
  const plz = String(entry.zipcode ?? entry.postal_code ?? '').trim()
  const lat = Number(entry.latitude ?? entry.lat)
  const lng = Number(entry.longitude ?? entry.lng)
  if (!plz || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { plz, lat, lng, ort: entry.place ?? entry.city ?? null }
}

async function upsertChunk(rows) {
  const { error } = await supabase
    .from('plz_geo')
    .upsert(rows, { onConflict: 'plz' })
  if (error) throw error
}

async function main() {
  console.log('Lade Quelle…')
  const raw = await loadSource()
  console.log(`Quelle: ${raw.length} Einträge`)
  const rows = raw.map(normalize).filter(Boolean)
  console.log(`Normalisiert: ${rows.length}`)

  // PLZ sind in DE nicht 1:1 → 1 Centroid; Quelle hat oft mehrere Einträge pro PLZ
  // (verschiedene Orte). Wir nehmen den ersten und überspringen Duplikate.
  const seen = new Set()
  const unique = []
  for (const r of rows) {
    if (seen.has(r.plz)) continue
    seen.add(r.plz)
    unique.push(r)
  }
  console.log(`Unique PLZ: ${unique.length}`)

  const CHUNK = 500
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    await upsertChunk(chunk)
    process.stdout.write(`\r${i + chunk.length}/${unique.length}`)
  }
  console.log('\nFertig.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 3: Script ausführbar machen**

```
chmod +x scripts/seed-plz-geo.mjs
```

- [ ] **Step 4: Seed laufen lassen**

Run:
```
node scripts/seed-plz-geo.mjs
```
Expected: Output endet mit "Fertig." und ~8.000 PLZ wurden ge-upserted.

- [ ] **Step 5: Verifizieren**

```
npx supabase db query --linked --command "SELECT count(*), min(lat), max(lat), min(lng), max(lng) FROM plz_geo;"
```
Expected: count zwischen 7.500 und 9.500 (PLZ-Bereich DE), lat 47–55, lng 5–15.

Stichprobe:
```
npx supabase db query --linked --command "SELECT * FROM plz_geo WHERE plz IN ('10115','80331','20095','01067') ORDER BY plz;"
```
Expected: Berlin (~52.53, 13.38), München (~48.13, 11.57), Hamburg (~53.55, 9.99), Dresden (~51.05, 13.74).

- [ ] **Step 6: Commit**

```
git add scripts/seed-plz-geo.mjs
git commit -m "feat(AAR-894): seed-plz-geo.mjs — OpenPLZ-Daten in plz_geo upserten"
```

---

## Task 3: Triage-Lead-Types + pure `resolveLeadGeo` (TDD)

**Files:**
- Create: `src/lib/dispatch/karte/types.ts`
- Create: `src/lib/dispatch/karte/triage-leads.ts`
- Create: `src/lib/dispatch/karte/triage-leads.test.ts`

- [ ] **Step 1: Types schreiben**

`src/lib/dispatch/karte/types.ts`:
```typescript
export type TriageLeadPin = {
  id: string
  vorname: string | null
  nachname: string | null
  firma_name: string | null
  schadentyp: string | null
  plz: string | null
  ort: string | null
  lat: number
  lng: number
  geoSource: 'besichtigungsort' | 'unfallort' | 'plz_centroid'
  created_at: string
}

export type UnlocalizedLead = {
  id: string
  vorname: string | null
  nachname: string | null
  firma_name: string | null
  schadentyp: string | null
  plz: string | null
  created_at: string
}

export type TriageSnapshot = {
  pins: TriageLeadPin[]
  unlocalized: UnlocalizedLead[]
}

export type RawLeadForKarte = {
  id: string
  vorname: string | null
  nachname: string | null
  firma_name: string | null
  schadentyp: string | null
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
  besichtigungsort_plz: string | null
  besichtigungsort_stadt: string | null
  unfallort_lat: number | null
  unfallort_lng: number | null
  unfallort_plz: string | null
  kunde_plz: string | null
  kunde_stadt: string | null
  created_at: string | null
}

export type PlzGeoRow = { plz: string; lat: number; lng: number; ort: string | null }
```

- [ ] **Step 2: Failing test schreiben**

`src/lib/dispatch/karte/triage-leads.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import { resolveLeadGeo } from './triage-leads'
import type { RawLeadForKarte } from './types'

const base: RawLeadForKarte = {
  id: 'lead-1',
  vorname: 'Anna',
  nachname: 'Schmidt',
  firma_name: null,
  schadentyp: 'haftpflicht',
  besichtigungsort_lat: null,
  besichtigungsort_lng: null,
  besichtigungsort_plz: null,
  besichtigungsort_stadt: null,
  unfallort_lat: null,
  unfallort_lng: null,
  unfallort_plz: null,
  kunde_plz: null,
  kunde_stadt: null,
  created_at: '2026-05-14T10:00:00Z',
}

const plzMap = new Map([
  ['10115', { plz: '10115', lat: 52.53, lng: 13.38, ort: 'Berlin' }],
])

describe('resolveLeadGeo', () => {
  it('nutzt besichtigungsort_lat/lng wenn vorhanden', () => {
    const result = resolveLeadGeo(
      { ...base, besichtigungsort_lat: 50.1, besichtigungsort_lng: 8.7, besichtigungsort_plz: '60311', besichtigungsort_stadt: 'Frankfurt' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.lat).toBe(50.1)
    expect(result.pin.lng).toBe(8.7)
    expect(result.pin.geoSource).toBe('besichtigungsort')
    expect(result.pin.plz).toBe('60311')
    expect(result.pin.ort).toBe('Frankfurt')
  })

  it('fällt auf unfallort_lat/lng zurück wenn besichtigungsort fehlt', () => {
    const result = resolveLeadGeo(
      { ...base, unfallort_lat: 48.13, unfallort_lng: 11.57, unfallort_plz: '80331' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.geoSource).toBe('unfallort')
    expect(result.pin.lat).toBe(48.13)
  })

  it('fällt auf PLZ-Centroid zurück wenn keine lat/lng aber besichtigungsort_plz gemapped', () => {
    const result = resolveLeadGeo(
      { ...base, besichtigungsort_plz: '10115' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.geoSource).toBe('plz_centroid')
    expect(result.pin.lat).toBe(52.53)
    expect(result.pin.ort).toBe('Berlin')
  })

  it('nutzt unfallort_plz wenn besichtigungsort_plz fehlt', () => {
    const result = resolveLeadGeo(
      { ...base, unfallort_plz: '10115' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.geoSource).toBe('plz_centroid')
    expect(result.pin.plz).toBe('10115')
  })

  it('nutzt kunde_plz wenn alles andere fehlt', () => {
    const result = resolveLeadGeo(
      { ...base, kunde_plz: '10115' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.geoSource).toBe('plz_centroid')
  })

  it('liefert "unlocalized" wenn keine Geo-Quelle greift', () => {
    const result = resolveLeadGeo(base, plzMap)
    expect(result.kind).toBe('unlocalized')
  })

  it('liefert "unlocalized" wenn PLZ nicht in plzMap', () => {
    const result = resolveLeadGeo(
      { ...base, besichtigungsort_plz: '99999' },
      plzMap,
    )
    expect(result.kind).toBe('unlocalized')
  })
})
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag verifizieren**

Run:
```
npm run test -- triage-leads
```
Expected: FAIL, weil `resolveLeadGeo` noch nicht existiert.

- [ ] **Step 4: `resolveLeadGeo` implementieren**

`src/lib/dispatch/karte/triage-leads.ts`:
```typescript
import type {
  PlzGeoRow,
  RawLeadForKarte,
  TriageLeadPin,
  UnlocalizedLead,
} from './types'

type ResolveResult =
  | { kind: 'pin'; pin: TriageLeadPin }
  | { kind: 'unlocalized'; lead: UnlocalizedLead }

export function resolveLeadGeo(
  lead: RawLeadForKarte,
  plzMap: Map<string, PlzGeoRow>,
): ResolveResult {
  const baseFields = {
    id: lead.id,
    vorname: lead.vorname,
    nachname: lead.nachname,
    firma_name: lead.firma_name,
    schadentyp: lead.schadentyp,
    created_at: lead.created_at ?? new Date(0).toISOString(),
  }

  if (
    typeof lead.besichtigungsort_lat === 'number' &&
    typeof lead.besichtigungsort_lng === 'number'
  ) {
    return {
      kind: 'pin',
      pin: {
        ...baseFields,
        plz: lead.besichtigungsort_plz,
        ort: lead.besichtigungsort_stadt,
        lat: lead.besichtigungsort_lat,
        lng: lead.besichtigungsort_lng,
        geoSource: 'besichtigungsort',
      },
    }
  }

  if (
    typeof lead.unfallort_lat === 'number' &&
    typeof lead.unfallort_lng === 'number'
  ) {
    return {
      kind: 'pin',
      pin: {
        ...baseFields,
        plz: lead.unfallort_plz ?? lead.besichtigungsort_plz,
        ort: lead.besichtigungsort_stadt,
        lat: lead.unfallort_lat,
        lng: lead.unfallort_lng,
        geoSource: 'unfallort',
      },
    }
  }

  const plzCandidate =
    lead.besichtigungsort_plz ?? lead.unfallort_plz ?? lead.kunde_plz
  if (plzCandidate) {
    const hit = plzMap.get(plzCandidate)
    if (hit) {
      return {
        kind: 'pin',
        pin: {
          ...baseFields,
          plz: plzCandidate,
          ort: hit.ort ?? lead.besichtigungsort_stadt ?? lead.kunde_stadt,
          lat: hit.lat,
          lng: hit.lng,
          geoSource: 'plz_centroid',
        },
      }
    }
  }

  return {
    kind: 'unlocalized',
    lead: {
      ...baseFields,
      plz: lead.besichtigungsort_plz ?? lead.unfallort_plz ?? lead.kunde_plz,
    },
  }
}
```

- [ ] **Step 5: Tests grün**

Run:
```
npm run test -- triage-leads
```
Expected: PASS (7 Tests grün).

- [ ] **Step 6: Commit**

```
git add src/lib/dispatch/karte/
git commit -m "feat(AAR-894): TriageLeadPin Types + resolveLeadGeo (Hybrid-Geo, getestet)"
```

---

## Task 4: Server-Loader `getTriageLeads`

**Files:**
- Modify: `src/lib/dispatch/karte/triage-leads.ts` (Loader anhängen)

- [ ] **Step 1: Supabase-Client-Type recherchieren**

Identifiziere den Server-Client-Helper. Suche:
```
grep -rn "createClient" src/lib/supabase/server.ts
```
Erwartet: Helper `createClient()` aus `@/lib/supabase/server`. Falls anders benannt, nutze den tatsächlichen Pfad in Step 2.

- [ ] **Step 2: Loader implementieren**

Anhängen an `src/lib/dispatch/karte/triage-leads.ts`:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { TriageSnapshot } from './types'

/**
 * Lädt alle Leads im Triage-Backlog (kein aktiver auftrag) für die
 * Dispatcher-Karte. Resolved Geo via Hybrid-Strategie (siehe resolveLeadGeo).
 */
export async function getTriageLeads(
  supabase: SupabaseClient<Database>,
): Promise<TriageSnapshot> {
  // 1) Lead-IDs mit AKTIVEM Auftrag (= NOT in Triage-Backlog).
  const ACTIVE_AUFTRAG_STATES_TO_EXCLUDE = [
    'storniert',
    'abgelehnt',
    'abgesagt',
    'no_show',
  ] as const

  const { data: activeAuftraege, error: aErr } = await supabase
    .from('auftraege')
    .select('lead_id, status')
    .not('lead_id', 'is', null)
    .not('status', 'in', `(${ACTIVE_AUFTRAG_STATES_TO_EXCLUDE.map((s) => `"${s}"`).join(',')})`)

  if (aErr) {
    console.error('[karte] auftraege query failed', aErr)
    return { pins: [], unlocalized: [] }
  }
  const blockedLeadIds = new Set(
    (activeAuftraege ?? []).map((row) => row.lead_id).filter((id): id is string => !!id),
  )

  // 2) Leads (offen, nicht disqualifiziert, nicht konvertiert).
  const { data: leads, error: lErr } = await supabase
    .from('leads')
    .select(
      `id, vorname, nachname, firma_name, schadentyp,
       besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_plz, besichtigungsort_stadt,
       unfallort_lat, unfallort_lng, unfallort_plz,
       kunde_plz, kunde_stadt, created_at,
       disqualifiziert, konvertiert_zu_fall_id`,
    )
    .or('disqualifiziert.is.null,disqualifiziert.eq.false')
    .is('konvertiert_zu_fall_id', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (lErr) {
    console.error('[karte] leads query failed', lErr)
    return { pins: [], unlocalized: [] }
  }

  const triageLeads = (leads ?? []).filter((l) => !blockedLeadIds.has(l.id))

  // 3) PLZ-Map einmal laden (~8k Einträge, ~250kB).
  const { data: plzRows, error: pErr } = await supabase
    .from('plz_geo')
    .select('plz, lat, lng, ort')

  if (pErr) {
    console.error('[karte] plz_geo query failed', pErr)
    // weiter ohne PLZ-Fallback — Leads ohne lat/lng landen in unlocalized
  }
  const plzMap = new Map((plzRows ?? []).map((r) => [r.plz, r]))

  // 4) Resolve jedes Leads.
  const pins: TriageSnapshot['pins'] = []
  const unlocalized: TriageSnapshot['unlocalized'] = []
  for (const lead of triageLeads) {
    const result = resolveLeadGeo(lead, plzMap)
    if (result.kind === 'pin') pins.push(result.pin)
    else unlocalized.push(result.lead)
  }

  return { pins, unlocalized }
}
```

- [ ] **Step 3: Typecheck**

Run:
```
npm run typecheck
```
Expected: kein Fehler in `src/lib/dispatch/karte/triage-leads.ts`.

Falls es Fehler bei `auftraege.lead_id`-Cardinality gibt: verifiziere mit
```
grep -n "lead_id" src/lib/supabase/database.types.ts | head -5
```
und passe den Filter-String an die tatsächliche Spalte an.

- [ ] **Step 4: Tests grün halten**

Run:
```
npm run test -- triage-leads
```
Expected: PASS, keine Regression (Loader benutzt selbe `resolveLeadGeo`).

- [ ] **Step 5: Commit**

```
git add src/lib/dispatch/karte/triage-leads.ts
git commit -m "feat(AAR-894): getTriageLeads — Backlog-Filter über auftraege + plz_geo Join"
```

---

## Task 5: Route + Server-Page

**Files:**
- Create: `src/app/dispatch/karte/page.tsx`
- Create: `src/app/dispatch/karte/actions.ts`

- [ ] **Step 1: Page schreiben**

`src/app/dispatch/karte/page.tsx`:
```tsx
// AAR-894: Dispatcher-Karte v1 — Server-Component lädt Triage-Snapshot
// und übergibt ihn an den Mapbox-Client. RBAC kommt vom dispatch-Layout.

import { createClient } from '@/lib/supabase/server'
import { getTriageLeads } from '@/lib/dispatch/karte/triage-leads'
import DispatchKarteClient from './DispatchKarteClient'

export const dynamic = 'force-dynamic'

export default async function DispatchKartePage() {
  const supabase = await createClient()
  const snapshot = await getTriageLeads(supabase)

  return (
    <div className="h-full w-full">
      <DispatchKarteClient initialSnapshot={snapshot} />
    </div>
  )
}
```

- [ ] **Step 2: Server-Action für Refetch**

`src/app/dispatch/karte/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getTriageLeads } from '@/lib/dispatch/karte/triage-leads'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import type { TriageSnapshot } from '@/lib/dispatch/karte/types'

export async function refetchTriageSnapshot(): Promise<
  { ok: true; data: TriageSnapshot } | { ok: false; error: string }
> {
  try {
    await requirePortalAccess(['dispatch', 'admin'])
  } catch {
    return { ok: false, error: 'unauthorized' }
  }
  const supabase = await createClient()
  const data = await getTriageLeads(supabase)
  return { ok: true, data }
}
```

- [ ] **Step 3: Stub-Client damit der Import nicht ins Leere zeigt**

`src/app/dispatch/karte/DispatchKarteClient.tsx` (temporärer Stub — wird in Task 6 ersetzt):
```tsx
'use client'

import type { TriageSnapshot } from '@/lib/dispatch/karte/types'

export default function DispatchKarteClient({
  initialSnapshot,
}: {
  initialSnapshot: TriageSnapshot
}) {
  return (
    <pre className="p-4 text-xs">
      {JSON.stringify(initialSnapshot, null, 2)}
    </pre>
  )
}
```

- [ ] **Step 4: Build & Smoke**

Run:
```
npm run build
```
Expected: `/dispatch/karte` taucht in den Static/Dynamic-Pages-Liste auf, kein TS-Fehler.

Dann manuell:
```
npm run dev
```
Browser → `http://localhost:3000/dispatch/karte` (eingeloggt als dispatch oder admin). Expected: JSON-Dump mit `pins` und `unlocalized`. Bei nicht-eingeloggtem User: Redirect zum Login.

- [ ] **Step 5: Commit**

```
git add src/app/dispatch/karte/
git commit -m "feat(AAR-894): /dispatch/karte Route + Server-Action (Stub-Client mit JSON-Dump)"
```

---

## Task 6: Mapbox-Client mit Pins + Popup

**Files:**
- Modify: `src/app/dispatch/karte/DispatchKarteClient.tsx`
- Create: `src/app/dispatch/karte/LeadPopup.tsx`

- [ ] **Step 1: LeadPopup-Komponente schreiben**

`src/app/dispatch/karte/LeadPopup.tsx`:
```tsx
'use client'

import Link from 'next/link'
import type { TriageLeadPin } from '@/lib/dispatch/karte/types'

function alterInTagen(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function alterLabel(createdAt: string): string {
  const tage = alterInTagen(createdAt)
  if (tage === 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 7) return `${tage} Tage alt`
  if (tage < 30) return `${Math.floor(tage / 7)} Wochen alt`
  return `${Math.floor(tage / 30)} Monate alt`
}

function leadName(pin: TriageLeadPin): string {
  if (pin.firma_name) return pin.firma_name
  const parts = [pin.vorname, pin.nachname].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Unbekannt'
}

export default function LeadPopup({ pin }: { pin: TriageLeadPin }) {
  return (
    <div className="min-w-[220px] text-claimondo-navy">
      <div className="text-sm font-semibold">{leadName(pin)}</div>
      <div className="mt-1 text-xs text-claimondo-navy/70">
        {pin.schadentyp ?? 'Schadenstyp unbekannt'}
        {' · '}
        {pin.plz ?? '?'} {pin.ort ?? ''}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-claimondo-shield">
        {alterLabel(pin.created_at)}
      </div>
      <Link
        href={`/dispatch/leads/${pin.id}`}
        className="mt-3 inline-block rounded-ios-sm bg-claimondo-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-claimondo-navy/90"
      >
        Details öffnen
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: DispatchKarteClient mit Mapbox aufbauen**

`src/app/dispatch/karte/DispatchKarteClient.tsx`:
```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type { Map as MapboxMap, Marker, Popup } from 'mapbox-gl'
import type { TriageLeadPin, TriageSnapshot } from '@/lib/dispatch/karte/types'
import LeadPopup from './LeadPopup'

const DEFAULT_CENTER: [number, number] = [10.45, 51.16] // Mittelpunkt DE
const DEFAULT_ZOOM = 5.4

function pinColor(pin: TriageLeadPin): string {
  // Brand-Token: claimondo-shield (helles Navy) für PLZ-Centroid,
  // claimondo-navy für exakte Geo
  return pin.geoSource === 'plz_centroid' ? '#7BA3CC' : '#0D1B3E'
}

export default function DispatchKarteClient({
  initialSnapshot,
}: {
  initialSnapshot: TriageSnapshot
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<Map<string, Marker>>(new Map())
  const popupRootsRef = useRef<Map<string, Root>>(new Map())
  const [snapshot, setSnapshot] = useState<TriageSnapshot>(initialSnapshot)
  const [tokenOk, setTokenOk] = useState<boolean>(false)

  // Mount Map
  useEffect(() => {
    if (!containerRef.current) return
    const ok = ensureMapboxInitialized()
    setTokenOk(ok)
    if (!ok) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')
    mapRef.current = map

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      popupRootsRef.current.forEach((r) => r.unmount())
      popupRootsRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Sync Markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const nextIds = new Set(snapshot.pins.map((p) => p.id))

    // Remove gone
    markersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
        const root = popupRootsRef.current.get(id)
        if (root) {
          root.unmount()
          popupRootsRef.current.delete(id)
        }
      }
    })

    // Add/update
    for (const pin of snapshot.pins) {
      const existing = markersRef.current.get(pin.id)
      if (existing) {
        existing.setLngLat([pin.lng, pin.lat])
        continue
      }

      const el = document.createElement('div')
      el.style.width = '14px'
      el.style.height = '14px'
      el.style.borderRadius = '50%'
      el.style.background = pinColor(pin)
      el.style.border = '2px solid #ffffff'
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.25)'
      el.style.cursor = 'pointer'

      const popupContainer = document.createElement('div')
      const root = createRoot(popupContainer)
      root.render(<LeadPopup pin={pin} />)
      popupRootsRef.current.set(pin.id, root)

      const popup = new mapboxgl.Popup({
        offset: 16,
        closeButton: true,
        closeOnClick: true,
      }).setDOMContent(popupContainer)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([pin.lng, pin.lat])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.set(pin.id, marker)
    }

    // Auto-fit if any
    if (snapshot.pins.length >= 1) {
      const bounds = new mapboxgl.LngLatBounds()
      snapshot.pins.forEach((p) => bounds.extend([p.lng, p.lat]))
      // Nur fit beim ersten Render — bei Snapshot-Updates wäre Auto-Zoom störend
      if (markersRef.current.size === snapshot.pins.length) {
        // First time: pins added = total pins
      }
      // Bewusst kein fitBounds bei jeder Aktualisierung; nur initial.
    }
  }, [snapshot])

  // Initial fitBounds (separat damit es nur einmal feuert)
  useEffect(() => {
    const map = mapRef.current
    if (!map || initialSnapshot.pins.length === 0) return
    const bounds = new mapboxgl.LngLatBounds()
    initialSnapshot.pins.forEach((p) => bounds.extend([p.lng, p.lat]))
    map.once('load', () => {
      map.fitBounds(bounds, { padding: 64, maxZoom: 11, duration: 0 })
    })
    // initial run only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!tokenOk) {
    return (
      <div className="flex h-full items-center justify-center text-claimondo-navy">
        Mapbox-Token fehlt — Karte kann nicht initialisiert werden.
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run:
```
npm run build
```
Expected: grün, kein TS-Fehler. `react-dom/client` muss available sein (ist es in Next 15).

- [ ] **Step 4: Manueller Browser-Smoke**

Run:
```
npm run dev
```
Browser → `http://localhost:3000/dispatch/karte` (als dispatch eingeloggt). 

Erwartet:
- Karte rendert (Mapbox light-v11)
- Pins erscheinen an erwarteten Orten
- Klick auf Pin → Popup öffnet sich mit Name + Schadenstyp + Alter + "Details öffnen"-Link
- Klick auf "Details öffnen" → Navigation nach `/dispatch/leads/<id>` funktioniert

Wenn keine Pins erscheinen aber `snapshot.pins.length > 0`: Console-Errors prüfen (Token, Style-URL).

- [ ] **Step 5: Commit**

```
git add src/app/dispatch/karte/
git commit -m "feat(AAR-894): Mapbox-Container + Marker + LeadPopup für Triage-Leads"
```

---

## Task 7: "Nicht lokalisierbar"-Sidebar

**Files:**
- Create: `src/app/dispatch/karte/UnlocalizedSidebar.tsx`
- Modify: `src/app/dispatch/karte/DispatchKarteClient.tsx`

- [ ] **Step 1: Sidebar-Komponente**

`src/app/dispatch/karte/UnlocalizedSidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import type { UnlocalizedLead } from '@/lib/dispatch/karte/types'

function leadName(lead: UnlocalizedLead): string {
  if (lead.firma_name) return lead.firma_name
  const parts = [lead.vorname, lead.nachname].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Unbekannt'
}

export default function UnlocalizedSidebar({ leads }: { leads: UnlocalizedLead[] }) {
  if (leads.length === 0) return null
  return (
    <div className="absolute right-3 top-3 z-10 max-h-[60vh] w-72 overflow-y-auto rounded-ios-md bg-white/95 p-3 shadow-ios-md backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-claimondo-shield">
        Nicht lokalisierbar ({leads.length})
      </div>
      <ul className="space-y-1.5">
        {leads.map((lead) => (
          <li key={lead.id}>
            <Link
              href={`/dispatch/leads/${lead.id}`}
              className="block rounded-ios-sm px-2 py-1.5 text-sm text-claimondo-navy hover:bg-claimondo-bg"
            >
              <div className="font-medium">{leadName(lead)}</div>
              <div className="text-xs text-claimondo-navy/60">
                {lead.schadentyp ?? '—'} · PLZ {lead.plz ?? '?'}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: In DispatchKarteClient einbinden**

Im `DispatchKarteClient.tsx` den Return-Block ersetzen:
```tsx
  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <UnlocalizedSidebar leads={snapshot.unlocalized} />
    </div>
  )
```

Import oben ergänzen:
```tsx
import UnlocalizedSidebar from './UnlocalizedSidebar'
```

- [ ] **Step 3: Browser-Smoke**

Reload `/dispatch/karte`. Wenn es Leads ohne `besichtigungsort_lat` und ohne PLZ-Match gibt, erscheint die Sidebar oben rechts mit Liste. Klick → öffnet Detail-Seite.

- [ ] **Step 4: Commit**

```
git add src/app/dispatch/karte/UnlocalizedSidebar.tsx src/app/dispatch/karte/DispatchKarteClient.tsx
git commit -m "feat(AAR-894): UnlocalizedSidebar — Leads ohne Geo als Liste am Karten-Rand"
```

---

## Task 8: Realtime-Hook für Auto-Pop neuer Pins

**Files:**
- Create: `src/app/dispatch/karte/useTriageRealtime.ts`
- Modify: `src/app/dispatch/karte/DispatchKarteClient.tsx`

- [ ] **Step 1: Hook schreiben**

`src/app/dispatch/karte/useTriageRealtime.ts`:
```typescript
'use client'

import { useEffect, useId } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Abonniert leads + auftraege INSERT/UPDATE für die Dispatcher-Karte.
 * Bei jeder Änderung wird `onChange()` gerufen — Caller refetched den Snapshot.
 *
 * Channel-Name wird über useId() eindeutig gemacht (siehe Memory:
 * feedback_realtime_channel_ids), damit gleichzeitig mountete Karten-Instanzen
 * nicht kollidieren.
 */
export function useTriageRealtime(onChange: () => void): void {
  const instanceId = useId()
  useEffect(() => {
    const supabase = createClient()
    const channelName = `dispatch-karte-${instanceId}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auftraege' },
        () => onChange(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [instanceId, onChange])
}
```

- [ ] **Step 2: In DispatchKarteClient verdrahten**

In `DispatchKarteClient.tsx` ergänzen:
```tsx
import { useTriageRealtime } from './useTriageRealtime'
import { refetchTriageSnapshot } from './actions'
import { useCallback } from 'react'
```

Innerhalb der Komponente, vor dem Return:
```tsx
const refetch = useCallback(async () => {
  const result = await refetchTriageSnapshot()
  if (result.ok) setSnapshot(result.data)
}, [])

useTriageRealtime(refetch)
```

- [ ] **Step 3: Build**

Run:
```
npm run build
```
Expected: grün.

- [ ] **Step 4: Realtime-Smoke (manuell)**

Browser-Tab A: `/dispatch/karte` offen.
Browser-Tab B (oder Supabase-Studio): `INSERT INTO leads (...)` mit Test-Lead.

Erwartet: Tab-A-Karte zeigt neuen Pin **ohne** Reload innerhalb ~1-2s.

Test 2: `UPDATE auftraege SET status='angenommen' WHERE lead_id=<test-lead>;` → Pin verschwindet (Lead nicht mehr im Triage-Backlog).

Falls keine Updates kommen: prüfe Supabase-Realtime-Publication:
```
npx supabase db query --linked --command "SELECT pubname, tablename FROM pg_publication_tables WHERE tablename IN ('leads','auftraege');"
```
Falls Tabellen fehlen, in einer separaten Migration zur Publication hinzufügen:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads, public.auftraege;
```
(Migration in Plan-Nachtrag, nur falls nötig.)

- [ ] **Step 5: Commit**

```
git add src/app/dispatch/karte/useTriageRealtime.ts src/app/dispatch/karte/DispatchKarteClient.tsx
git commit -m "feat(AAR-894): Realtime-Hook — neue Leads + Auftrags-Statuswechsel ploppen auto auf"
```

---

## Task 9: DispatchNav-Eintrag „Karte"

**Files:**
- Modify: `src/app/dispatch/_components/DispatchNav.tsx`

- [ ] **Step 1: Nav-Struktur lesen**

Run:
```
grep -n "href=" src/app/dispatch/_components/DispatchNav.tsx
```
Identifiziere wo die anderen Nav-Items (Dashboard, Leads, Kalender, etc.) gerendert werden. Folge dem exakten Muster — falls die Komponente eine Items-Array nutzt, einfach einen Eintrag hinzufügen.

- [ ] **Step 2: Eintrag hinzufügen**

Beispielhaft (Pfad/Icon an Datei anpassen, da Schema von Aaron's existierendem DispatchNav abhängt):
```tsx
{
  href: '/dispatch/karte',
  label: 'Karte',
  icon: MapIcon, // aus lucide-react importieren falls noch nicht da
}
```

Falls die existierende Nav handgeschriebene `<Link>`-Elemente statt eines Arrays nutzt: dort dazwischen einen weiteren `<Link href="/dispatch/karte">` mit gleichem Styling-Muster einfügen.

- [ ] **Step 3: Lint + Typecheck**

Run:
```
npm run typecheck
```
Expected: grün.

- [ ] **Step 4: Browser-Smoke**

`/dispatch/dashboard` öffnen, Nav-Eintrag „Karte" sichtbar, Klick navigiert zu `/dispatch/karte`.

- [ ] **Step 5: Commit**

```
git add src/app/dispatch/_components/DispatchNav.tsx
git commit -m "feat(AAR-894): DispatchNav — Karten-Eintrag hinzugefügt"
```

---

## Task 10: Build-Audit + 7-Punkte-Selbstcheck + Push

**Files:** (kein neuer Code)

- [ ] **Step 1: Voller Build**

Run:
```
npm run build
```
Expected: grün, alle Routen statisch/dynamic erzeugt, keine TS-Errors, kein Bundle-Spike >100kB nur durch die Karte (Mapbox ist bereits Bundle-Mitglied).

- [ ] **Step 2: Lint**

Run:
```
npm run lint
```
Expected: grün (oder nur Warnings die bereits in main existieren).

- [ ] **Step 3: Tests**

Run:
```
npm run test
```
Expected: grün, inkl. `triage-leads.test.ts`.

- [ ] **Step 4: Token-Audit**

Run:
```
npm run check:token-audit
```
Expected: grün. Falls Verstoß: hardcoded Hex durch `claimondo-*`-Tailwind-Tokens ersetzen.

- [ ] **Step 5: 7-Punkte-Audit dokumentieren**

Erstelle im finalen Commit-Body (Step 7) die Audit-Sektion mit:
- Build: grün (npm run build)
- UI: neuer DispatchNav-Eintrag „Karte" → `/dispatch/karte`
- Redundanz: Mapbox via `@/lib/mapbox/client` (Singleton-Pattern, kein Duplikat); keine eigene PLZ-Tabelle in einem Lib-Modul
- Dead-Code: kein Refactor-Rest, alte Stubs entfernt
- Spec: alle 9 Akzeptanzkriterien aus AAR-894 abgehakt
- Inkonsistenz: Token-Audit grün, Umlaute geprüft, `resolveLeadGeo` getestet
- Regression: `dispatch/layout.tsx` unverändert (RBAC intakt), keine Änderungen an `leads`/`auftraege`-Schemas

- [ ] **Step 6: Working Tree und Stash-Check**

Run:
```
git status
git stash list
git log --branches --not --remotes
```
Working tree clean, kein offener Stash, alle Commits pushable.

- [ ] **Step 7: Push + PR**

```
git push -u origin kitta/aar-894-dispatcher-karte-v1
gh pr create --base staging --title "feat(AAR-894): Dispatcher-Karte v1 — Leads-Triage-Layer" --body "$(cat <<'EOF'
## Summary
- Echte Mapbox-Karte unter `/dispatch/karte` mit Triage-Backlog-Leads als Pins
- Hybrid-Geo: `besichtigungsort_lat/lng` → `unfallort_lat/lng` → PLZ-Centroid (neue `plz_geo`-Tabelle)
- Pin-Klick → Popup mit Kunde + Schadenstyp + Alter + Detail-Link
- Realtime: neue Leads + Auftrags-Status-Wechsel ploppen ohne Reload auf
- „Nicht lokalisierbar"-Sidebar listet Leads ohne Geo-Match

## Test plan
- [ ] `/dispatch/karte` rendert als dispatch eingeloggt
- [ ] Pins an erwarteten Orten (Stichprobe Berlin/München/Hamburg)
- [ ] Pin-Klick → Popup + Detail-Link funktioniert
- [ ] Neuer Lead in DB → Pin erscheint ohne Reload
- [ ] Auftrag auf angenommen → Pin verschwindet
- [ ] Sidebar zeigt Leads ohne Geo
- [ ] Build + Lint + Tests grün

Linear: AAR-894

🤖 Generated with Claude Code
EOF
)"
```

- [ ] **Step 8: Linear updaten**

Linear AAR-894 → Status „In Review" + PR-Link.

---

## Out of Scope (v2/v3 — separate Tickets)

- SVs-Layer (aktive SVs mit Standort-Updates)
- Termine-Layer (heutige Termine als Pins)
- Self-Dispatch-Anfragen-Layer
- Layer-Toggle-Chips + Awareness/Triage-Modi
- Drag-to-assign-SV aus Karte
- Cluster-Rendering bei >200 Pins
- Geo-Backfill-Job für Bestands-Leads ohne lat/lng
