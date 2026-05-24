# Doc 34 Phase 0b.3 — Stadt-OG mit Mini-Karte + Karte-API `?lat&lng`

**Datum:** 2026-05-24 · **Branch:** `kitta/doc34-phase-0b3-stadt-og` (off staging, nach #1634-Merge) · **PR:** gegen `staging`
**Kontext:** Brücken-Sprint Doc 34, Task 0b.3. Aaron-Entscheid: die Karte-API um `?lat&lng` erweitern (statt `plzBeispiel`-Feld in `staedte.ts`), da `STAEDTE` `lat`/`lng` direkt hat aber nur `plzPrefix` als Range.

## Was gebaut

### 1 — Karte-API `?lat&lng`-Erweiterung (`src/app/api/v1/karte/[plz]/route.ts`)
- `?lat=&lng=` überschreibt die PLZ-Geocodierung. Das Segment ist dann nur ein Label (Slug) für Filename/Cache. Beispiel: `/api/v1/karte/koeln.png?lat=50.9413&lng=6.9583`.
- **DE-Bounding-Box-Guard** (lat 47–56, lng 5–16) → 400 bei Welt-Koordinaten (Mapbox-Cost-Schutz).
- Cache-Key getrennt (`geo:lat,lng` vs `plz:NNNNN`). PLZ-Pfad unverändert (Regression-safe).
- Reusable für künftige Caller (MCP/Doc 33, Stadt-OG).

### 2 — Stadt-OG (`src/app/kfz-gutachter/[stadt]/opengraph-image.tsx`, NEU)
- Beim Teilen von `/kfz-gutachter/<stadt>` (WhatsApp/LinkedIn/Slack/Twitter): gebrandete Preview mit Stadt-Name + 3 USPs + Live-SV-Karte (rechtes Panel).
- Karte via `?lat&lng`-API (Stadt-Koordinaten aus `getStadtBySlug`). **Selbst gefetcht → data-URI im try/catch** — ein Fehler (Karte-API noch nicht deployed/Timeout) bricht die OG NICHT; dann Fallback = gebrandete Card ohne Map-Panel (satori `<img>` mit kaputtem src würde sonst werfen).
- `runtime='nodejs'` + `dynamic='force-dynamic'` → kein Build-Zeit-Prerender für ~40 Städte (= keine 40 prod-Fetches beim Build), Render erst beim Crawl.
- Token-Audit-Skip-Header (next/og inline-only).

## Verifikation
- `tsc --noEmit`: **exit 0**.
- `npm run build`: **grün** (BUILD_ID, OG- + Route-Artefakt). *(Lesson: `… | head -N` löste SIGPIPE aus und killte den ersten Build vor BUILD_ID — Build-Output nie durch `head` pipen.)*
- Runtime-Smoke (Port 3073):
  - `/api/v1/karte/koeln.png?lat=50.9413&lng=6.9583` → **200 image/png** (466 KB); **visuell verifiziert**: zentriert auf Köln, Center-Pin + SV-Marker — identisch zur PLZ-Variante.
  - DE-bbox-Guard `lat=0&lng=0` → **400**.
  - PLZ-Regression `/api/v1/karte/50670.png` → **200** (unverändert).
  - `/kfz-gutachter/koeln/opengraph-image` → **200 image/png** (68 KB); **visuell verifiziert**: Navy-Gradient, Brand-Eyebrow, „Kfz-Gutachter in Köln" (Umlaut korrekt), 3 USP-Bullets (€/Umlaute sauber), Footer. Fallback-Layout (ohne Map-Panel) korrekt, da `SITE_URL`=prod die Route noch nicht hat. `/kfz-gutachter/berlin/opengraph-image` → 200.

## 7-Punkte-Audit
- **Build:** grün (tsc 0 + next build, beide Artefakte).
- **UI-Erreichbarkeit:** OG wird von Next automatisch als `og:image` der Stadt-Pages injiziert; Karte-API public (`/api` in isPublicPath).
- **Redundanz:** `getStadtBySlug`/`STAEDTE`/`SITE_URL` wiederverwendet; Karte-API erweitert statt OG-eigene Mapbox-Logik zu duplizieren (= Aarons Reuse-Entscheid).
- **Dead-Code:** keiner; Smoke-PNGs entfernt.
- **Spec-Treue:** Doc 34 0b.3 erfüllt; Map-via-`?lat&lng` (Aaron-Entscheid) statt `plzBeispiel`.
- **Inkonsistenz:** Claimondo-Farben (NAVY/ONDO/LIGHT) + Token-Audit-Skip; satori-safe (display:flex überall, Dot-Bullets statt Glyph für Font-Sicherheit).
- **Regression:** PLZ-Pfad der Karte-API unverändert (Smoke 200); OG ist neue Datei. **Hinweis:** Map-Panel der OG erscheint erst, wenn die Karte-Route auf **prod** ist (aktuell nur staging); bis dahin greift der Fallback (Branded-Card ohne Panel) — kein Bruch.

## Offen (Phase 0b Rest)
- **0b.2 ChatGPT Custom GPT** — braucht Aarons ChatGPT-Team-Account + OpenAPI-Spec aus `/api/v1/sv-in-naehe` (#1637).
- **0b.4 `/sv?plz=`-Short-URL** — `/sv` kollidiert mit `proxy.ts` APP_PREFIXES.
- **llms.txt JSON-API-Mention** — Mini-Follow-up nach Merge von #1637.
