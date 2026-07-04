# SV-Live-Ops-Karte — Chunk 2: `<LiveOpsMap>`-Komponente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Die geteilte Mapbox-Komponente `<LiveOpsMap>` bauen, die Chunk-1s Loader-Daten rendert — alle 6 Layer (SV+Isochrone, Live-Autos, Termine, Routen, Tagesrouten, Dead-Pins), togglebar, mit Popups, Dead-Pin-Drawer (volle Verwaltung), Realtime. Kein Portal-Wiring (Chunk 3) — die Komponente ist per Fixture/Story isoliert lauffähig.

**Architecture:** Eine Client-Komponente `LiveOpsMap` (Mapbox via `@/lib/mapbox/client`) + fokussierte Sub-Komponenten. **Reine** Layer-Daten-Transformationen (GeoJSON-Builder) sind getestete Pure-Funktionen; die Map-Verwaltung (Marker/Layer/Teardown) ist Integrationscode nach dem `DispatchKarteClient`-Muster. Props: `{ role, data: LiveOpsData, onRefresh? }` — `data` kommt vom Chunk-3-Server, hier per Fixture.

**Tech Stack:** Next.js 15 Client Components, `mapbox-gl`, React `createRoot` für Popups, Supabase-Realtime, Vitest.

## Global Constraints

- **Reuse (importieren, NICHT neu bauen):** `@/lib/mapbox/client` (`ensureMapboxInitialized`, ENV `NEXT_PUBLIC_MAPBOX_TOKEN`), `@/lib/mapbox/sv-marker` (`addSvCarMarker(map, [lng,lat], {heading, bodyColor})` — heading-Rotation, keine transition), `@/lib/mapbox/route-layer` (`upsertRouteLayer`/`removeRouteLayer`), `@/lib/live-ops` (Chunk-1-Types: `SvLiveOps`, `TerminPin`, `DeadPin`, `UnterwegsRoute`, `TagesRoute`, `CarState`). Popup-Muster: `src/app/dispatch/karte/DispatchKarteClient.tsx:113-158` (createRoot + `mapboxgl.Popup.setDOMContent`). Isochrone-Layer: `FinderMap.tsx:459-494` (addSource geojson Polygon + fill/line). Dead-Pin-Verwaltung: `src/app/admin/sv-leads/*` (`SvLeadsClient` + `sv-leads/actions.ts` — Actions wiederverwenden).
- **Token-Audit:** Mapbox-Paint/Marker-Hex ist erlaubt mit `// Token-Audit-Skip`-Header (AAR-198). UI-Chrome (Panel/Sidebar/Drawer) nutzt `primitives.*` + claimondo-Tokens, KEIN handgerolltes Button/Card-Markup, KEINE raw Tailwind-Status/Accent-Scales, `rounded-ios-*`.
- **Teardown Pflicht:** `map.remove()` + alle Marker `.remove()` + Popup-Roots `.unmount()` + Realtime-Channel `removeChannel` beim Unmount (kein Leak — das war der Google-Maps-Bug).
- **Umlaute** in allen UI-Strings. **Nie** `position`/`inset` per Tailwind auf Mapbox-Elementen (inline-style).
- **Nie auf main pushen**; Branch `kitta/sv-live-ops-karte`.

---

## File Structure

- `src/components/live-ops/geo.ts` — pure GeoJSON-Builder (Task 1)
- `src/components/live-ops/geo.test.ts` — Tests (Task 1)
- `src/components/live-ops/LiveOpsMap.tsx` — Haupt-Client-Komponente (Task 2, erweitert 3-6)
- `src/components/live-ops/LayerPanel.tsx` — Layer-Toggles + Filter (Task 6)
- `src/components/live-ops/SidebarList.tsx` — Live-Liste (Task 6)
- `src/components/live-ops/StatBar.tsx` — Kennzahlen (Task 6)
- `src/components/live-ops/SvPopup.tsx` — SV-Popup-Inhalt (Task 3)
- `src/components/live-ops/TerminPopup.tsx` — Termin-Popup-Inhalt (Task 4)
- `src/components/live-ops/DeadPinDrawer.tsx` — volle Dead-Pin-Verwaltung (Task 5)
- `src/components/live-ops/types.ts` — `LiveOpsData` (Bündel der Chunk-1-Loader-Outputs) + `LayerKey`/`LayerState` (Task 2)

---

## Task 1: Pure GeoJSON-Builder (TDD)

**Files:** Create `src/components/live-ops/geo.ts`, `geo.test.ts`
**Interfaces:** Produces `svPinsFC(svs)`, `terminPinsFC(termine)`, `deadPinsFC(pins)`, `isochroneFC(svs)` — je eine `GeoJSON.FeatureCollection` mit `properties.__id` + `properties.__type`.

- [ ] **Step 1: Failing test** — für `svPinsFC([sv])`: erwarte 1 Feature, `geometry.type==='Point'`, `coordinates===[sv.standortLng, sv.standortLat]`, `properties.__id===sv.id`, `properties.typ===sv.typ`. Für `isochroneFC`: SV mit `isochrone` (GeoJSON Polygon) → 1 Polygon-Feature; SV ohne → 0. SVs ohne lat/lng werden gedropt.
- [ ] **Step 2:** vitest → FAIL. **Step 3:** implementieren (pure, filtern null-Koords, `[lng,lat]`-Reihenfolge!). **Step 4:** PASS. **Step 5: Commit.**

## Task 2: LiveOpsMap-Core (Init/Teardown/States)

**Files:** Create `src/components/live-ops/LiveOpsMap.tsx`, `src/components/live-ops/types.ts`
**Interfaces:** Consumes Chunk-1-Types + `geo.ts`. Produces `<LiveOpsMap role data />` (rendert Container + Map). `type LiveOpsData = { svs: SvLiveOps[]; termine: TerminPin[]; routen: UnterwegsRoute[]; tagesrouten: TagesRoute[]; deadPins: DeadPin[] }`. `type LayerKey = 'svs'|'autos'|'termine'|'routen'|'tagesrouten'|'deadpins'`.

- [ ] **Step 1:** `LiveOpsMap.tsx` — `'use client'`, `// Token-Audit-Skip`-Header (Mapbox-Hex). `useRef` für map/markers/popupRoots. `useEffect`: `ensureMapboxInitialized()` → wenn kein Token: Fehler-State + `ErrorState`-Box (Umlaut „Karte nicht verfügbar"). Sonst `new mapboxgl.Map({ container, style: 'mapbox://styles/mapbox/light-v11', center: [10.45,51.16], zoom: 5.4, attributionControl:false })`, `NavigationControl`, `map.on('load', () => setReady)`, `map.on('error', …)` → error-State. Loading-Spinner bis ready. **Cleanup:** `map.remove()`, refs leeren.
- [ ] **Step 2:** `npx tsc --noEmit` grün; Komponente rendert Container + States. **Step 3: Commit.**

## Task 3: SV-Pins + Isochrone + Live-Autos + Hover-Sync

**Files:** Modify `LiveOpsMap.tsx`; Create `SvPopup.tsx`
**Interfaces:** Consumes `svPinsFC`/`isochroneFC`, `addSvCarMarker`. Produces Hover-State `hoveredSvId` (für Sidebar-Sync in Task 6).

- [ ] **Step 1:** Nach `ready`: `addSource('svs', svPinsFC)` + circle-Layer (typ-Farbe via `match`-Expression), `addSource('isos', isochroneFC)` + fill/line-Layer. Für jeden SV mit `car.mode!=='none'`: `addSvCarMarker(map, [car.lng,car.lat], {heading: car.heading})` in `carMarkersRef`. Klick auf SV-Circle/Auto → Popup via createRoot(`<SvPopup sv />`) + `mapboxgl.Popup.setDOMContent`. `mouseenter/leave` → `hoveredSvId`. **Rebuild-Effect** bei `data.svs`-Änderung: alte Marker `.remove()` + Layer-Source `setData` (kein doppeltes addLayer).
- [ ] **Step 2:** `SvPopup.tsx` — Name, Typ-Badge, Verifiziert, Auslastung, Paket, „SV öffnen"-Link, wenn unterwegs: Termin + ETA. primitives/Tokens.
- [ ] **Step 3:** tsc grün. **Step 4: Commit.**

## Task 4: Termine-Pins + Routen + Tagesrouten

**Files:** Modify `LiveOpsMap.tsx`; Create `TerminPopup.tsx`
- [ ] **Step 1:** `addSource('termine', terminPinsFC)` + circle-Layer (status-Farbe), Klick → `TerminPopup` (Kunde, Status, Zeit, Fall-Nr, „Fall öffnen"). Routen: für jede `UnterwegsRoute` `upsertRouteLayer(map, coords, 'live', …)` (oder ein geojson line-Layer aus allen Routen). Tagesrouten (Layer default AUS): line-Layer aus `tagesrouten[].stops` + nummerierte Stop-Marker.
- [ ] **Step 2:** tsc grün. **Step 3: Commit.**

## Task 5: Dead-Pins-Layer + DeadPinDrawer (volle Verwaltung)

**Files:** Modify `LiveOpsMap.tsx`; Create `DeadPinDrawer.tsx`
**Interfaces:** Reuse `sv-leads/actions.ts` (Einladen/Beanspruchen/Konvertieren/Ablehnen/Anlegen/Bulk/DAT) — LESE `src/app/admin/sv-leads/*` für die Action-Namen + Signaturen.

- [ ] **Step 1:** `addSource('deadpins', deadPinsFC)` + circle-Layer (status-Farbe), Klick → öffnet `DeadPinDrawer` (nicht Popup — mehr Platz). „Karten-Klick im Anlege-Modus setzt Koordinate" (Verbesserung: `map.on('click')` im Anlege-Modus → lat/lng ins Formular).
- [ ] **Step 2:** `DeadPinDrawer.tsx` (`primitives.Drawer`/`Modal`) — die volle sv-leads-Verwaltung: Liste/Filter (Status), Detail + Aktionen (Result-Object-Check `res.ok`/`res.success`), Neu-Anlegen (mit Karten-Klick-Koordinate), Bulk-Import, DAT-Sync. Actions aus `sv-leads/actions.ts` importieren, NICHT neu bauen.
- [ ] **Step 3:** tsc grün + component-set/token-audit 0 neue. **Step 4: Commit.**

## Task 6: LayerPanel + SidebarList + StatBar + Realtime + Integration

**Files:** Create `LayerPanel.tsx`, `SidebarList.tsx`, `StatBar.tsx`; Modify `LiveOpsMap.tsx`
- [ ] **Step 1:** `LayerPanel` — 6 Toggle-Checkboxes (`LayerState`), gesteuert in `LiveOpsMap` (Layer-Visibility via `map.setLayoutProperty(layer,'visibility',...)` + Marker show/hide). Filter (Typ/Verifizierung/„nur unterwegs"). `SidebarList` — Unterwegs-SVs zuerst, dann heutige Termine; Hover-Sync mit `hoveredSvId` (bidirektional); Suche. `StatBar` — live/unterwegs/offene Termine/Dead-Pins-Counts (aus `data`).
- [ ] **Step 2:** Realtime: Supabase-Channel auf `sv_live_location` (Muster `useGeoTracking.ts:122-133`) → `onRefresh?.()` (Chunk 3 reicht einen Server-Refresh) ODER lokales Update der Auto-Position. Channel-Cleanup im Unmount.
- [ ] **Step 3:** Volle Verifikation: tsc 0, vitest (geo) grün, token-audit 0, component-set/knip `--ratchet` 0 neue. **Step 4: Commit + PR-Vorbereitung.**

---

## Self-Review
- **Spec-Coverage:** 6 Layer (§4 Spec) → Tasks 3-5; Layout (§5) → Task 6; Live-Autos (§6) → Task 3; Dead-Pin-Vollverwaltung (§7) → Task 5; Realtime (§3c) → Task 6; Teardown (Karten-Leak-Lehre) → Task 2. Leads-Layer (Dispatch-Vollersatz, §12) = Chunk 3 (role-scoped, dort verdrahtet).
- **Placeholder-Scan:** Reuse-Quellen mit file:line; Layer-Specs konkret. Kein „TBD".
- **Type-Consistency:** `LiveOpsData`/`LayerKey` in Task 2 def, in 3-6 konsumiert; `hoveredSvId` Task 3 def, Task 6 use.

**Hinweis:** UI-Komponenten sind schwer voll-TDD-bar; Pure-Logik (geo.ts) ist getestet, die Map-Integration wird im Chunk-3-Live-Smoke verifiziert (Prod-Render je Rolle).
