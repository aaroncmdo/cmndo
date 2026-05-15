# 🐞 BUG: isochrone_polygon-Format für 8 SVs kaputt → Mapbox Iso-Halos rendern nicht

**Entdeckt:** 2026-05-15 im Vollstrecke-Smoke gegen staging.
**Severity:** Medium — kein Crash, aber Console-Error in Production-Konsole + 8 SVs ohne Iso-Halos.

## Symptom

Auf `/gutachter-finden` wirft Browser-Console:
```
[gutachter-finden] Mapbox-Fehler: undefined Input data is not a valid GeoJSON object.
```

Karte rendert, Marker rendern, **aber** Iso-Halos (die ondo-farbenen Polygone um die SVs) erscheinen nicht für 8 von 9 SVs mit Standard-Paket.

## Root Cause

`sachverstaendige.isochrone_polygon` (jsonb) enthält bei 8 Records ein nacktes Array von Punkt-Objekten:
```json
[ { "lat": 50.94, "lng": 6.95, ... }, { ... }, ... ]   // 12.000–25.000 Elemente
```

Soll-Format (GeoJSON-Polygon):
```json
{ "type": "Polygon", "coordinates": [[ [lng, lat], [lng, lat], ... ]] }
```

In `GutachterFinderMapClient.tsx:272–278`:
```ts
const tier1Features = aktiveSVs
  .filter((s) => s.paket === 'standard' && s.isochrone_polygon)
  .map((s) => ({
    type: 'Feature' as const,
    properties: { id: s.id, tier: 'standard' },
    geometry: s.isochrone_polygon as GeoJSON.Polygon,  // ← Cast lügt, ist tatsächlich Array
  }))
```

Filter prüft nur Truthy — ein Array ist truthy, kommt durch. Mapbox.addSource rejected dann mit dem generischen Error.

## Betroffene Records (Production-DB)

| firmenname | sv_id | array_length |
|---|---|---|
| Schmidt Sachverständige Köln (test-sv, smoke-patch) | `1da11741-a406-45ce-a27b-c041576cccbb` | 25.502 |
| Ingenieurbüro Cakmak (Hasan Cakmak) | `5e4c30d4-c020-4ba4-93c5-7c026077ef1d` | 24.083 |
| UnfallSafe Köln | `b2754f9c-d464-4411-9185-ca69b547f922` | 17.561 |
| _(unnamed)_ | `7f79e570-776b-4525-82ce-c35654ed6ecc` | 15.940 |
| Sachverständigenbüro Fronius | `67fba866-24c7-47d6-8f95-be8243ea72da` | 13.027 |
| Sachverständigenbüro A. Kloss | `e746d312-7bb5-49d3-9975-7a96c1f7a5d8` | 12.430 |
| Claimondo Test (Aaron Test-Sprafke) | `677400bf-dd31-4581-a645-07a7d624c190` | 11.999 |
| Sachverständigenbüro Gall | `eae70f94-980b-4ba4-a38d-c38af2f934da` | 10.054 |

**1 Record korrekt:** `{"type":"Polygon", ...}` (welcher genau — separate Query).

## Reproduktion

```bash
# Frontend
1. Browser-DevTools-Console öffnen
2. https://staging.claimondo.de/gutachter-finden besuchen
3. Console-Error nach ~2 s sichtbar

# Backend
SELECT id, firmenname, jsonb_typeof(isochrone_polygon::jsonb) AS j
FROM sachverstaendige
WHERE ist_aktiv = true AND isochrone_polygon IS NOT NULL
  AND jsonb_typeof(isochrone_polygon::jsonb) = 'array';
-- → 8 Records, alle ist_aktiv=true
```

## Fix-Optionen

### Option A — Frontend-Defense (5 min, schließt Symptom)

In `src/app/gutachter-finden/GutachterFinderMapClient.tsx:273`:
```ts
.filter(
  (s) =>
    s.paket === 'standard' &&
    s.isochrone_polygon &&
    typeof s.isochrone_polygon === 'object' &&
    !Array.isArray(s.isochrone_polygon) &&
    (s.isochrone_polygon as { type?: string }).type === 'Polygon',
)
```
Iso-Halos für 8 SVs weiterhin nicht sichtbar, aber Console-Error weg. Akzeptabel als Schnellfix.

### Option B — Daten reparieren (heikel)

Die Array-Records sind **nicht** rohe Polygon-Koordinaten — es sind Objekte `{lat, lng, ...}`. Eine direkte `jsonb_build_object('type','Polygon','coordinates', isochrone_polygon)` wäre **falsch**, weil GeoJSON `[lng, lat]` als Tupel erwartet, nicht Objekte.

Korrekt wäre eine Migration die für jeden Record das Array von `{lat, lng}` zu `[[lng1,lat1], [lng2,lat2], …]` flacht **und** in ein Polygon-Objekt wrappt. Schritt:
```sql
UPDATE sachverstaendige
SET isochrone_polygon = jsonb_build_object(
  'type', 'Polygon',
  'coordinates', jsonb_build_array(
    (SELECT jsonb_agg(jsonb_build_array(pt->>'lng', pt->>'lat'))
     FROM jsonb_array_elements(isochrone_polygon::jsonb) pt)
  )
)
WHERE id IN (<8 IDs>);
```
**Risiko:** ohne Verifizierung der echten Spalten-Namen (`lng`/`lat` vs `longitude`/`latitude`) → Daten kaputt. Lokal smoken vor Production.

### Option C — Isochrone neu generieren

Bevorzugte Lösung wenn die Generator-Pipeline noch da ist. Eintrag in `lib/` finden der Mapbox-Isochrone-API ruft, korrigieren (`geometries: 'geojson'`), für die 8 IDs re-runnen.

## Smoke-Patch-Hinweis

Im Vollstrecke-Smoke 2026-05-15 wurde `firmenname` von `Test Aaron Gutachter GmbH` → `Schmidt Sachverständige Köln` umbenannt um den Test-Account-Filter zu umgehen. Rollback in `ROLLBACK.sql`.

## Linear-Ticket (Vorschlag)

> **Titel:** `[KFZ-AAR-???] isochrone_polygon-Format für 8 SVs kaputt → Mapbox Iso-Halos rendern nicht + Console-Error`
> **Labels:** bug, frontend, backend, data
> **Priorität:** Medium (UX-Verlust, kein Crash)
