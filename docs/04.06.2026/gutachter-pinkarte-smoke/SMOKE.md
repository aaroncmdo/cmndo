# Smoke — gutachter-partner Pin-Karte (2026-06-04)

Branch `kitta/gutachter-partner-pinkarte`. Lokaler Marketing-Dev-Server (`:3010`), Playwright (aus claimondo-v2-node_modules).

## Ergebnis: GRÜN (alle Kriterien)

| Kriterium | Ergebnis |
|---|---|
| Pins rendern | ✅ 62 Pins (= DB-Count offener Cold-Leads, NRW-Cluster) |
| Pin-Klick → Standort-Vorbefüllung | ✅ Reverse-Geocode-PLZ `50126` ins Suchfeld + Karte zentriert + Radius (Marker 62→63) |
| PLZ-Eingabe → Karte | ✅ `42103` getippt → Karte zieht nach (Radius-Marker) |
| Kein PII-Leak | ✅ 0 PII-Treffer in POST-Responses (Pin-Action liefert nur id/lat/lng) |
| Build / Typecheck | ✅ `npm run build` + `tsc --noEmit` grün |
| Console-Errors | ✅ 0 |
| Claim-Flow statt Warteliste | ✅ „Finde deinen Eintrag" (SvClaimClient) rendert |

## Test-Artefakt (analysiert, kein Code-Bug)

Der erste Smoke meldete ein leeres Suchfeld nach Pin-Klick. **Ursache = Test, nicht Code:** Playwright-`force-click` auf `.mapboxgl-marker:first` traf einen bei Zoom 5.5 **außerhalb des 360px-Viewports** positionierten Pin → es feuerte kein echter DOM-Klick. Ein JS-dispatch-Klick (identisch zum Klick eines Users auf einen sichtbaren Pin) treibt die volle Kette:
```
[pin-debug] click 50.947063 6.62375
[pin-debug] reverse plz= 50126
JS_CLICK before=62 afterClick=63 search="50126"
```
Das temporäre Debug-`console.log` wurde danach wieder entfernt (Working-Tree clean vs. Commit `e4320b981`).

## Screenshots
- `01-pins.png` — Claim-Flow + Pins auf der Karte
- `02-pin-click-prefill.png` — nach Pin-Klick: Karte zentriert + Radius
- `03-plz-type-map.png` — nach PLZ-Eingabe: Karte nachgezogen

## Deploy
`:3006`-Deploy = Aaron (kein CI). Ein Deploy bringt **zusätzlich** den schon-auf-main-gemergten Claim-Flow live (Live-`:3006` war ein veralteter Warteliste-Build).
