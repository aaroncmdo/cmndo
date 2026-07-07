# Isochrone-Union + Finder-Einzel-SV-Restore — Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** (A) Isochronen als EINE zusammenhängende Fläche (echte geometrische Union via `@turf/union`, keine Vereinfachung — volle Isochrone-Geometrie) in Finder + Dispatch-Karte. (B) Im Finder die Einzel-SV-Ansicht (Route + Profil) wiederherstellen, die `#3677`/`1325e04da` entfernt hat (= Rendering-Revert; Kontaktdaten bleiben serverseitig maskiert).

**Tech:** Next.js 15, Mapbox GL v3, `@turf/union`, Vitest.

## Global Constraints
- `unionIsochrones` nutzt **`parseIsochrone`** (`@/lib/dispatch/isochrone-parse`, 3 DB-Formate) — NICHT den rohen `as GeoJSON.Polygon`-Cast. GeoJSON `[lng,lat]`.
- Einzel-SV-Restore ist **client-seitig** (Daten in `AktiverSVPublic` vorhanden: `vorname`, `vorname_initiale`, Stadt, Specs, Bewertung, Isochrone, Standort; `empfehleSvFuerOrt` in `actions.ts` vorhanden). **Kein Loader/Payload-Change** (kein Telefon/Email/Adresse/Firmenname exponieren — Skimming-Schutz bleibt). Avatar-Foto = bewusst NICHT (alte Version nutzte Initiale).
- Der entfernte Code ist die Quelle: `git show 1325e04da -- src/app/embed/gutachter-finder/_components/FinderMap.tsx` (+ `git show 1325e04da^:src/app/embed/gutachter-finder/_components/SvProfilePopup.tsx`). **Wiederherstellen, an den aktuellen Coverage-Stand angepasst** (Coverage-Fläche bleibt als Kontext, jetzt unioniert).
- Umlaute in UI-Strings. Token-Audit-Skip-Header in Mapbox-Files für raw-hex.

## Task 1: `@turf/union` + `unionIsochrones`-Util (TDD)
**Files:** `package.json` (dep) · Create `src/lib/mapbox/union-isochrones.ts` + `.test.ts`
**Interfaces:** `unionIsochrones(raws: unknown[]): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null` — geometrische Union aller (via `parseIsochrone` normalisierten) Isochronen; überlappende verschmelzen (kein innerer Rand), disjunkte bleiben getrennt (MultiPolygon). `null` bei 0 gültigen.
- [ ] Step 1: `npm install @turf/union` (+ ggf. `@turf/helpers`). Prüfe die installierte turf-Version + die `union`-API (turf 7: `union(featureCollection(...))`; turf 6: `union(f1, f2)`) — nutze die reale API.
- [ ] Step 2: Failing test `union-isochrones.test.ts`: zwei überlappende Quadrate → ein Feature ohne innere Kante (Vertices-Count < Summe, oder Flächen-Check); zwei disjunkte → MultiPolygon mit 2 Polygonen; `parseIsochrone`-Formate (Objekt `{lat,lng}[]`, `{coordinates}`) werden akzeptiert; leere/ungültige → `null`.
- [ ] Step 3: Implementieren: `raws.map(parseIsochrone).filter(gültig)` → zu `turf.polygon([ring])` (ring als `[lng,lat][]`, geschlossen — erstes==letztes; falls parseIsochrone offen liefert, schließen) → `reduce(turf.union)`. Rückgabe Feature oder null. Defensiv (turf wirft bei degenerierten Polygonen → try/catch, überspringe).
- [ ] Step 4: `npx vitest run src/lib/mapbox/union-isochrones.test.ts` grün · `npx tsc --noEmit --skipLibCheck`=0. Commit `feat(mapbox): unionIsochrones util (@turf/union, echte Fläche)`.

## Task 2: Dispatch-Karte — Union-Fläche
**Files:** `src/components/live-ops/geo.ts`, `src/components/live-ops/LiveOpsMap.tsx`
- [ ] Step 1: In `geo.ts` `unionIsochroneFC(svs)` (nutzt `unionIsochrones(svs.map(s => s.isochrone))`) → FeatureCollection mit dem einen Union-Feature (leer wenn null).
- [ ] Step 2: In `LiveOpsMap.tsx`: `SRC_ISOS` bekommt statt `isochroneFC` (per-SV) die `unionIsochroneFC` (Union). `LAYER_ISOS_FILL` unverändert (ein Fill). `LAYER_ISOS_LINE` zeichnet jetzt nur noch den Außen-Umriss der Union (kein inneres Chaos). Rebuild-Effekt (`SRC_ISOS.setData`) analog auf `unionIsochroneFC` umstellen. `TYP_COLOR_EXPR` (per-Typ-Farbe) entfällt für die Union (eine Farbe, z.B. `claimondo-ondo`/`#4573A2`) — Kommentar warum.
  - **Hinweis:** die Coverage-Gap-Berechnung (`computeCoverageGaps`, V2) nutzt weiterhin die **per-SV**-Isochronen (nicht die Union) — nur die DARSTELLUNG wird unioniert. Sicherstellen dass `computeCoverageGaps` unberührt bleibt.
- [ ] Step 3: tsc-skipLibCheck 0 · vitest (live-ops) grün · Ratchets 0 neu. Commit `feat(dispatch-cockpit): Isochronen als Union-Fläche (statt per-SV-Overlap)`.

## Task 3: Finder — Union-Coverage + Einzel-SV Route/Profil zurück
**Files:** `src/app/embed/gutachter-finder/_components/FinderMap.tsx` · Create `src/app/embed/gutachter-finder/_components/SvProfilePopup.tsx`
- [ ] Step 1: **`SvProfilePopup.tsx` wiederherstellen** — Inhalt aus `git show 1325e04da^:src/app/embed/gutachter-finder/_components/SvProfilePopup.tsx` (das gelöschte File) 1:1 zurückholen (Umlaute prüfen, an aktuelle `AktiverSVPublic`-Felder anpassen).
- [ ] Step 2: **Einzel-SV-Rendering wiederherstellen** in `FinderMap.tsx` (aus `git show 1325e04da` — der ENTFERNTE Code): `addClickableMarker` (Avatar-Marker Initiale), `openSvPopup`/`openDeadPinPopup` (Desktop-Popup + Mobil-Sheet), `routeToTarget` (`fetchDrivingRoute`, casing+line Layer, fitBounds), Highlight-CSS. **An den aktuellen Stand anpassen** (die Coverage-Layer BLEIBEN als Kontext).
- [ ] Step 3: **Verdrahtung wiederherstellen:** `handleEmbedOrt` ruft wieder `empfehleSvFuerOrt({lat,lng})` → bei `kind==='partner'`: `routeToTarget` + `openSvPopup`; `kind==='deadpin'`: Route + DeadPin-Popup; sonst `flyTo`. Den `claimondo:embed-sv-selected`-Event-Listener wieder registrieren (Wizard wählt SV → Karte routet).
- [ ] Step 4: **Coverage unionieren:** die `multi(partnerPolys)`-Source (`coverage-partners`) durch `unionIsochrones(partnerPolys-raws)` ersetzen → glatter Außen-Umriss (die `coverage-partners-outline`-Line zeigt dann nur die Union-Grenze). Dead-Pin-Heatmap unverändert.
- [ ] Step 5: `npx tsc --noEmit --skipLibCheck`=0 · `npm run build` grün (Finder ist Route-kritisch — Full-Build; bei EBUSY `rm -rf .next/standalone`+erneut) · Ratchets 0 neu. **7-Punkte-Audit** (Regression: der Coverage-Check `pointInAnyPolygon` + der Wizard-Flow bleiben intakt; Buchungs-Flow unberührt; Umlaute). Commit `feat(finder): Einzel-SV Route/Profil zurueck + Coverage als Union-Flaeche`.

## Abschluss
Finaler Whole-Branch-Review (opus) — Fokus: Finder-Regression (Buchungs-Flow, Coverage-Check, Anti-Skimming-Grenze = keine Kontaktdaten exponiert), Union-Korrektheit, Dispatch-Karte-Gaps unberührt. PR gegen staging. Post-Deploy-Smoke: Finder lädt, Ort-Eingabe → Route+Profil des SV, Coverage als eine Fläche.
