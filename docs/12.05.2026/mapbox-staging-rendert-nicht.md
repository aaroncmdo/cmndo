# Mapbox rendert nicht (gutachter-finden) — Debugging-Log

**Status:** ungelöst (Stand 2026-05-12)
**Betroffen:** `/gutachter-finden` auf `app.staging.claimondo.de` (und vermutlich Production — dort nie verifiziert)
**Datei:** `src/app/gutachter-finden/GutachterFinderMapClient.tsx`

## Symptom

Die Karte wird nicht angezeigt — statt der Mapbox-Tiles sieht man nur den
`--brand-surface-gradient`-Hintergrund des Containers. **Kein** gelbes
Diagnose-Banner, **kein** sichtbarer Fehler. Console zeigt (außer dem
inzwischen behobenen 3D-Buildings-Fehler) **keine** Mapbox-Fehler.

Hard-Refresh (Ctrl+Shift+R) ändert nichts. Network-Tab „zeigt nichts" für
Mapbox-Requests (laut Aaron).

## Was wir wissen

| Hypothese | Status | Begründung |
|---|---|---|
| Token fehlt im Build | ❌ ausgeschlossen | Kein „Karte nicht konfiguriert"-Banner → `ensureMapboxInitialized()` gibt `true` zurück → `NEXT_PUBLIC_MAPBOX_TOKEN` ist im Bundle |
| Token ungültig / 401 / 403 | ❌ ausgeschlossen | Kein „auth-error"-Banner → `map.on('error')` feuert keinen 401/403 |
| 3D-Buildings-Layer mit kaputten interpolate-Expressions killt den Render-Loop | ✅ behoben | Layer komplett entfernt (`fill-extrusion` mit nested-array stops war invalid) — half nicht |
| Style hängt im Netzwerk | ❌ unwahrscheinlich | 12s-Load-Timeout würde `mapStatus='timeout'` + Banner zeigen — Banner kommt nicht → `map.on('load')` feuert offenbar |
| Irgendein anderer Mapbox-Fehler | ❌ ausgeschlossen | `map.on('error')` fängt jetzt ALLE Fehler verbatim ab + zeigt sie im Banner — Banner kommt nicht |
| **0×0-Canvas** (Container hat beim `new mapboxgl.Map()` noch keine Maße) | 🔬 **aktueller Hauptverdacht** | Passt perfekt: `load` feuert (hängt nicht von Container-Größe ab) → kein Timeout-Banner; keine Fehler → kein error-Banner; aber Tiles werden in einen 0px-Canvas gerendert → man sieht nur den Gradient-Hintergrund. Bekanntes mapbox-gl-v3-Verhalten bei React-StrictMode-Double-Render / CSS-Timing |
| Deploy propagiert nicht (PM2 serviert alten Build) | ⚠️ nicht ausgeschlossen | Der „Map-Diagnose v2"-Deploy ist beim ersten Versuch an `ssh: handshake failed: EOF` gescheitert (kollidierte mit dem Production-Deploy auf demselben VPS), Re-Run war erfolgreich — aber ob PM2 den `claimondo-v2-staging`-Prozess wirklich sauber neu gestartet hat, ist nicht 100% verifiziert |

## Was wir probiert haben (chronologisch)

1. **Bundle-Fix:** Import von `@/lib/mapbox/client` statt `@/lib/mapbox`
   (Index-Datei re-exportiert THREE → `i.Color is not a constructor`-Crash).
   → behob den Crash, aber Karte rendert weiter nicht.
2. **3D-Buildings-Layer entfernt** — die `fill-extrusion-color`/`-height`
   interpolate-Expressions hatten nested-array stops → „Expected an even number
   of arguments" → Mapbox-Render-Loop bricht ab. → Fehler weg, Karte rendert
   trotzdem nicht.
3. **`--brand-surface-gradient` als Container-Background** — damit der leere
   Zustand wenigstens nicht weiß ist (kosmetisch, kein Fix).
4. **Map-Diagnose v1:** `map.on('error')` mit 401/403-Sonderfall →
   `mapStatus='auth-error'` / sonst `'error'`, Banner unten rechts.
   → kein Banner erscheint.
5. **Map-Diagnose v2:** `map.on('error')` fängt jetzt ALLE Fehler verbatim ab,
   plus 12s-Load-Timeout (`map.on('load')` nicht gefeuert → `mapStatus='timeout'`).
   → **immer noch kein Banner** („es kommt nichts").
6. **Map-Resize-Fix (aktuell):** gegen den 0×0-Canvas-Verdacht —
   `map.resize()` nach `requestAnimationFrame`, nochmal beim `load`-Event, plus
   ein `ResizeObserver` auf dem Container. Zusätzlich `console.info` mit den
   Container-Dimensionen beim Init und nach dem ersten Frame, damit wir endlich
   sehen ob der Container 0×0 ist. `antialias: true` entfernt (Verdacht: stilles
   WebGL-Antialiasing-Fail auf manchen Setups).

## Nächste Schritte falls Resize-Fix nicht hilft

- **Container-Dimensionen-Log prüfen** (`[gutachter-finden] Map-Container beim Init: W × H`):
  - `0 × …` oder `… × 0` → bestätigt 0×0-Canvas → Layout-Problem, Container
    braucht garantierte Maße bevor `new Map()` läuft (z.B. `useEffect` durch
    `useLayoutEffect` ersetzen, oder Container mit `requestAnimationFrame`-Gate).
  - Vernünftige Maße (z.B. `1280 × 720`) → 0×0-These ist tot, weiter zu WebGL.
- **WebGL-Check:** `map.painter?.context?.gl` nach `load` loggen — falls `null`,
  ist der WebGL-Context gescheitert (Browser/GPU-Blacklist, `--disable-gpu`,
  Headless). Fallback-UI ohne Karte zeigen.
- **CSP prüfen:** Hat nginx auf staging einen `Content-Security-Policy`-Header,
  der `https://api.mapbox.com` / `https://*.tiles.mapbox.com` / `worker-src blob:`
  blockt? `curl -sI https://staging.claimondo.de/gutachter-finden | grep -i content-security`.
  (Mapbox-GL braucht `worker-src blob:` und `child-src blob:` — fehlt das, lädt
  der Worker nicht und die Karte bleibt leer **ohne** Fehler-Event.)
- **Deploy verifizieren:** auf dem VPS `pm2 describe claimondo-v2-staging` →
  läuft der Prozess aus `/var/www/claimondo-v2-staging/` mit aktuellem Build?
  `pm2 logs claimondo-v2-staging --lines 50` auf Mapbox-Worker-Fehler scannen.
- **Production gegenchecken:** rendert die Karte auf `app.claimondo.de/gutachter-finden`?
  Falls ja → staging-spezifisch (CSP/nginx/Deploy). Falls nein → Code-Problem,
  betrifft beide.

## Relevante Code-Stellen

- `src/app/gutachter-finden/GutachterFinderMapClient.tsx` — Map-Init, Diagnose,
  Resize-Fix, Banner
- `src/lib/mapbox/client.ts` — `ensureMapboxInitialized()` (Token-Check)
- `src/lib/mapbox/index.ts` — re-exportiert THREE (NICHT von hier importieren im
  Client!)
- `.github/workflows/deploy-vps-staging.yml` — staging-Deploy, setzt
  `NEXT_PUBLIC_MAPBOX_TOKEN` beim Build
- GitHub Secret `NEXT_PUBLIC_MAPBOX_TOKEN` — Public-Token
  `pk.eyJ1IjoiYWFyb25zcHJhZmtlI…`
