# Porsche-Modell für SV-Auto einbauen

Das aus `docs/integrations/MODELS/uploads_files_3792421_Porsche911CarreraGTS_OBJ.zip` ist
**498 MB OBJ + 14 KB MTL**. Das ist zu groß für direktes Web-Loading
(Vercel-Deploy-Limit 50 MB/file, Browser-Memory ~5 GB).

Du musst **vorher decimieren**. Schritt-für-Schritt:

## Option A — Blender (empfohlen, gratis)

1. Blender installieren: https://www.blender.org (3.6+)
2. Datei öffnen:
   - `File → Import → Wavefront (.obj)`
   - Wähle die entzippte `Porsche911CarreraGTS.obj`
3. **Decimate Modifier** (Polygon-Anzahl reduzieren):
   - Object selektieren (klicken)
   - Tab `Modifiers` (Schraubenschlüssel-Icon)
   - `Add Modifier → Decimate`
   - Type: `Collapse`, Ratio: `0.05` (entspricht 5 % der Original-Polygone, sollte reichen)
   - Apply (Dropdown-Pfeil → Apply)
4. **Skalieren** (OBJs sind oft in cm/inches, wir wollen Meter):
   - `N` drücken → Sidebar öffnen
   - Object-Properties → Dimensions: höchste Achse (Länge) sollte ~4.5 m sein
   - Falls in cm: Scale 0.01 anwenden, Apply (Ctrl+A → Scale)
5. **Export als glb** (oder OBJ wenn du erst testen willst):
   - `File → Export → glTF 2.0 (.glb/.gltf)`
   - Format: `glTF Binary (.glb)`
   - Compression: ✓ Draco mesh compression
   - Save als `public/3d/sv-car.glb` (überschreibt das alte)
   - Ziel-Größe: 1-3 MB

## Option B — Online (für quick test mit OBJ-Pfad)

Falls du erst nur das OBJ testen willst ohne Blender:

1. Online-Decimator: https://www.poly.io oder https://anyconv.com/obj-to-obj-converter
2. Upload `Porsche911CarreraGTS.obj` (kann je nach Service nicht reichen bei 498 MB)
3. Decimate auf 5 %
4. Download als `porsche-decimated.obj`
5. Datei nach `public/3d/porsche.obj` kopieren
6. ENV-Variable setzen:
   ```
   NEXT_PUBLIC_SV_CAR_OBJ_URL=/3d/porsche.obj
   ```
   (in `.env.local` für lokal, in Vercel-Project-Settings für Prod)
7. Re-build / Page-Reload → Three.js OBJLoader-Pfad wird aktiviert,
   das Porsche-OBJ ersetzt das alte Mapbox-glb.

## Was läuft im Hintergrund

- **Mapbox-Pfad** (default): `public/3d/sv-car.glb` via Mapbox-`model`-Layer.
  Schnellste Render-Performance, native PBR.
- **Three.js-Pfad** (mit ENV-Flag): `public/3d/porsche.obj` via custom Layer
  + `OBJLoader.js`. Volle Material-Kontrolle, aber ~30 % langsamer.

Empfehlung langfristig: **glb-Pfad**. OBJ ist zum Testen bequem, aber
glb hat Draco-Compression (10× kleiner) und PBR-Materials nativ.

## Wenn etwas nicht passt

- Auto zu klein/groß → Scale in Blender anpassen, neu exportieren
- Falsche Front-Richtung → Rotate 90° um Y-Achse, Apply, neu exportieren
- Kein Material sichtbar → MTL fehlt, Three.js fällt auf Default-Lack zurück (Claimondo-Navy)

Optional: Nach dem ersten Erfolg-Test können wir noch:
- Reflection-Probe vom Mapbox-Sky → echte Lack-Reflexionen
- Rad-Animation bei Bewegung
- LOD (Level-of-Detail) — high-poly bei Zoom > 18, low-poly bei Zoom < 16
