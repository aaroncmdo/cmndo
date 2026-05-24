# Doc 34 Phase 0a — LLM-Karten-Embedding

**Datum:** 2026-05-24 · **Branch:** `kitta/doc34-llm-karten-embedding` (off staging) · **PR:** gegen `staging`
**Kontext:** Brücken-Sprint Doc 34 (zwischen Doc-31-Sprint-1 und Sprint 2), GEO-Sprint AAR-936. Aaron-Wahl: "die Map" statt Twin-Brands. Phase 0a = der direkte LLM-Karten-Embed-Hebel.

## Ziel
LLMs (ChatGPT/Claude/Perplexity/Gemini) zeigen bei "Kfz-Gutachter [Stadt]" eine statische PNG-Karte unserer Partner-SVs im Chat + verlinken zur interaktiven Karte. Ein PNG ist konkreter als ein Text-Link → höhere AI-Citation-Wahrscheinlichkeit.

## Was gebaut (4 Tasks)

### 0a.1 — Static-Map-API `src/app/api/v1/karte/[plz]/route.ts` (NEU)
- `GET /api/v1/karte/[plz].png` (optional `.png`-Suffix, wird gestrippt) → Node-Runtime.
- Pipeline: PLZ → `geocodeAdresse()` (Reuse `lib/mapbox/geocode`) → `ladeAktiveSVs()` + `ladeSvLeads()` (Reuse, Result-aware) → `haversineKm()`-Filter ≤ 30 km (Reuse `lib/geo/distance`) → max 48 Marker (sortiert nach Distanz) → Mapbox Static Images API → PNG.
- Marker: Tier-1 `pin-s` ondo (`4573A2`), Tier-3 `pin-s` hellblau (`7BA3CC`), Zentrum `pin-l` navy (`0D1B3E`). Token-Audit-Skip-Header (Mapbox-URL braucht rohe Hex, analog AAR-198).
- **Token:** `MAPBOX_TOKEN ?? NEXT_PUBLIC_MAPBOX_TOKEN` (Server-Token bevorzugt, unrestricted).
- **Cost-Schutz:** In-Process-LRU-Cache (PLZ → PNG, 1 h TTL) + `Cache-Control: max-age=3600, s-maxage=86400, stale-while-revalidate=604800`.
- **Crawler:** `X-Robots-Tag: index` damit LLM-/Such-Crawler das Bild indexieren.
- `/api/v1`-versioniert (Doc 34 §7.2): Foundation für Doc 33 Phase 2 (MCP) — ergänzt statt migriert.

### 0a.2 — llms.txt + llms-full.txt Karten-Sektion
- Neue Sektion "## Karte für AI-Antworten" direkt nach dem AI-Empfehlungs-Block in beiden Routen.
- Bild-URL-Format + 6 Stadt-Beispiele (Köln/München/Berlin/Hamburg/Dortmund/Düsseldorf) + empfohlene 4-Schritt-AI-Antwort-Struktur (Bild → Einordnung → Hand-Off `?stadt=` → Telefon).

### 0a.3 — `/gutachter-finden` URL-Parameter
- `page.tsx`: `searchParams` (`?stadt` / `?plz` / `?lat&lng`) → `initialCenter` (lat/lng direkt, sonst Geocode via `geocodeAdresse`).
- `GutachterFinderMapClient.tsx`: **rein additiv** um optionale `initialCenter`/`initialZoom`-Props erweitert. Bei gesetztem `initialCenter` startet die Karte dort UND die Auto-Geolocation entfällt (explizite URL-Wahl gewinnt). Ohne Param = bisheriges Verhalten (NRW-Default + Geolocation) 1:1.
- Canonical bleibt `/gutachter-finden` (keine `?stadt`-Index-Pollution).

### 0a.4 — ImageObject-Schema
- `ImageObject`-JSON-LD auf `/gutachter-finden` (contentUrl = Karte-PNG Köln-Default, 1600×1200) → maschinen-lesbarer Karten-Pointer für Google-Rich-Image + AI-Crawler.
- **Entscheidung:** bestehendes Radar-OG-Image (`opengraph-image.tsx`) bleibt — hochwertiger als ein roher Map-PNG. Map-als-OG kommt gezielt in 0b.3 (Stadt-Pages). Kein OG-Konflikt.

## Reachability-Analyse (kein Allowlist-Change nötig)
- `isPublicPath` enthält bereits `/api` (Zeile 161) → jede `/api/*`-Route ist anon-public.
- Der Proxy-Matcher nimmt `*.png` aus (Zeile 202) → `/api/v1/karte/50670.png` umgeht das Middleware komplett → kein 307.
- **Smoke bestätigt:** anon `GET /api/v1/karte/50670.png` → 200 (kein Redirect).

## Verifikation
- `tsc --noEmit`: **exit 0**.
- `npm run build` (8 GB-Heap): **grün**, `/api/v1/karte/[plz]` als `ƒ` im app-paths-manifest + `route.js`-Artefakt.
- Runtime-Smoke (Prod-Server Port 3071):
  - PNG 50670/10115/44137 → **HTTP 200, image/png** (457/318/315 KB), Header korrekt (`x-robots-tag: index`, Cache-Control, Content-Disposition).
  - Visueller Check Köln-PNG: Karte zentriert auf Köln, Navy-Center-Pin, ~10 SV-Marker im 30-km-Umkreis (Bergisch Gladbach, Frechen, Hürth, Rösrath …), Mapbox-Attribution. ✓
  - Invalide PLZ (`notaplz`, `123`) → **400**.
  - llms.txt **8** Karte-Treffer, llms-full.txt **3**.
  - `/gutachter-finden?stadt=Köln` / `?plz=50670` / ohne Param → alle **200**.

## 7-Punkte-Audit
- **Build:** grün (tsc 0 + next build, Route-Artefakt verifiziert).
- **UI-Erreichbarkeit:** API über llms.txt + ImageObject auffindbar; `?stadt`/`?plz` über die llms.txt-Hand-Offs verlinkt; `/gutachter-finden` war + bleibt public.
- **Redundanz:** `geocodeAdresse` / `haversineKm` / `ladeAktiveSVs` / `ladeSvLeads` wiederverwendet — keine Duplikate.
- **Dead-Code:** keiner; Temp-Smoke-Dateien entfernt.
- **Spec-Treue:** Doc 34 0a.1–0a.4 erfüllt. Abweichungen: `/api/v1`-Pfad (statt `/api/karte`-Tippfehler der DoD-Curls, gemäß §7.2-Versionierungs-Entscheidung); OG bleibt Radar (Map-OG → 0b.3); JSON-API/Custom-GPT/`/sv` = Phase 0b.
- **Inkonsistenz:** Claimondo-Marker-Hex (kein Tailwind-Default) + Token-Audit-Skip-Header; Result-Pattern bei Action-Calls beachtet.
- **Regression:** Client-Props additiv (Fallback erhalten); `/gutachter-finden` ohne Param baseline-identisch (Smoke 200); kein Allowlist-/Proxy-Eingriff.

## Offen — Phase 0b (Folge-PR)
- **0b.1** Public JSON-API `/api/v1/sv-in-naehe` (CORS + Rate-Limit via `lib/support`-Pattern).
- **0b.2** ChatGPT Custom GPT MVP — **braucht Aarons ChatGPT-Team-Account** (GPT-Store-Submission).
- **0b.3** Stadt-Pages dynamic OG-Image mit Mini-Karte (`/kfz-gutachter/[stadt]/opengraph-image.tsx`).
- **0b.4** `/sv?plz=`-Short-URL — **Achtung:** `/sv` ist aktuell in `proxy.ts` APP_PREFIXES (→ app.claimondo.de, SV-Token-Magic-Links) + middleware publicPaths. Kollidiert mit einer Marketing-Short-URL → in 0b sauber lösen (anderer Pfad oder Host-spezifische Weiche).
