# Feldmodus 3D-Map — Hyperrealistic-Roadmap

**Datum:** 2026-05-07
**Owner:** Aaron / Claude
**Scope:** `/gutachter/feldmodus` — der Outdoor-Navigationsmodus den der SV beim Termin-Anfahrt sieht.

## Ziel

Den Fokus-Modus auf ein Premium-Outdoor-Navigationserlebnis heben — vergleichbar zu modernen Auto-OEM-Apps (Mercedes MBUX, Tesla, Apple Maps Detailed City) — **ohne** eigene 3D-Asset-Pipeline oder Server-seitiges Pixel-Streaming.

Cross-Plattform: Web-First, später React Native (`@rnmapbox/maps` + `@react-three/fiber/native`) — daher Stack-Wahl auf maximales Code-Sharing.

## Status-Quo (Stand 2026-05-07, nach 4 PRs)

**Phase 1 ✅ gemerged (PR #586):** Atmosphäre + Terrain
- `setFog(...)` mit claimondo-Navy Space-Color
- `setTerrain({ source: mapbox-dem, exaggeration: 1.2 })`
- POI/Transit-Labels aus, Road-Labels an
- Plus Layout: Map full-bleed + Glass-Overlays statt Sidebar

**Phase 2 ✅ gemerged (PR #589):** Hero-Pin 3D-Glow
- `attachHeroPin3d(map, lngLat)` — Mapbox-Native CustomLayer mit Three.js
- Pulsierende emissive Sphere + transparente Halo
- claimondo-light-blue glüht, folgt Stop-Wechsel
- R3F-Deps installiert für Phase 4 (Showrooms)

**Phase 3 ✅ gemerged (PR #590):** Time-of-Day-Sync mit Termin-Slot
- `lightPreset` folgt `aktuellerStop.start_zeit` statt Wall-Clock
- Fog-Tinting passend zum Preset (dawn/dusk warm, night dunkel mit Sternen)
- `getMapboxLightPreset(at?: Date)` Helper

**Phase 3b ✅ gemerged (PR #591):** Wetter-reaktive Atmosphäre
- `/api/weather`-Fetch beim Stop-Wechsel
- `applyWeatherToFog(base, weatherId)` — Modifier auf Tageszeit
- Regen → grauer dichter Fog, Schnee → Blauschimmer, Nebel → MAX horizon-blend, Bewölkt → Grau-Tint

`FeldmodusMap.tsx` Setup:
- Mapbox GL JS v3.22 mit `mapbox://styles/mapbox/standard`
- Light + Fog + Terrain reagieren auf Termin-Zeit + Wetter
- 3D-Auto-Modell-Load (GLB) mit Fallback auf 2D-SVG-Marker
- Hero-Pin via Custom-Layer (Three.js direkt)

## Roadmap

### Phase 1 — Atmosphäre & Tiefe (Quick-Win, 0 neue Dependencies)

**Aufwand:** ~1 h. **Effekt:** Sofort spürbar mehr Tiefe und Premium-Feel.

- `map.setFog({...})` mit claimondo-Navy Space-Color für Horizon-Tiefe
- `map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 })` — globale Höhendaten für hügelige Anfahrtsstrecken
- `setConfigProperty('basemap', 'showPointOfInterestLabels', false)` — aufgeräumter Fokus
- `setConfigProperty('basemap', 'showRoadLabels', true)` — Straßennamen bleiben sichtbar (Orientierung)
- Optionale Sky-Layer mit Atmosphere-Tint passend zum lightPreset

**Risiken:** keine. Alle Properties sind in Mapbox Standard v3 unterstützt. Performance unverändert (Fog/Terrain sind GPU-beschleunigt).

### Phase 2 — Premium-Marker via R3F Custom-Layer

**Aufwand:** 2-3 Tage. **Effekt:** „Tron"-Style Hero-Marker, Premium-Wow-Faktor.

**Stack:**
- `@react-three/fiber` + `@react-three/drei`
- `@react-three/postprocessing`
- `three`

**Konzept:**
- R3F-Canvas wird über die Mapbox-Karte gelegt (`pointer-events: none`)
- Mapbox-Camera-Matrix wird per `customLayerMatrix()` an Three.js durchgereicht (Sync via `useFrame`)
- Hero-Marker = `MeshPhysicalMaterial` mit `transmission: 0.9`, `emissive: claimondo-light-blue`, `emissiveIntensity: 1.5`
- HDRI-Environment für Reflexionen am Pin (Mapbox-Sky könnte IBL-Source sein)
- Post-Processing-Pipeline:
  - `Bloom` (luminanceThreshold ~1.0, intensity 0.5)
  - `ToneMapping` (ACES Filmic)
  - `Vignette` (subtil, offset 0.1)
  - `SSAO` nur Web — auf Mobile aus

**Cross-Plattform:** `@react-three/fiber/native` läuft auf React Native fast 1:1. Effekt-Composer wird per `Platform.OS`-Check reduziert.

**Risiken:**
- Custom-Layer-Performance bei vielen Markern → Lösung: nur SV-Hero und Ziel-Pin in R3F, restliche Marker bleiben als HTML-Marker.
- Camera-Sync-Drift bei schnellen Map-Movements → bekanntes R3F-Mapbox-Pattern, in der Praxis stable.

### Phase 3 — Time-of-Day + Wetter ✅ GEMERGED (PR #590, #591)

Time-of-Day-Sync mit Termin-Slot + Wetter-Atmosphäre durch. Ohne Custom-Shader-Komplexität, voll auf Mapbox-Standard-Properties + Fog-Modifier.

### Phase 4 — Photorealistic 3D Tiles (Optional, braucht Cost-Approval)

**Aufwand:** 2-3 Tage. **Effekt:** echte Mesh-Daten in Großstädten, fotorealistische Fassaden.

- **Google Photorealistic 3D Tiles** als zusätzlicher Layer-Source via Mapbox 3D-Tiles-Layer-API (Mapbox v3 unterstützt externe 3D-Tiles).
- Cost-Modell: ~$10/1000 Tile-Requests (Google Maps Platform Tier).
- **Aaron-Decision nötig vor Aktivierung** — Cost-Burn pro SV-Termin schwer zu modellieren ohne Production-Daten.
- Code-Stub kann angelegt werden, Activation hinter Feature-Flag.

### Phase 5 — Custom-Shader (zurückgestellt)

Wet-Roads-Shader kommt zurück sobald reine Atmosphäre-Reaktivität (3b) nicht mehr reicht. Aufwand: ~3-5 Tage. Aktueller Stand: 3b deckt 90% des „Wow"-Effekts ab, Custom-Shader gibt ~10% mehr.

### Was nicht empfohlen wird

| Option | Warum nicht |
|---|---|
| **Pixel Streaming (Unreal)** | 1 GPU-Instanz pro aktivem Nutzer = absurde Cost bei SV-Größenordnung. Latency-Abhängig. Kein Cross-Plattform-Win. |
| **Threebox** | Weniger maintained als R3F. Kein React-Native-Pfad. R3F-Ökosystem ist die Cross-Plattform-Wahl. |
| **Eigene High-Poly-Asset-Pipeline** | Aaron will keine eigenen Assets. Mapbox Standard + Google Tiles liefern den Look ohne Modeling-Aufwand. |

## Entscheidungs-Reihenfolge

1. **Jetzt sofort:** Phase 1 (1 h, kein Risiko)
2. **Wenn Phase 1 spürbar wirkt:** Phase 2 (2-3 Tage, kein Server-Kostenrisiko)
3. **Bei Bedarf für Demo/Großstädte:** Phase 3 mit Google-Tiles-Cost-Modell vorab geklärt

## Dateien betroffen

### Phase 1
- `src/app/gutachter/feldmodus/FeldmodusMap.tsx` — Fog/Terrain/Label-Config
- `src/app/gutachter/heute/TagesrouteMap.tsx` — analog (gleiche Karte für Tagesplan-Übersicht)

### Phase 2
- `src/app/gutachter/feldmodus/FeldmodusR3FLayer.tsx` (neu) — Three.js-Layer-Wrapper
- `src/app/gutachter/feldmodus/HeroMarker.tsx` (neu) — emissive Glas-Pin
- `src/app/gutachter/feldmodus/FeldmodusMap.tsx` — R3F-Layer-Mount-Punkt
- `package.json` — neue Deps

### Phase 3
- `src/lib/maps/google-3d-tiles.ts` (neu) — Tile-Source-Konfiguration
- Wetter-Hook + Shader-Datei
