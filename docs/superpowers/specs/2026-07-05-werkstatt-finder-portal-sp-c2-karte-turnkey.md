# SP-C2 — Werkstatt-Finder-Karte (Mapbox) im Kunde-Portal — Turnkey Spec

> Ersetzt die SP-C1-Liste im `WerkstattFinderCard` durch eine **Mapbox-Karte** (Aaron-Entscheidung: „Karte, wie Gutachter-Finder"). Reine Präsentations-Erweiterung auf SP-C1s Actions — SP-C1 ist in **PR #3664** (Branch `kitta/werkstatt-finder-portal`). Frische Session: off staging bauen (NICHT auf #3664 stapeln — Stranding-Lehre).

**Datum:** 2026-07-05 · **Vorgänger:** `2026-07-05-werkstatt-finder-portal-design.md`

---

## 1. Bestandsaufnahme (SP-C1, in PR #3664)

- `ladeWerkstaettenFuerClaim(claimId)` → `{ ok:true; werkstaetten: WerkstattFinderRow[] }`. `WerkstattFinderRow` hat `id, name, adresse_*, telefon, lat, lng, distanz_km, passt`.
- `waehleWerkstattPortal(claimId, werkstattId)` → assign (quelle='kunde', Ownership + Anti-IDOR).
- `WerkstattFinderCard.tsx` (src/components/kunde/) rendert aktuell `<WerkstattFinder>` (Liste).
- `WerkstattFinder` (src/components/werkstatt/finder/) = rangierte Liste — als **Sidebar/Bottom-Sheet** wiederverwenden.

## 2. Karte-Pattern (mirror — NICHT FinderMap)

**Vorbild:** `src/app/kunde/termin/[token]/_kunde-live-map/KundeLiveMap.tsx` = schlanke Portal-Mapbox-Karte. Nutzt `ensureMapboxInitialized, mapboxgl` aus **`@/lib/mapbox/client`** (NICHT `@/lib/mapbox`-Index → THREE.js-Bundle-Crash, s. FinderMap-Kommentar), `import 'mapbox-gl/dist/mapbox-gl.css'`, custom HTML-Marker via `createRoot`. **NICHT** die 1039-Zeilen `embed/gutachter-finder/_components/FinderMap.tsx` anfassen (hot aar-956).

**Zwei harte Lehren im Kopf behalten:**
- **Token-Audit-Skip-Header** an den Dateianfang (Mapbox erwartet raw hex für Marker/Paint): `// Token-Audit-Skip: Mapbox-GL raw hex …` (s. FinderMap Z.1-2).
- **Mapbox-Positionierung nie per Tailwind-`position`-Utility** auf einem Element, dem mapbox-gl selbst eine `position`-Regel gibt → inline-`style` nutzen (GutachterFinderMapClient-Incident 12.05.).

## 3. Bau

1. **Loader-Center-Erweiterung** (`werkstatt-finder-actions.ts`): `ladeWerkstaettenFuerClaim` zusätzlich das Karten-Center aus `claims.schadenort_lat/lng` zurückgeben → `{ ok:true; werkstaetten; center: { lat:number; lng:number } | null }`. Fallback-Center: erste Werkstatt mit lat/lng, sonst `null` (dann Liste-only). (Kunde liest `schadenort_lat/lng` via Owner-RLS — additive select.)
2. **Neue `WerkstattFinderMap.tsx`** (client, self-contained, mirror KundeLiveMap): Karte auf `center`; pro Werkstatt ein HTML-Marker (Name + `distanz_km`, „Passt"-Highlight); Klick auf Marker → `selectedId` + scrollIntoView der Listen-Card; die `WerkstattFinder`-Liste als Sidebar (Desktop) / Bottom-Sheet (Mobil, `lg:hidden`); `onSelect` → `waehleWerkstattPortal`. Höhe z.B. `h-[60vh]` in der Card. Kein center → nur `<WerkstattFinder>` (Fallback).
3. **`WerkstattFinderCard.tsx`** — `<WerkstattFinder …>` durch `<WerkstattFinderMap …>` ersetzen (Karte + Liste). Loader-Aufruf + `handleSelect` bleiben; zusätzlich `center` durchreichen.

## 4. Abgrenzung / Koordination

- **Neue Files** (`WerkstattFinderMap.tsx`) + 1 Loader-Zeile + 1 Card-Swap — kein `WerkstattFinder`/`WerkstattCard`/`vermittlung-server`/FinderMap-Touch.
- Off staging, eigener Branch, eigener PR. SP-D (Reparatur-Stepper) danach.

## 5. Definition of Done

- [ ] `WerkstattFinderMap` (Mapbox, Token-Audit-Skip, inline-`style`-Position, self-contained).
- [ ] Loader gibt `center` (schadenort) zurück; Card reicht es durch.
- [ ] `WerkstattFinderCard` zeigt Karte+Liste (Fallback Liste bei fehlendem center).
- [ ] **Voller Build grün**, tsc 0, token-audit (skip-header greift) / component-set / knip 0-neu, i18n(-render) grün.
- [ ] Post-Deploy-Smoke: Karte zeigt Werkstatt-Pins um den Schadenort, Pin-/Listen-Klick → Auswahl → `WerkstattCard`.
