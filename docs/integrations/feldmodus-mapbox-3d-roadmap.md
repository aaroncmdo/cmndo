# Feldmodus 3D-Map — Hyperrealistic-Roadmap

**Datum:** 2026-05-07
**Owner:** Aaron / Claude
**Scope:** `/gutachter/feldmodus` — der Outdoor-Navigationsmodus den der SV beim Termin-Anfahrt sieht.

## Ziel

Den Fokus-Modus auf ein Premium-Outdoor-Navigationserlebnis heben — vergleichbar zu modernen Auto-OEM-Apps (Mercedes MBUX, Tesla, Apple Maps Detailed City) — **ohne** eigene 3D-Asset-Pipeline oder Server-seitiges Pixel-Streaming.

Cross-Plattform: Web-First, später React Native (`@rnmapbox/maps` + `@react-three/fiber/native`) — daher Stack-Wahl auf maximales Code-Sharing.

## Status-Quo (Stand 2026-05-07)

`FeldmodusMap.tsx` nutzt bereits:
- Mapbox GL JS v3.22 mit `mapbox://styles/mapbox/standard`
- Uhrzeitabhängiger `lightPreset` (`dawn`/`day`/`dusk`/`night`) — alle 5 Min refreshed
- `show3dObjects: true` — Mapbox-Standard-Buildings + Bäume
- 3D-Auto-Modell-Load-Versuch (GLB) mit Fallback auf 2D-SVG-Marker

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

### Phase 3 — Photorealistic Tiles + Wet-Roads (Optional)

**Aufwand:** 3-5 Tage. **Effekt:** echte Mesh-Daten in Großstädten, Wetter-Reaktivität.

**Komponenten:**
- **Google Photorealistic 3D Tiles** als zusätzlicher Layer-Source. Cost-Modell: ~$10/1000 Tile-Requests (Google Maps Platform Tier). Aaron-Decision nötig vor Launch.
- **Custom-Shader** für Roads bei Regen-Wetter (Wet-Look, Reflections). Wetter-Daten sind bereits via `WeatherBanner.tsx` verfügbar.
- **Time-of-Day-Sync mit Termin-Slot**: `lightPreset` aus `gutachter_termine.start_zeit` ableiten statt nur Wall-Clock.

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
