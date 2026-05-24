# Doc 34 Phase 0b.1 — Public JSON-API `/api/v1/sv-in-naehe`

**Datum:** 2026-05-24 · **Branch:** `kitta/doc34-phase-0b` (off staging) · **PR:** gegen `staging`
**Kontext:** Brücken-Sprint Doc 34, Folge auf Phase 0a (PR #1634). Scope dieses PRs: **nur Task 0b.1** (JSON-API). Bewusst eigenständig off staging gebranch (kein Shared-File-Edit) → mergt konfliktfrei unabhängig von #1634.

## Was gebaut

### 0b.1 — `GET /api/v1/sv-in-naehe?plz=50670&radius=30` (NEU)
Anonyme Public-JSON-API für LLM-/Custom-GPT-Konsum (LLMs ohne Vision + ChatGPT-Actions).
- Pipeline wie 0a.1: PLZ → `geocodeAdresse` → `ladeAktiveSVs`/`ladeSvLeads` → `haversineKm`-Filter ≤ radius → sortiert nach Distanz, max 50.
- **Payload:** `plz`, `radius_km`, `center`, `anzahl_treffer`, `sv_liste[]`, `karte_url` (→ 0a.1 PNG), `interaktive_karte_url` (→ `/gutachter-finden?plz=`), `buchungs_telefon`, `_meta` (Quelle/Stand/§-249-Hinweis/Kontakt).
- **Privacy** (identisch zur Marketing-Karte): Tier-1 nur bei `paket='standard'` mit Stadt/Initiale/Specs/Bewertung (Loader nullt den Rest); Tier-3 nur `tier` + `entfernung_km` (kein id, keine Identität).
- **CORS:** `Access-Control-Allow-Origin: *` + `OPTIONS`-Preflight (204) → ChatGPT-Plugin/Action-fähig.
- **Rate-Limit:** In-Process-IP-Limiter (60 req/min/IP, Sliding-Window, opportunistisches Cleanup). **Bewusst NICHT** `lib/support/rate-limit.ts` — das ist user-id-+DB-basiert (Supabase-Write pro Check) und ungeeignet für einen anonymen, heißen public Endpoint. In-Memory = kein DB-Cost (PM2-Single-Process).
- `Cache-Control: max-age=300, s-maxage=600`. Node-Runtime (Server-Actions + Admin-Client).
- `/api/v1`-versioniert → Doc-33-Phase-2-Foundation.

## Verifikation
- `tsc --noEmit`: **exit 0**.
- `npm run build`: **✓ Compiled in 2.2min, 314/314 static**, `/api/v1/sv-in-naehe` als `ƒ` + route.js-Artefakt.
- Runtime-Smoke (Port 3072): `plz=50670` → **200 application/json** (center Köln, anzahl_treffer 20, sortierte sv_liste, korrekte Umlaute in `_meta`); CORS-Header + `OPTIONS` 204; Radius 10→6 / 30→20 Treffer; kein plz / `plz=abc` → **400**; anon → **200 (kein 307)**.

## 7-Punkte-Audit
- **Build:** grün (tsc 0 + next build, Route-Artefakt).
- **UI-Erreichbarkeit:** Public-API; `/api` ist in `isPublicPath` → anon erreichbar (Smoke 200). Auffindbar über `_meta` + (Folge) llms.txt-Mention.
- **Redundanz:** `geocodeAdresse`/`haversineKm`/`ladeAktiveSVs`/`ladeSvLeads` wiederverwendet (gleiche Helfer wie 0a.1).
- **Dead-Code:** keiner; Smoke-Log entfernt.
- **Spec-Treue:** Doc 34 0b.1 erfüllt. Abweichung: In-Memory-Rate-Limit statt Supabase-RPC (begründet: kein DB-Cost auf public Endpoint); `id` aus Tier-3-Response entfernt (Privacy, kein Nutzen extern).
- **Inkonsistenz:** Result-Pattern bei Action-Calls; `_meta`-Text mit echten Umlauten/§/€ (LLM-zitierbar).
- **Regression:** reine neue Route, kein Shared-File-Edit → kein Einfluss auf Bestand; unabhängig von #1634.

## Bewusst deferred (Folge-PRs)
- **0b.3 Stadt-OG mit Mini-Karte:** `STAEDTE` hat nur `plzPrefix` als **Range** (`'50–51'`), keine einzelne PLZ → die PLZ-basierte Karte-API kann nicht sauber referenziert werden. Braucht eine Entscheidung: `plzBeispiel`-Feld in `staedte.ts` ergänzen ODER Karte-API um `?lat&lng` erweitern (STAEDTE hat lat/lng). Danach sauber baubar.
- **0b.2 ChatGPT Custom GPT:** braucht Aarons ChatGPT-Team-Account (GPT-Store-Submission) + OpenAPI-Spec aus dieser Route.
- **0b.4 `/sv?plz=`-Short-URL:** `/sv` ist in `proxy.ts` APP_PREFIXES (→ app.claimondo.de, SV-Token-Magic-Links) → Kollision. Anderer Pfad/Host-Weiche nötig.
- **llms.txt JSON-API-Mention:** bewusst nicht hier editiert (llms.txt wird von 0a/#1634 angefasst → Konflikt-Vermeidung). Mini-Follow-up nach Merge von #1634 + diesem PR.
