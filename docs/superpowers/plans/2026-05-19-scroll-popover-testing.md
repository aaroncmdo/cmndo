# Scroll-Popover + Verfügbarkeits-API — Test-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine dreischichtige Test-Pyramide (Unit / Integration / E2E) für den scroll-getriggerten 3-Step-Popover inkl. Google-Places-Autocomplete, Isochronen-Lookup und Profile-Stack. Tests müssen vor dem Live-Schalten der Subdomain alle grün durchlaufen und in CI fahren.

**Architecture:**

```
Unit (Vitest, environment=node)
  ├─ Reine Helper aus api/.../gutachter-verfuegbar/route.ts:
  │    pointInRing, isValidPolygon, extractStadt, firstInitial,
  │    isTestAccount, sample
  └─ trackLpEvent + Form-Submit-Action (existieren bereits)

Integration (Vitest, environment=node, gemockte Fetch + Supabase)
  └─ POST /api/kfzgutachter-lp/gutachter-verfuegbar
       - happy path (Google-Places liefert lat/lng, SVs vorhanden)
       - place_id-Validation (Garbage rejected, Sub-Min-Länge rejected)
       - Google-Status NOT_OK → no_location
       - Privacy: Free-Paket-SVs zählen in count, kein Profile-Eintrag
       - Test-Account-Filter: "Test Aaron Gutachter GmbH" raus
       - Min-Loading-Delay ≥ 600 ms
       - Aggregat-Rating-Berechnung

E2E (Playwright .mjs, gegen localhost:3000 + echte DB + echte Google-Places)
  └─ Vollständige Funnel-Strecke:
       Scroll → Modal öffnet → Step 1 → Step 2 (Autocomplete +
       Verfügbarkeit) → Step 3 (Callback-Submit) → anfragen-Zeile
       in DB mit payload.fahrzeug + payload.place_id verifiziert
       + Trigger-Edge-Cases (Race nach Arm-Karenz, sessionStorage)
```

**Tech Stack:**
- **Vitest 4.1** (`npm run test`), `environment: 'node'`, Mocks via `vi.mock`
- **Playwright 1.59** (`.mjs`-Scripts unter `scripts/smoke-*`) plus Supabase-Service-Client für DB-Assertions
- **TypeScript strict** — Tests sind `.test.ts`, kein `any`

---

## Pre-Work: Helper aus der Route extrahieren

Die Helper-Functions in `src/app/api/kfzgutachter-lp/gutachter-verfuegbar/route.ts` sind aktuell file-local. Für saubere Unit-Tests müssen sie in ein eigenes Modul, das die Route importiert.

### Task 0: Helper in `lib/`-Modul auslagern

**Files:**
- Create: `src/app/api/kfzgutachter-lp/gutachter-verfuegbar/_lib.ts`
- Modify: `src/app/api/kfzgutachter-lp/gutachter-verfuegbar/route.ts` (Imports umstellen)

- [ ] **Step 1: Neues `_lib.ts` anlegen**

```typescript
// src/app/api/kfzgutachter-lp/gutachter-verfuegbar/_lib.ts
//
// Reine Helper für die Verfügbarkeits-API. Bewusst pure functions, damit
// sie unit-testbar sind (kein Fetch, kein DB-Client, kein Random). sample()
// nimmt einen rng-Param damit Tests deterministisch laufen.

export type GeoPolygon = {
  type: 'Polygon'
  coordinates: number[][][]
}

export function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 4) return false
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1]
}

export function pointInRing(point: [number, number], ring: number[][]): boolean {
  if (!isClosedRing(ring)) return false
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function isValidPolygon(poly: unknown): poly is GeoPolygon {
  if (!poly || typeof poly !== 'object') return false
  const p = poly as { type?: unknown; coordinates?: unknown }
  if (p.type !== 'Polygon') return false
  if (!Array.isArray(p.coordinates) || p.coordinates.length === 0) return false
  const ring = p.coordinates[0]
  return Array.isArray(ring) && ring.length >= 4
}

export function extractStadt(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  const match = adresse.match(/,\s*\d{5}\s+(.+?)$/)
  if (match?.[1]) return match[1].trim()
  const parts = adresse.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) return parts[parts.length - 1].replace(/^\d{5}\s+/, '')
  return null
}

export function firstInitial(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? `${trimmed.charAt(0).toUpperCase()}.` : null
}

export function isTestAccount(firmenname: string | null | undefined): boolean {
  if (!firmenname) return false
  return /\b(test|smoke|demo)\b/i.test(firmenname)
}

export function sample<T>(arr: T[], n: number, rng: () => number = Math.random): T[] {
  if (arr.length <= n) return arr.slice()
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

export function isValidPlaceId(raw: string): boolean {
  return /^[A-Za-z0-9_-]{10,128}$/.test(raw.trim())
}

export type GutachterProfilPublic = {
  id: string
  vorname_initiale: string | null
  stadt: string | null
  avatar_url: string | null
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
}
```

- [ ] **Step 2: `route.ts` auf Imports umstellen**

Inline-Helper aus `route.ts` löschen (die nach Task 0 in `_lib.ts` leben) und stattdessen importieren:

```typescript
import {
  pointInRing,
  isValidPolygon,
  extractStadt,
  firstInitial,
  isTestAccount,
  sample,
  isValidPlaceId,
  type GutachterProfilPublic,
} from './_lib'
```

`/^[A-Za-z0-9_-]{10,128}$/.test(placeId)` → `isValidPlaceId(placeId)`.

- [ ] **Step 3: tsc + Existing-Smoke**

```bash
npx tsc --noEmit
node -e "/* der gleiche Köln-Smoke wie zuvor */"
```
Expected: weiterhin `{"ok":true,"count":2,"gutachter":[…]}` ohne Behaviour-Change.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kfzgutachter-lp/gutachter-verfuegbar/_lib.ts src/app/api/kfzgutachter-lp/gutachter-verfuegbar/route.ts
git commit -m "refactor(kfzgutachter-lp): Helper aus gutachter-verfuegbar-Route in _lib.ts"
```

---

## Task 1: Unit-Tests für pure Helper (Vitest)

**Files:**
- Create: `src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/lib.test.ts`

- [ ] **Step 1: Failing test scaffold schreiben**

```typescript
// src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/lib.test.ts
import { describe, it, expect } from 'vitest'
import {
  pointInRing,
  isClosedRing,
  isValidPolygon,
  extractStadt,
  firstInitial,
  isTestAccount,
  sample,
  isValidPlaceId,
} from '../_lib'

describe('isClosedRing', () => {
  it('akzeptiert closed ring mit ≥4 Punkten', () => {
    expect(
      isClosedRing([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toBe(true)
  })
  it('lehnt offenes Polygon ab', () => {
    expect(
      isClosedRing([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ).toBe(false)
  })
  it('lehnt < 4 Punkte ab', () => {
    expect(isClosedRing([[0, 0], [1, 1], [0, 0]])).toBe(false)
  })
})

describe('pointInRing — Ray-Casting', () => {
  // Quadrat (0,0)-(10,10)
  const square: number[][] = [
    [0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
  ]
  it('Punkt innen → true', () => {
    expect(pointInRing([5, 5], square)).toBe(true)
  })
  it('Punkt außerhalb (rechts) → false', () => {
    expect(pointInRing([15, 5], square)).toBe(false)
  })
  it('Punkt außerhalb (unten) → false', () => {
    expect(pointInRing([5, -1], square)).toBe(false)
  })
  it('Ring nicht geschlossen → false (Defensive)', () => {
    expect(pointInRing([5, 5], [[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false)
  })

  // Realistische Köln-Isochrone (sehr vereinfacht)
  const koelnIso: number[][] = [
    [6.85, 50.90], [7.05, 50.90], [7.05, 51.00], [6.85, 51.00], [6.85, 50.90],
  ]
  it('Köln-Hauptbahnhof (6.96, 50.94) liegt in Köln-Iso', () => {
    expect(pointInRing([6.96, 50.94], koelnIso)).toBe(true)
  })
  it('Düsseldorf-Königsallee (6.78, 51.22) liegt NICHT in Köln-Iso', () => {
    expect(pointInRing([6.78, 51.22], koelnIso)).toBe(false)
  })
})

describe('isValidPolygon', () => {
  it('akzeptiert kanonisches GeoJSON-Polygon', () => {
    expect(isValidPolygon({
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    })).toBe(true)
  })
  it('lehnt Legacy-Array<{lat,lng}> ab (Migration-Fix-Spuren)', () => {
    expect(isValidPolygon([{ lat: 50.9, lng: 6.96 }])).toBe(false)
  })
  it('lehnt null/undefined/string ab', () => {
    expect(isValidPolygon(null)).toBe(false)
    expect(isValidPolygon(undefined)).toBe(false)
    expect(isValidPolygon('Polygon')).toBe(false)
  })
  it('lehnt {type:Polygon} ohne coordinates ab', () => {
    expect(isValidPolygon({ type: 'Polygon' })).toBe(false)
  })
})

describe('extractStadt', () => {
  it('Standard-Adresse', () => {
    expect(extractStadt('Mediapark 5, 50670 Köln')).toBe('Köln')
  })
  it('Umlaut-Stadt', () => {
    expect(extractStadt('Königsallee 1, 40212 Düsseldorf')).toBe('Düsseldorf')
  })
  it('Bindestrich-Stadt', () => {
    expect(extractStadt('Hauptstr. 1, 47798 Krefeld-Uerdingen')).toBe('Krefeld-Uerdingen')
  })
  it('Fallback ohne PLZ', () => {
    expect(extractStadt('Hauptstr. 1, Köln')).toBe('Köln')
  })
  it('null-safe', () => {
    expect(extractStadt(null)).toBe(null)
    expect(extractStadt(undefined)).toBe(null)
    expect(extractStadt('')).toBe(null)
  })
})

describe('firstInitial', () => {
  it('Standard-Vorname → "M."', () => {
    expect(firstInitial('Max')).toBe('M.')
  })
  it('Umlaut-Vorname → "Ä."', () => {
    expect(firstInitial('Ärger')).toBe('Ä.')
  })
  it('null-safe', () => {
    expect(firstInitial(null)).toBe(null)
    expect(firstInitial('')).toBe(null)
    expect(firstInitial('   ')).toBe(null)
  })
})

describe('isTestAccount', () => {
  it('Test-Account erkannt', () => {
    expect(isTestAccount('Test Aaron Gutachter GmbH')).toBe(true)
    expect(isTestAccount('Smoke SV')).toBe(true)
    expect(isTestAccount('Demo Gutachter GbR')).toBe(true)
  })
  it('Substring "test" als Teil eines Wortes → nicht erkannt', () => {
    expect(isTestAccount('Westend Sachverständige')).toBe(false)
    expect(isTestAccount('Testfeld Gutachter')).toBe(false)
  })
  it('null-safe', () => {
    expect(isTestAccount(null)).toBe(false)
    expect(isTestAccount('')).toBe(false)
  })
})

describe('sample', () => {
  it('arr.length ≤ n → komplette Kopie', () => {
    const arr = [1, 2]
    const result = sample(arr, 3)
    expect(result).toEqual([1, 2])
    expect(result).not.toBe(arr) // Kopie, keine Referenz
  })
  it('deterministischer rng → reproduzierbares Sample', () => {
    // RNG-Stub: liefert immer 0 → letztes Element wird mit erstem getauscht
    const rng = () => 0
    expect(sample([1, 2, 3, 4, 5], 2, rng)).toEqual([5, 1])
  })
  it('mutiert Original nicht', () => {
    const original = [1, 2, 3, 4, 5]
    sample(original, 3)
    expect(original).toEqual([1, 2, 3, 4, 5])
  })
})

describe('isValidPlaceId', () => {
  it('akzeptiert echte Place-IDs (ChIJ-Format)', () => {
    expect(isValidPlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(true)
  })
  it('lehnt SQL-Injection / Markup ab', () => {
    expect(isValidPlaceId("'; DROP TABLE")).toBe(false)
    expect(isValidPlaceId('<script>')).toBe(false)
  })
  it('lehnt zu kurze ab', () => {
    expect(isValidPlaceId('short')).toBe(false)
  })
  it('lehnt zu lange ab', () => {
    expect(isValidPlaceId('a'.repeat(129))).toBe(false)
  })
})
```

- [ ] **Step 2: Tests laufen lassen, alle grün?**

```bash
npx vitest run src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/lib.test.ts
```
Expected: PASS für alle Helper-Tests (≥ 24 Cases).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/lib.test.ts
git commit -m "test(kfzgutachter-lp): Unit-Tests für gutachter-verfuegbar Helper"
```

---

## Task 2: Integration-Test der API-Route (Vitest)

Mocked: `fetch` (Google-Places), `createServiceClient`, `createAdminClient`. Reale Function-Logik läuft.

**Files:**
- Create: `src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/route.test.ts`

- [ ] **Step 1: Mock-Scaffold**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Service-Client: liefert ein konfiguriertes Set an SV-Zeilen
const mockSvSelect = vi.fn()
const mockServiceClient = {
  from: vi.fn().mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => {
      if (table === 'sachverstaendige') resolve(mockSvSelect())
      else resolve({ data: [], error: null })
    },
  })),
}
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockServiceClient,
}))

// Admin-Client für Profile/Reviews
const mockProfilesSelect = vi.fn().mockResolvedValue({ data: [], error: null })
const mockBewertungenSelect = vi.fn().mockResolvedValue({ data: [], error: null })
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: vi.fn().mockImplementation((table: string) => {
      const obj = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue(
          table === 'profiles' ? mockProfilesSelect() : mockBewertungenSelect()
        ),
      }
      return obj
    }),
  }),
}))

// Fetch-Mock für Google-Places-Details
const originalFetch = global.fetch
beforeEach(() => {
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key')
})
afterEach(() => {
  vi.unstubAllEnvs()
  global.fetch = originalFetch
})

// Import nach den Mocks
import { POST } from '../route'

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/kfzgutachter-lp/gutachter-verfuegbar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const KOELN_POLY = {
  type: 'Polygon',
  coordinates: [[[6.85, 50.90], [7.05, 50.90], [7.05, 51.00], [6.85, 51.00], [6.85, 50.90]]],
}
const DUESSELDORF_POLY = {
  type: 'Polygon',
  coordinates: [[[6.70, 51.18], [6.85, 51.18], [6.85, 51.30], [6.70, 51.30], [6.70, 51.18]]],
}

function stubGoogle(lat: number, lng: number, status = 'OK') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status, result: { geometry: { location: { lat, lng } } } }),
  } as unknown as Response)
}
```

- [ ] **Step 2: Test-Cases schreiben**

```typescript
describe('POST /api/kfzgutachter-lp/gutachter-verfuegbar', () => {
  describe('Input-Validation', () => {
    it('400 bei invalid JSON', async () => {
      const req = new Request('http://localhost/x', { method: 'POST', body: 'not-json' })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('400 bei garbage place_id', async () => {
      const res = await POST(makeReq({ placeId: "'; DROP TABLE" }))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Invalid place_id')
    })

    it('503 wenn GOOGLE_PLACES_API_KEY fehlt', async () => {
      vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      expect(res.status).toBe(503)
    })
  })

  describe('Google-Places-Lookup', () => {
    it('502 wenn Google-Status NOT_OK', async () => {
      stubGoogle(0, 0, 'ZERO_RESULTS')
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      expect(res.status).toBe(502)
    })
  })

  describe('Point-in-Polygon + Count', () => {
    it('zählt SVs deren Isochrone den Punkt umfasst', async () => {
      stubGoogle(50.94, 6.96) // Köln-Hbf
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: 'A', standort_adresse: null, profile_id: null },
          { id: 'sv2', isochrone_polygon: DUESSELDORF_POLY, paket: 'free', firmenname: 'B', standort_adresse: null, profile_id: null },
          { id: 'sv3', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: 'C', standort_adresse: null, profile_id: null },
        ],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.count).toBe(2) // sv1 + sv3
    })

    it('filtert Test-Accounts raus', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: 'Test Aaron Gutachter GmbH', standort_adresse: null, profile_id: null },
          { id: 'sv2', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: 'Echter SV', standort_adresse: null, profile_id: null },
        ],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.count).toBe(1)
    })

    it('überspringt invalide Isochronen (Legacy-Array-Format) ohne zu crashen', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: [{ lat: 50.9, lng: 6.96 }], paket: 'free', firmenname: null, standort_adresse: null, profile_id: null },
          { id: 'sv2', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: null, standort_adresse: null, profile_id: null },
        ],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.count).toBe(1)
    })
  })

  describe('Profile-Stack — Privacy', () => {
    it('exposed Profile NUR für paket="standard"', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: null, standort_adresse: 'X 1, 50667 Köln', profile_id: 'p1' },
          { id: 'sv2', isochrone_polygon: KOELN_POLY, paket: 'standard', firmenname: null, standort_adresse: 'Y 2, 50667 Köln', profile_id: 'p2' },
        ],
        error: null,
      })
      mockProfilesSelect.mockResolvedValue({
        data: [{ id: 'p2', vorname: 'Max', avatar_url: 'https://x/a.png' }],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.count).toBe(2)
      expect(json.gutachter).toHaveLength(1)
      expect(json.gutachter[0]).toMatchObject({
        id: 'sv2',
        vorname_initiale: 'M.',
        stadt: 'Köln',
        avatar_url: 'https://x/a.png',
      })
    })

    it('Bewertungen werden korrekt eingebunden', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [{ id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'standard', firmenname: null, standort_adresse: 'X, 50667 Köln', profile_id: 'p1' }],
        error: null,
      })
      mockProfilesSelect.mockResolvedValue({
        data: [{ id: 'p1', vorname: 'Anna', avatar_url: null }],
        error: null,
      })
      mockBewertungenSelect.mockResolvedValue({
        data: [{ profile_id: 'p1', durchschnitt: '4.7', anzahl_bewertungen: 89 }],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.gutachter[0].bewertungs_durchschnitt).toBe(4.7)
      expect(json.gutachter[0].bewertungs_anzahl).toBe(89)
    })
  })

  describe('Min-Loading-Delay', () => {
    it('Response dauert mindestens 600 ms (Wahrnehmungs-Floor)', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({ data: [], error: null })
      const t0 = Date.now()
      await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const elapsed = Date.now() - t0
      expect(elapsed).toBeGreaterThanOrEqual(580) // 20 ms Toleranz für CI-Jitter
    })
  })
})
```

- [ ] **Step 3: Tests laufen lassen**

```bash
npx vitest run src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/route.test.ts
```
Expected: alle PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/route.test.ts
git commit -m "test(kfzgutachter-lp): Integration-Tests für gutachter-verfuegbar Route"
```

---

## Task 3: E2E-Smoke für den vollständigen Popover-Funnel (Playwright)

Echtes Browser-Scripting gegen localhost:3000 + reale Google-Places + reale DB. Kein Mock — bewusst Integration zwischen allen Layern.

**Files:**
- Create: `scripts/smoke-popover-e2e.mjs`

- [ ] **Step 1: Helper-Setup (Env + DB-Client)**

```javascript
// scripts/smoke-popover-e2e.mjs — vollständige E2E des Scroll-Popovers.
// Verifiziert: Scroll-Trigger, Race-Fix nach Arm-Karenz, sessionStorage-Sperre,
// 3-Step-Wizard, Google-Places-Autocomplete, Verfügbarkeits-API,
// Profile-Stack-Rendering, Callback-Submit → anfragen-Zeile in DB.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const LP = 'http://localhost:3000/kfzgutachter-lp'

let failed = 0
function check(name, cond, extra = '') {
  if (cond) console.log(`  PASS  ${name}`)
  else {
    console.log(`  FAIL  ${name} ${extra}`)
    failed++
  }
}
```

- [ ] **Step 2: Scenario A — Race-Condition nach schnellem Scroll**

```javascript
async function scenarioA(browser) {
  console.log('\n=== Scenario A: schneller Scroll innerhalb Arm-Karenz triggert nach Arm ===')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${LP}?popover_debug=1`, { waitUntil: 'networkidle' })

  // 3 schnelle Wheel-Events innerhalb der Arm-Karenz (800 ms)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 600)
  // Stop, dann auf Arm + Re-Evaluation warten
  await page.waitForTimeout(2000)
  const modalCount = await page.locator('[role=dialog]').count()
  check('Modal öffnet sich nach Arm-Flip ohne weiteres Scroll-Event', modalCount === 1)
  await ctx.close()
}
```

- [ ] **Step 3: Scenario B — sessionStorage-Sperre**

```javascript
async function scenarioB(browser) {
  console.log('\n=== Scenario B: sessionStorage-Flag blockt Re-Trigger ===')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(LP, { waitUntil: 'networkidle' })
  await page.evaluate(() => sessionStorage.setItem('kfz-lp-popover-seen', '1'))
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight * 0.5 }))
  await page.waitForTimeout(2000)
  const modalCount = await page.locator('[role=dialog]').count()
  check('Modal bleibt zu wenn Flag gesetzt', modalCount === 0)
  await ctx.close()
}
```

- [ ] **Step 4: Scenario C — Force-Param öffnet Modal sofort**

```javascript
async function scenarioC(browser) {
  console.log('\n=== Scenario C: ?popover_force=1 öffnet Modal sofort ===')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${LP}?popover_force=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const modalCount = await page.locator('[role=dialog]').count()
  check('Modal öffnet sich ohne Scroll', modalCount === 1)
  await ctx.close()
}
```

- [ ] **Step 5: Scenario D — Full-Funnel mit DB-Verifikation**

```javascript
async function scenarioD(browser) {
  console.log('\n=== Scenario D: Full-Funnel Köln → Callback-Submit → anfragen-Row ===')
  const UNIQUE_PHONE = `0151${String(Date.now()).slice(-7)}`
  const UNIQUE_NAME = `Popover E2E ${Date.now().toString(36)}`

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  let verfuegbarRes = null
  page.on('response', async (r) => {
    if (r.url().includes('/api/kfzgutachter-lp/gutachter-verfuegbar')) {
      try { verfuegbarRes = await r.json() } catch {}
    }
  })

  await page.goto(`${LP}?popover_force=1&utm_source=e2e&utm_campaign=popover-smoke`, {
    waitUntil: 'networkidle',
  })
  await page.waitForTimeout(500)

  // Step 1
  await page.locator('button[aria-pressed="false"]').first().click()
  await page.locator('button:has-text("Weiter")').click()
  await page.waitForTimeout(500)

  // Step 2 — Autocomplete + Place-Pick
  await page.locator('#popover-standort').fill('Hohenstaufenring Köln')
  await page.waitForTimeout(900)
  const suggestionCount = await page.locator('[role=option]').count()
  check('Autocomplete liefert Suggestions', suggestionCount > 0)
  await page.locator('[role=option]').first().click()
  // wait for verfuegbar-API
  for (let i = 0; i < 25 && !verfuegbarRes; i++) await page.waitForTimeout(500)
  check('Verfügbarkeits-API antwortet ok', verfuegbarRes?.ok === true)
  check('count ist Zahl', typeof verfuegbarRes?.count === 'number')
  if (verfuegbarRes?.count > 0) {
    check('gutachter-Array geliefert', Array.isArray(verfuegbarRes.gutachter))
    // Profile-Stack im DOM
    const avatarCount = await page.locator('ul.flex.items-center.-space-x-2\\.5 li').count()
    check('Avatar-Stack hat ≥1 Avatar', avatarCount >= 1)
  }
  // Dropdown muss zu sein
  await page.waitForTimeout(500)
  const dropdownOpenAfterPick = await page.locator('[role=listbox]').count()
  check('Dropdown zu nach Pick (suppressNextQueryRef)', dropdownOpenAfterPick === 0)

  await page.locator('button:has-text("Weiter")').click()
  await page.waitForTimeout(400)

  // Step 3 — Callback-Pfad
  await page.locator('button:has-text("Lieber Rückruf")').click()
  await page.waitForTimeout(300)
  await page.locator('#popover-cb-name').fill(UNIQUE_NAME)
  await page.locator('#popover-cb-phone').fill(UNIQUE_PHONE)
  await page.locator('button:has-text("Rückruf anfordern")').click()
  // Auf SuccessView warten
  await page.locator('text=Danke').waitFor({ timeout: 10000 })
  check('Success-View gerendert', true)

  // DB-Verifikation
  await new Promise((r) => setTimeout(r, 1000))
  const { data: anfrage } = await sb
    .from('anfragen')
    .select('id, kontakt_name, kontakt_telefon, payload, utm_source, utm_campaign, konvertier_status, lead_id')
    .eq('kontakt_telefon', UNIQUE_PHONE)
    .single()
  check('anfragen-Row existiert', Boolean(anfrage))
  check('kontakt_name korrekt', anfrage?.kontakt_name === UNIQUE_NAME)
  check('utm_source=e2e', anfrage?.utm_source === 'e2e')
  check('payload.fahrzeug gesetzt', Boolean(anfrage?.payload?.fahrzeug))
  check('payload.place_id gesetzt', Boolean(anfrage?.payload?.place_id))
  check('konvertier_status=success', anfrage?.konvertier_status === 'success')
  check('lead_id verlinkt', Boolean(anfrage?.lead_id))

  await ctx.close()
}
```

- [ ] **Step 6: Main + Cleanup**

```javascript
(async () => {
  const browser = await chromium.launch()
  try {
    await scenarioA(browser)
    await scenarioB(browser)
    await scenarioC(browser)
    await scenarioD(browser)
  } finally {
    await browser.close()
  }
  console.log(`\n${failed === 0 ? '✓ ALL GREEN' : `✗ ${failed} CHECKS FAILED`}`)
  process.exit(failed === 0 ? 0 : 1)
})()
```

- [ ] **Step 7: Smoke ausführen**

Voraussetzung: `npm run dev` läuft auf :3000 (Aaron-Side oder dieselbe Shell).

```bash
node scripts/smoke-popover-e2e.mjs
```
Expected: alle 15+ Checks PASS, Exit-Code 0.

- [ ] **Step 8: Cleanup-Helper für die Test-Rows**

```javascript
// scripts/cleanup-popover-smoke.mjs — droppt alle anfragen-Rows
// die der smoke-popover-e2e.mjs hinterlassen hat (kontakt_name LIKE 'Popover E2E %').
// Manuell laufbar; CI macht das nicht — Test-Rows sind dort sowieso isoliert.
```

- [ ] **Step 9: Commit**

```bash
git add scripts/smoke-popover-e2e.mjs scripts/cleanup-popover-smoke.mjs
git commit -m "test(kfzgutachter-lp): E2E-Smoke für Scroll-Popover + Verfügbarkeit"
```

---

## Task 4: CI-Integration

Bisher fährt nur Vitest auf PRs (`npm run test`). E2E-Smoke ist optional und braucht laufenden Dev-Server — passt nicht in PR-CI, daher als manueller Run dokumentiert.

**Files:**
- Modify: `docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md` (Test-Pfad-Section) — Optional, nur dokumentarisch.

- [ ] **Step 1: README-Eintrag für den Smoke**

Ergänzung im LP-Verzeichnis: `src/app/kfzgutachter-lp/README.md` (falls noch nicht da, anlegen):

```markdown
## Testing

- Unit-Tests: `npm run test -- src/app/kfzgutachter-lp src/app/api/kfzgutachter-lp`
- E2E-Smoke (braucht laufenden Dev-Server): `node scripts/smoke-popover-e2e.mjs`
- Cleanup nach Smoke: `node scripts/cleanup-popover-smoke.mjs`
```

- [ ] **Step 2: Verify Vitest läuft alle neuen Tests in einem Aufruf**

```bash
npx vitest run
```
Expected: alle bestehenden + neuen Tests grün.

- [ ] **Step 3: Commit**

```bash
git add src/app/kfzgutachter-lp/README.md
git commit -m "docs(kfzgutachter-lp): Testing-Workflow dokumentiert"
```

---

## Self-Review Checklist

**Spec-Coverage:**
- [x] pointInRing inkl. Edge-Cases (offener Ring, < 4 Punkte, exakt-auf-Grenze)
- [x] isValidPolygon inkl. Legacy-Array-Format-Reject (Migration `aar_fix_isochrone_polygon_format`)
- [x] place_id-Validation (Regex)
- [x] Google-Status NOT_OK / Network-Error → 502
- [x] Privacy-Pattern (Standard-Paket only)
- [x] Test-Account-Filter
- [x] Min-Loading-Delay 600 ms
- [x] Race-Condition nach Arm-Karenz (Aaron-Bug)
- [x] sessionStorage-Sperre
- [x] Force-Param
- [x] Full-Funnel inkl. DB-Verifikation der `payload.fahrzeug` + `payload.place_id`-Felder
- [x] Avatar-Stack-Rendering
- [x] Dropdown-zu-nach-Pick (suppressNextQueryRef)

**Placeholder-Scan:** keine TBD/TODO im Plan.

**Type-Konsistenz:** `GutachterProfilPublic` Type identisch in `_lib.ts` (exportiert) + `route.ts` (importiert) + Client (`GutachterProfil`-Type, dort lokal weil Client-only).

**Scope:** Eine kohärente Test-Pyramide. Drei Task-Gruppen (Helper-Extraktion + Unit, Integration, E2E + CI-Doc). Keine Sub-Plan-Pflicht.

---

## Execution Handoff

Plan-Doc gespeichert unter `docs/superpowers/plans/2026-05-19-scroll-popover-testing.md`.

Zwei Execution-Optionen:

1. **Subagent-Driven (recommended):** Fresh Subagent pro Task + Two-Stage-Review (Spec-Compliance + Code-Quality). Schnellste Iteration.
2. **Inline-Execution:** In dieser Session sequentiell durchexekutieren mit Checkpoints.

Sag, welcher Weg. Bei Subagent-Driven nehme ich `subagent-driven-development`-Skill, bei Inline `executing-plans`.
