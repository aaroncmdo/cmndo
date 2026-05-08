# HDR-Environment für Auto-Reflexionen

Drop hier ein `studio_1k.hdr`-File rein und das Auto bekommt automatisch
realistische Lack-Reflexionen vom Sky/Studio-Light.

## Quelle: Polyhaven (gratis, CC0)

1. Gehe zu https://polyhaven.com/hdris
2. Such z.B. „studio_small_03" oder „pretville_street" oder „kloofendal_43d_clear"
3. Download in 1K-Auflösung (~500 KB-1 MB) — höher ist Overkill für Web
4. Speichere als `public/hdr/studio_1k.hdr`
5. Reload Feldmodus → Three.js OBJ-Auto bekommt envMap

## Was passiert

`src/lib/mapbox/sv-car-3d-three.ts → tryAddSvCarThreeJs`
- Lädt `/hdr/studio_1k.hdr` via RGBELoader (lazy-import three/examples)
- Konvertiert zu EquirectangularReflectionMapping
- Setzt als `envMap` auf MeshStandardMaterial
- Auto rendert mit metallness 0.6 + roughness 0.35 + envMapIntensity 1.2

Ohne HDR-File: Auto rendert weiter, aber ohne Reflexionen (matt).

## Alternative: Mapbox Sky-Capture (Aufwendig, später)

Statt statischer HDRI könnte man die Mapbox-Sky-Atmosphere via
CubeCamera in Echtzeit zu envMap rendern → Auto reflektiert die
aktuelle Tageszeit (dawn/day/dusk/night) live. Ist aber Performance-
intensiv und braucht eigenen RenderTarget-Setup im Custom-Layer.
