# Dispatch-Cockpit V2 — Design-Spec

**Datum:** 2026-07-06 · **Branch:** `kitta/dispatch-cockpit-v2` (off staging)

**Ziel:** Die SV-Live-Ops-Karte (`LiveOpsMap`) optisch aufwerten + drei Awareness-Features ergänzen — **der Reihe nach** gebaut. Reine Wiederverwendung der bestehenden Geo-/ETA-/Matching-Infra; keine neue DDL.

## Umfang (4 Schritte, sequenziell)

### Schritt 0 — Karte optisch aufwerten (farbiger Style)
Der graue `mapbox://styles/mapbox/light-v11` (Z.392) → **`MAPBOX_STYLE_STREETS`** (`streets-v12`, aus `src/lib/mapbox/styles.ts`) — farbig, konsistent mit der öffentlichen FinderMap, **klassischer Style** (kein Slot-System → die 13 bestehenden `addLayer`-Aufrufe funktionieren unverändert; `standard`/`-satellite` brauchen Slots → bewusst NICHT für diese overlay-lastige Karte, mögliches späteres „Wow"-Follow-up).
- **Overlay-Kontrast nachziehen** (der farbige Untergrund schluckt sonst die Overlays): Isochrone-Fill-Opacity leicht anheben, SV-/Termin-/Lead-Pins mit klaren weißen Strokes/Halos, Routen-Linien kräftiger. Werte über `MAPBOX_STYLE_*`-Konstante statt Inline-String; Style aus `styles.ts` importieren (kein neuer hardcoded String).

### Schritt 1 — Abdeckungslücken (Leads ohne erreichbaren SV)
Für jeden offenen Lead: liegt er in **irgendeiner** SV-Isochrone? Wenn nein → Abdeckungslücke.
- **Reine Funktion** `computeCoverageGaps(leads: LeadPin[], svs: SvLiveOps[]): Set<string>` (Lead-IDs ohne deckende Isochrone). Nutzt `pointInPolygon` (`@/lib/termine/engine/matching-score`) + `parseIsochrone` (`@/lib/dispatch/isochrone-parse`) — Isochrone-Containment ist die kanonische „erreichbar"-Logik der Engine (Radius-Fallback ist raus, 12.06.). **`parseIsochrone` statt blindem Cast** (die DB hat 3 Formate). Client-seitig berechnet (SVs+Leads sind in `LiveOpsMap` schon geladen), TDD.
- **Darstellung:** Lücken-Leads in der Lead-Circle-Farbe-Expression rot/auffällig (eigene Farbe via `feature-state` oder ein `__gap`-Property in `leadsFC`), + StatBar-Zähler „N Abdeckungslücken". Optional Layer-Toggle.

### Schritt 2 — ETA-Badges an Termin-Pins
Fahrzeit vom SV-Standort zum jeweiligen Termin als Text-Badge am Termin-Pin.
- **Server-seitig** in `get-offene-termine.ts`: pro SV `mapboxEtaMatrix(svStandort, [terminLocs…])` (Minuten, batch, Chunking bei >24) → `etaMin: number | null` je `TerminPin`. (SV-Standort = `sachverstaendige.standort_lat/lng` — grobe Planungs-ETA, keine Live-Position; ehrlich so gelabelt.)
- **Darstellung:** neuer Symbol-Layer `lo-termine-eta-label` auf `SRC_TERMINE` (bzw. `terminPinsFC` liefert `etaMin`), `text-field: '{etaMin} min'`, weißer Text mit Halo, Offset über dem Pin. Nur rendern wenn `etaMin != null`.

### Schritt 3 — Fahrweg-Route für die Assign-Vorschau
Die gerade Verbindungslinie aus V1 (`assignLineFC`) durch die **echte Mapbox-Fahrroute** ersetzen.
- Bei `previewSvId`-Hover im `AssignFromMapDrawer`: `fetchDrivingRoute(svStandort, leadCoords)` (client-tauglich, `NEXT_PUBLIC`-Token, 60s-Cache) → `route.primary.coords` in die `SRC_ASSIGN_LINE`-Source statt der geraden Linie. Fallback auf die gerade Linie bei Fetch-Fehler/Timeout (AbortController beim Hover-Wechsel).

## Wiederverwendung (kein Neubau)
`MAPBOX_STYLE_STREETS` · `pointInPolygon`+`haversineKm` (matching-score) · `parseIsochrone` (isochrone-parse) · `mapboxEtaMatrix` (matrix) · `fetchDrivingRoute` (directions) · die bestehende `LiveOpsMap`-Layer-/Rebuild-Effekt-Struktur.

## Test-Strategie (TDD)
- **Rein/TDD:** `computeCoverageGaps` (Lead in/out Isochrone, SV ohne Isochrone, mehrere SVs). `parseIsochrone`-Formate sind bereits getestet.
- **ETA/Route:** kein Unit-Test der Mapbox-Calls (Netz); die reine Verdrahtung (etaMin ins Pin, coords in die Source) per tsc/Build + Post-Deploy-Smoke.
- Post-Deploy je Rolle: Karte lädt mit neuem Style, Lücken-Leads rot, ETA-Badges an Terminen, Assign-Hover zeigt Fahrroute.

## Nicht-Ziele (V2)
- `standard`/`-satellite` 3D-Style (Slot-System-Umbau) — mögliches „Wow"-Follow-up.
- Live-Positions-basierte „schafft-er's"-ETA (Live-Position zu dünn) — bleibt büro-basiert grob.
- Coverage-Heatmap/Regionen-Aggregat (V2 markiert nur die Lücken-Leads punktuell).
- `arbeitszeiten`-Slot-Gate (feature-übergreifender Follow-up aus V1).

## Global Constraints
Umlaute in UI-Strings (Badges/Labels/StatBar). Design-Tokens (Overlay-Farben aus dem Claimondo-Schema bzw. der bestehende `// Token-Audit-Skip`-Header für Mapbox-Paint). GeoJSON `[lng,lat]`. Result-Pattern falls neue Server-Reads. Kein DDL. Style + Farben aus Konstanten, kein neuer hardcoded Style-String.
