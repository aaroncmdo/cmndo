# /gutachter/heute React-Crash — `isochronePolygon.map is not a function`

**Datum:** 2026-05-15
**Branch:** `kitta/aar-gutachter-heute-isochrone-fix`
**Loop:** Mobile-Hygiene Iteration 5 (SV-Heute-Crash)

## Befund

Mobile-Hygiene-Audit (15.05.2026) reportet auf `/gutachter/heute` einen `pageerror`:

```json
{
  "scope": "sv",
  "url": "https://app.staging.claimondo.de/gutachter/heute",
  "type": "pageerror",
  "msg": "Minified React error #418 / x.map is not a function"
}
```

Lokales Repro (Playwright + DevTools Stack-Trace):

```
[PAGEERROR] isochronePolygon.map is not a function
TypeError: isochronePolygon.map is not a function
    at TagesrouteMap.useEffect.apply (.../TagesrouteMap.tsx:491)
    at Map.fire (mapbox-gl)
    at Map._render (mapbox-gl)
```

Page rendert (Mapbox-Karte + Termine sichtbar), aber `window.onerror` fängt den Crash beim Polygon-Render.

## Root-Cause

DB-Audit (15.05.2026, `sachverstaendige.isochrone_polygon`):

| `jsonb_typeof` | Rows |
|---|---|
| `array` | 1 |
| `object` | 9 |

90 % der SV-Datensätze haben `isochrone_polygon` als **GeoJSON-Polygon-Object** `{ type: "Polygon", coordinates: [[[lng, lat], ...]] }` (vermutlich Mapbox-Isoline-API-Output). 1 Legacy-Row noch im alten Shape `Array<{lat, lng}>`.

Code-Type in `page.tsx:75`:

```ts
isochrone_polygon: Array<{ lat: number; lng: number }> | null
```

Reines TypeScript-Wishful-Thinking-Annotation — keine Runtime-Validation. `TagesrouteMap.tsx:487` guarded zwar auf `!isochronePolygon || isochronePolygon.length < 3`, aber bei Objects ist `.length === undefined < 3 → false` (kein NaN-Trick), Guard durchläuft, Z. 491 `.map(...)` crasht.

## Fix

Normalize-Helper in `page.tsx`, akzeptiert beide Shapes:

```ts
function normalizeIsochrone(raw: unknown): Array<{ lat: number; lng: number }> | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw as Array<{ lat: number; lng: number }>
  if (typeof raw === 'object' && 'coordinates' in raw) {
    const coords = (raw as { coordinates?: unknown }).coordinates
    if (Array.isArray(coords) && Array.isArray(coords[0])) {
      const ring = coords[0]
      const points = ring.filter(p => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
      if (points.length >= 3) return points.map(([lng, lat]) => ({ lat, lng }))
    }
  }
  return null
}
```

Type-Annotation gleichzeitig auf `unknown` umgestellt (Truth-in-typing — JSONB hat kein Schema, also kein TS-Generic).

## Was nicht geändert wurde

- `TagesrouteMap.tsx` bleibt unberührt — Component erwartet weiterhin `Array<{lat,lng}>` und nutzt den Output von `normalizeIsochrone`.
- Andere Konsumenten von `isochrone_polygon`: keine — `grep` zeigt nur diesen Pfad als Verbraucher.
- DB-Schema: nicht migriert. Beide Shapes bleiben für die Übergangszeit gültig. Eine spätere Konsolidierung (alle Rows auf einen Shape) ist Backlog.

## Verifikation lokal

```bash
node scripts/repro-sv-heute.mjs
# vor Fix:
#   [PAGEERROR] isochronePolygon.map is not a function ...
# nach Fix:
#   done   (kein pageerror)
```

## Post-merge Verifikation

```bash
STAGING_BASIC_PASS='…' AUDIT_OUT='docs/15.05.2026/mobile-hygiene-post-isochrone' \
  node scripts/mobile-hygiene-audit.mjs
```

Erwartet: kein `pageerror` mehr für `/gutachter/heute` in `audit-summary.json`.
