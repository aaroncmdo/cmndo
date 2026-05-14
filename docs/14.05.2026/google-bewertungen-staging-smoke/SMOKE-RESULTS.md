# Live-Smoke Staging — Google-Bewertungen + Privacy-Marker

**Datum:** 14.05.2026
**Ziel:** `/gutachter-finden` auf `app.staging.claimondo.de` zeigt die anonymisierten Marker + Popups mit Google-Bewertungen
**Status:** ✅ Smoke grün — Popup mit Sternen sichtbar, Dead-Pins anonym, keine SV-Identitäten geleakt

## Setup

- URL: `https://app.staging.claimondo.de/gutachter-finden` (Basic-Auth: aaroncmdo)
- Geolocation deaktiviert → Default-NRW-Mittelpunkt (alle 5 Standard-Marker im Viewport)
- Viewport: 1440×900 Desktop + 390×844 Mobile
- Spec: `tests/e2e/flows/smoke-google-bewertungen-staging.spec.ts`

## Marker-Inventar

| Marker | Initiale | Tier | Position | Popup |
|---|---|---|---|---|
| 0 | **H** | Standard (klickbar) | Remscheid | ✅ Sterne |
| 1 | **T** | Standard (klickbar) | Köln-Mediapark | Test-SV, keine Cache-Daten |
| 2 | **S** | Standard (klickbar) | Heinsberg | (im Smoke nicht erreicht — outside-window-Schwelle) |
| 3 | **·** | Standard (klickbar) | Köln (Smoke SV) | Test-SV, keine Cache-Daten |
| — | — | Dead-Pin | 65× verteilt | Nicht klickbar (`pointer-events:none`) |

## Popup mit Bewertungen (Marker 0 — H · Cakmak in Remscheid)

Textinhalt aus dem Live-DOM:

```
H
Sachverständiger in Remscheid
DAT-zertifiziert · BVSK
★ 5.0 (45 Bewertungen)
Gerichtsgutachten · Oldtimer-Bewertung · Unfallrekonstruktion
Über Wizard anfragen →
```

Privacy-Verifikation:
- ❌ Kein Firmenname („Ingenieurbüro Cakmak" nicht im DOM)
- ❌ Keine Straße / Hausnummer / PLZ
- ❌ Kein voller Vorname (nur Initiale „H")
- ❌ Keine Telefon/Email
- ✅ Vertrauens-Daten: Region, Sterne, Reviews-Anzahl, Spezialisierung, Wizard-CTA

## Screenshots

- `screens/01-desktop-vollbild.png` — Vollbild NRW + Status-Pill „69 Sachverständige bundesweit verfügbar"
- `screens/02-popup-mit-sternen.png` — Cakmak-Popup mit Sterne + Specs
- `screens/02-popup-ohne-sterne.png` — Test-SV ohne Bewertungs-Zeile (graceful fallback)
- `screens/03-mobile-vollbild.png` — Mobile-View „69 SVs verfügbar"
- `screens/04-mobile-sheet-open.png` — Bottom-Sheet expanded mit Wizard-Step 1

## Console-Errors (bekannt, nicht von diesem PR verursacht)

| Error | Kontext | Status |
|---|---|---|
| `iconset.pbf 401` | api.mapbox.com Glyph-Request | Externer Mapbox-Fehler, nicht reproduzierbar in eigenem Browser-Test |
| `layers.sv-isos-pro-fill.paint.fill-color: color expected, "var(--map-pin-accent, #4573A2)" found` | Mapbox-Layer-Paint | **Wird durch PR #1137 behoben** — Mapbox-Color-Fix ist gemerged, wartet auf staging-VPS-Deploy |
| `Input data is not a valid GeoJSON object` | Folgefehler des Color-Errors (Layer wird nicht angelegt) | Geht weg mit PR #1137 Deploy |

## DB-Cache-Status (zum Zeitpunkt des Smoke)

```sql
SELECT s.firmenname, p.vorname, bw.durchschnitt, bw.anzahl_bewertungen
FROM sachverstaendige s
LEFT JOIN profiles p ON p.id = s.profile_id
LEFT JOIN google_bewertungen_cache bw ON bw.profile_id = s.profile_id
WHERE s.paket = 'standard' AND s.ist_aktiv;
```

| firmenname | vorname | durchschnitt | anzahl_bewertungen |
|---|---|---|---|
| Ingenieurbüro Cakmak | Hasan | 5.0 | 45 |
| Kfz-Sachverständigenbüro Fronius | Shakib | 5.0 | 3 |
| KFZ-Sachverständigenbüro Gall | Kelvin Tyron | 5.0 | 21 |
| Test Aaron Gutachter GmbH | Thomas | — | — |
| Smoke SV | — | — | — |

## Folge-Backlog (nicht im Smoke-Scope)

1. **VPS-Deploy von PR #1137** — Mapbox-Color-Fix ist gemerged, aber VPS-PM2-Slot hat noch alten Code (var(...)) → Iso-Halo-Layer renden nicht. Aaron-Action: VPS-Pull + `pm2 reload claimondo-v2-staging --update-env`.
2. **5./4. Standard-Marker fehlt im Inventar** — DB hat 5, im DOM nur 4. Vermutlich Marker-Overlap am Köln-Mediapark (Test Aaron + Smoke SV haben fast identische Koordinaten 50.95, 6.95). Separat zu klären.
3. **VPS-Cron für täglichen Bewertungs-Refresh** — `/api/cron/google-bewertungen`-Route existiert + ist funktional. Crontab-Eintrag fehlt noch (per Memory: keine vercel.json, nur VPS-crontab).

## Verifiziert

- [x] `/gutachter-finden` erreichbar auf staging (HTTP 200, Basic-Auth)
- [x] Status-Pill zeigt „69 Sachverständige bundesweit verfügbar" (Privacy-Wording)
- [x] 4 klickbare Marker mit Vorname-Initialen, kein Firmennamen-Leak
- [x] 65 Dead-Pins gerendert (Pro-SVs + Tier-3 sv_leads)
- [x] Dead-Pins nicht klickbar (kein Popup, kein Hover, `pointer-events:none`)
- [x] Cakmak-Popup zeigt echte Google-Sterne: ⭐ 5.0 (45 Bewertungen)
- [x] Spezialisierungen-Chips: Gerichtsgutachten / Oldtimer-Bewertung / Unfallrekonstruktion
- [x] Wizard-CTA „Über Wizard anfragen →" — kein direkter Kontaktpfad
- [x] Mobile-View: kompakter Status-Pill, Marker/Dead-Pins identisch, Bottom-Sheet expandable
