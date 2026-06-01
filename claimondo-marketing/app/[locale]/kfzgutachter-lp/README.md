# kfzgutachter-lp — Ads-Landeseite + Scroll-Popover

Bespoke Landing-Page für Google-Ads-Traffic auf der Subdomain
`kfzgutachter.claimondo.de`. noindex, A/B-Test-Variante B, Archetyp A
„Formular-First". Stadt-Insertion über UTM-Params (`utm_term`/
`utm_campaign` oder dedizierter `?stadt=`-Param).

## Komponenten

- `page.tsx` — Server Component, holt Stadt aus searchParams, rendert
  Topbar + Hero (mit LeadFormClient) + Sektionen + StickyMobileCta +
  ScrollPopoverClient.
- `LeadFormClient.tsx` — Hero-Form (3 Felder: Name, Tel, Stadt).
- `ScrollPopoverClient.tsx` — bei 26 % scroll-depth einmaliger Popover
  mit 3-Step-Wizard (Fahrzeug → Standort + Verfügbarkeits-Check →
  Kontakt). Suppression via sessionStorage. Debug-/Force-Override:
  `?popover_debug=1` + `?popover_force=1`.
- `actions.ts` — submitKfzgutachterLead Server-Action. Schreibt in
  `anfragen`-Tabelle, ruft `convert_anfrage_zu_lead` RPC für den
  Lead-Insert. Accept FormData mit `name`/`phone`/`city` (Zod) +
  optional `fahrzeug` + `place_id` ins JSONB-payload.
- `track.ts` — trackLpEvent-Helper (lp_variant + source default-injection).
- `constants.ts` — TEL_HREF/TEL_DISPLAY/WA_HREF.
- `resolve-stadt.ts` — UTM-Stadt-Resolver gegen kfz-gutachter/staedte.ts.
- `GoogleReviewsStrip.tsx` — Reviews-Widget (statische Daten).
- `LiveCountPill.tsx` — Live-Counter aus anfragen-Tabelle.

## API

`src/app/api/kfzgutachter-lp/gutachter-verfuegbar/route.ts` — POST mit
`{ placeId }` → `{ ok, count, gutachter }`. Auflösung der Place-ID via
Google-Places-Details, Point-in-Polygon gegen alle map-ready
Sachverständigen-Isochronen, optionaler Profile-Stack (Standard-Paket
only). Helper in `_lib.ts`.

## Testing

Dreischichtige Test-Pyramide:

- **Unit** (Vitest, environment=node) — pure Helper aus _lib.ts:
  ```bash
  npx vitest run src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/lib.test.ts
  ```
- **Integration** (Vitest, gemockte Fetch + Supabase) — POST-Route:
  ```bash
  npx vitest run src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/route.test.ts
  ```
- **Gesamte LP-Suite**:
  ```bash
  npx vitest run src/app/kfzgutachter-lp src/app/api/kfzgutachter-lp
  ```
- **E2E-Smoke** (Playwright, braucht laufenden Dev-Server auf :3000 +
  echte Google-Places + echte Supabase-DB):
  ```bash
  node scripts/smoke-popover-e2e.mjs
  ```
  Cleanup der Test-Rows nach Run:
  ```bash
  node scripts/cleanup-popover-smoke.mjs
  ```

E2E-Tests sind NICHT Teil der PR-CI (brauchen Dev-Server + externe APIs).
Manuell vor jedem signifikanten Release fahren. Plan-Doc:
`docs/superpowers/plans/2026-05-19-scroll-popover-testing.md`.
