# Dispatch-Cockpit V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Karte farbig aufwerten + Abdeckungslücken + ETA-Badges + Fahrweg-Route (Assign-Vorschau) — der Reihe nach.

**Tech Stack:** Next.js 15, Supabase, Mapbox GL, Tailwind v4 + Claimondo-Tokens, Vitest.

## Global Constraints
- **Reuse:** `MAPBOX_STYLE_STREETS` (`@/lib/mapbox/styles`) · `pointInPolygon`+`haversineKm` (`@/lib/termine/engine/matching-score`) · `parseIsochrone` (`@/lib/dispatch/isochrone-parse`) · `mapboxEtaMatrix` (`@/lib/mapbox/matrix`, liefert Minuten) · `fetchDrivingRoute` (`@/lib/mapbox/directions`, client-tauglich, `route.primary.coords` + `.duration`-Sek). **Nichts davon neu bauen.**
- GeoJSON immer `[lng,lat]`. Umlaute in UI-Strings. `LiveOpsMap.tsx` hat einen `// Token-Audit-Skip`-Header (Mapbox-Paint-hex ok). Kein DDL. Style aus Konstante, kein hardcoded String.
- `computeCoverageGaps` muss `parseIsochrone` nutzen (nicht das rohe `sv.isochrone` casten — 3 DB-Formate).

---

## Task 0: Karte-Style + Overlay-Kontrast

**Files:** Modify `src/components/live-ops/LiveOpsMap.tsx`

- [ ] **Step 1: Style-Konstante** — oben importieren `import { MAPBOX_STYLE_STREETS } from '@/lib/mapbox/styles'`. Bei der Map-Init (`style: 'mapbox://styles/mapbox/light-v11'`, ~Z.392) → `style: MAPBOX_STYLE_STREETS`.

- [ ] **Step 2: Overlay-Kontrast** — die Paint-Properties der Overlays für den farbigen Untergrund anheben (Werte in den bestehenden `addLayer`-Blöcken):
  - `LAYER_ISOS_FILL`: `'fill-opacity'` 0.1 → **0.18**.
  - `LAYER_ISOS_LINE`: `'line-opacity'` 0.5 → **0.7**, `'line-width'` 1.5 → **2**.
  - SV-/Termin-/Lead-/Kandidaten-Circle-Layer: sicherstellen dass `'circle-stroke-color': '#ffffff'` + `'circle-stroke-width'` ≥ **2** gesetzt ist (weiße Halos = Kontrast auf Farbe).
  - `LAYER_ROUTEN_LINE` + `LAYER_TAGESROUTEN_LINE`: `'line-width'` +1.

- [ ] **Step 3: Verifikation** — `npx tsc --noEmit`=0 · `npm run build` grün (bei EBUSY: `rm -rf .next/standalone` + erneut; bei Font-Offline: notieren, CI autoritativ) · `check:token-audit`/`component-set --ratchet`/`knip --ratchet` 0 neue. (Kein Unit-Test — visuell.)

- [ ] **Step 4: Commit** — `git commit -am "feat(dispatch-cockpit-v2): farbiger streets-Style + Overlay-Kontrast"`

---

## Task 1: Abdeckungslücken

**Files:** Create `src/lib/live-ops/coverage.ts` + `src/lib/live-ops/coverage.test.ts` · Modify `src/components/live-ops/geo.ts`, `src/components/live-ops/LiveOpsMap.tsx`, `src/components/live-ops/StatBar.tsx`

**Interfaces:** Produces `computeCoverageGaps(leads: LeadPin[], svs: SvLiveOps[]): Set<string>` (Lead-IDs ohne deckende SV-Isochrone).

- [ ] **Step 1: Failing test** — `coverage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeCoverageGaps } from './coverage'

// Quadrat-Isochrone um (lng 13, lat 52), Kantenlänge ~2 Grad
const sqIso = { coordinates: [[[12,51],[14,51],[14,53],[12,53],[12,51]]] }
const lead = (id: string, lng: number, lat: number) => ({ id, name:'L', status:'neu', lng, lat, ort:null, kanal:null, erstelltAm:'', hasActiveTermin:false }) as any
const sv = (id: string, iso: unknown) => ({ id, name:'S', typ:'kfz', verifiziert:true, paket:'pro', genutzt:0, gesamt:10, gesperrt:false, urlaub:false, standortLat:52, standortLng:13, isochrone: iso, car:{mode:'none',lat:null,lng:null,heading:null,zielLat:null,zielLng:null,terminId:null,etaMinuten:null} }) as any

describe('computeCoverageGaps', () => {
  it('Lead innerhalb der Isochrone = keine Lücke', () => {
    const gaps = computeCoverageGaps([lead('a', 13, 52)], [sv('s1', sqIso)])
    expect(gaps.has('a')).toBe(false)
  })
  it('Lead ausserhalb aller Isochronen = Lücke', () => {
    const gaps = computeCoverageGaps([lead('b', 20, 60)], [sv('s1', sqIso)])
    expect(gaps.has('b')).toBe(true)
  })
  it('SV ohne Isochrone deckt nichts', () => {
    const gaps = computeCoverageGaps([lead('c', 13, 52)], [sv('s1', null)])
    expect(gaps.has('c')).toBe(true)
  })
})
```

- [ ] **Step 2: Rot** — `npx vitest run src/lib/live-ops/coverage.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — `coverage.ts`:

```typescript
import { pointInPolygon } from '@/lib/termine/engine/matching-score'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'
import type { LeadPin, SvLiveOps } from './types'

// Ein Lead ist eine Abdeckungslücke, wenn er in KEINER SV-Isochrone liegt
// (Isochrone-Containment = kanonische Erreichbarkeits-Logik der Engine).
export function computeCoverageGaps(leads: LeadPin[], svs: SvLiveOps[]): Set<string> {
  const polygons = svs
    .map((s) => parseIsochrone(s.isochrone))
    .filter((p): p is [number, number][] => p != null && p.length >= 3)
  const gaps = new Set<string>()
  for (const lead of leads) {
    const covered = polygons.some((poly) => pointInPolygon([lead.lng, lead.lat], poly))
    if (!covered) gaps.add(lead.id)
  }
  return gaps
}
```

Verifiziere die exakten Import-Signaturen: `pointInPolygon(point: [number,number], polygon: [number,number][]): boolean` und `parseIsochrone(raw: unknown): [number,number][] | null` (bzw. `Point[]` — dann den Typ angleichen). Falls eine der beiden aus einem `'use server'`-File kommt (Client-Bundle-Problem): die reine Funktion in ein normales lib-File verschieben/duplizieren — sie sind pure, kein Server-Zugriff.

- [ ] **Step 4: Grün** — `npx vitest run src/lib/live-ops/coverage.test.ts` → PASS. `npx tsc --noEmit`=0.

- [ ] **Step 5: geo.ts — `__gap` in `leadsFC`** — `leadsFC(leads, gapIds?: Set<string>)`: `properties.__gap = gapIds?.has(lead.id) ? 1 : 0`. Default-Param abwärtskompatibel (bestehende Aufrufer ohne gapIds → alle 0).

- [ ] **Step 6: LiveOpsMap-Verdrahtung** — `const gapIds = useMemo(() => computeCoverageGaps(data.leads, data.svs), [data.leads, data.svs])`. Beim Aufbau/Rebuild der Leads-Source `leadsFC(data.leads, gapIds)` übergeben. Die `LEAD_STATUS_COLOR_EXPR` (Einzel-Lead-Circle) so erweitern, dass `['==', ['get','__gap'], 1]` → auffällige Lücken-Farbe (z.B. `#ef4444`-Ton bzw. `danger`; unter dem Skip-Header raw-hex ok). StatBar bekommt `coverageGaps: gapIds.size`.

- [ ] **Step 7: StatBar** — `StatBar.tsx` um eine Kennzahl „N Abdeckungslücken" erweitern (nur anzeigen wenn > 0), Umlaute korrekt.

- [ ] **Step 8: Verifikation + Commit** — tsc 0 · vitest grün · Ratchets 0 neu · Build grün. `git commit -am "feat(dispatch-cockpit-v2): Abdeckungsluecken (Lead ohne SV-Isochrone rot + Zaehler)"`

---

## Task 2: ETA-Badges an Termin-Pins

**Files:** Modify `src/lib/live-ops/get-offene-termine.ts`, `src/lib/live-ops/types.ts`, `src/components/live-ops/geo.ts`, `src/components/live-ops/LiveOpsMap.tsx`

**Interfaces:** Produces `TerminPin.etaMin: number | null` (Fahrzeit SV-Standort → Termin in Minuten).

- [ ] **Step 1: Typ** — `types.ts`: `TerminPin` um `etaMin: number | null` erweitern.

- [ ] **Step 2: ETA server-seitig berechnen** — in `get-offene-termine.ts`: die SV-Standorte laden (der bestehende `sachverstaendige`-Fetch für Namen um `standort_lat, standort_lng` erweitern). Termine nach `svId` gruppieren; je SV `mapboxEtaMatrix({lat:standortLat,lng:standortLng}, terminLocs)` (`import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'`) → `etaMin` je Termin zuordnen (Reihenfolge der destinations == Reihenfolge der Rückgabe). `etaMin: null` wenn SV keinen Standort hat oder Matrix `null` liefert. Fehler defensiv (try/catch je SV-Batch, `etaMin=null` bei Fehler — kein Loader-Crash).

- [ ] **Step 3: geo.ts** — `terminPinsFC` schreibt `properties.etaMin` (nur wenn `!= null`; sonst Property weglassen, damit der Symbol-Layer-Filter greift).

- [ ] **Step 4: Symbol-Layer** — in `LiveOpsMap.tsx` neuer Layer `LAYER_TERMINE_ETA = 'lo-termine-eta-label'` auf `SRC_TERMINE`, `type:'symbol'`, `filter: ['has','etaMin']`, `layout: { 'text-field': ['concat', ['to-string',['get','etaMin']], ' min'], 'text-size': 10, 'text-font': ['DIN Offc Pro Medium','Arial Unicode MS Bold'], 'text-offset': [0, -1.4], 'text-anchor': 'bottom' }`, `paint: { 'text-color': '#0D1B3E', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }`. Nach dem Termin-Circle-Layer einfügen; Toggle an den bestehenden `termine`-Layer-Toggle koppeln. `map.remove()` räumt es ab.

- [ ] **Step 5: Verifikation + Commit** — tsc 0 · vitest grün · Ratchets 0 neu · Build grün. `git commit -am "feat(dispatch-cockpit-v2): ETA-Badges an Termin-Pins (mapboxEtaMatrix)"`

---

## Task 3: Fahrweg-Route für die Assign-Vorschau

**Files:** Modify `src/components/live-ops/LiveOpsMap.tsx`

**Interfaces:** Der bestehende Assign-Linien-Effekt (V1, `SRC_ASSIGN_LINE` via `assignLineFC(from,to)`) zeichnet eine gerade Linie zwischen Kandidat-SV-Standort und Lead. V2 ersetzt sie durch die echte Fahrroute.

- [ ] **Step 1: Route-Fetch im Preview-Effekt** — den bestehenden `useEffect`, der bei `previewSvId`/`assignLeadId` die `SRC_ASSIGN_LINE`-Source setzt, umbauen: statt sofort `assignLineFC(from,to)` → zuerst die gerade Linie setzen (Sofort-Feedback), dann async `fetchDrivingRoute(from, to)` (`import { fetchDrivingRoute } from '@/lib/mapbox/directions'`, Args `[lng,lat]`) und bei Erfolg die Source auf ein LineString-FC aus `result.primary.coords` setzen. `AbortController` pro Effekt-Lauf (Cleanup: `abort()`), damit ein Hover-Wechsel den alten Fetch canceled. Bei Fehler/Abort: gerade Linie bleibt (kein Throw ins UI).

```typescript
useEffect(() => {
  const map = mapRef.current
  const src = map?.getSource(SRC_ASSIGN_LINE) as mapboxgl.GeoJSONSource | undefined
  if (!src) return
  const sv = data.svs.find((s) => s.id === previewSvId)
  const lead = leadsRef.current.find((l) => l.id === assignLeadId)
  const from = sv?.standortLat != null && sv.standortLng != null ? [sv.standortLng, sv.standortLat] as [number,number] : null
  const to = lead ? [lead.lng, lead.lat] as [number,number] : null
  src.setData(assignLineFC(from, to)) // Sofort: gerade Linie
  if (!from || !to) return
  const ctrl = new AbortController()
  fetchDrivingRoute(from, to, { signal: ctrl.signal })
    .then((r) => {
      const s = mapRef.current?.getSource(SRC_ASSIGN_LINE) as mapboxgl.GeoJSONSource | undefined
      if (s && r.primary?.coords?.length) {
        s.setData({ type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'LineString', coordinates: r.primary.coords }, properties:{} }] })
      }
    })
    .catch(() => {}) // Abort/Fehler: gerade Linie bleibt
  return () => ctrl.abort()
}, [previewSvId, assignLeadId, data.svs])
```

- [ ] **Step 2: Verifikation + Commit** — tsc 0 · vitest grün · Ratchets 0 neu · Build grün. `git commit -am "feat(dispatch-cockpit-v2): echte Fahrweg-Route in der Assign-Vorschau (fetchDrivingRoute)"`

---

## Abschluss
Finaler Whole-Branch-Review (opus). PR gegen staging. Post-Deploy-Smoke je Rolle (Style/Lücken/ETA/Route).

## Selbst-Review
- Coverage: Style (T0), Lücken (T1), ETA (T2), Route (T3) — alle Spec-Punkte abgedeckt.
- Platzhalter: keine — Import-Signaturen als „verifizieren"-Schritt markiert.
- Typen: `computeCoverageGaps`→`Set<string>`, `TerminPin.etaMin`, `leadsFC(leads, gapIds?)` konsistent verwendet.
