# Kfz-Gutachter Wuppertal (Cluster-Master)

Eigenständige Next.js-16-Standalone-Landingpage für hyperlokale SEA — Cluster
**Wuppertal / Bergisches Land**. Master-Projekt; Düsseldorf + Bonn werden daraus
geklont (nur `lib/cluster.ts` + `app/globals.css`-Cluster-Vars + `app/layout.tsx`
theme-color + `public/assets/img/{cluster}/` ersetzen).

Stack: Next 16 (App Router, `output: 'standalone'`), React 19, Tailwind v4,
`next/font/google`. **Kein** eigenes Backend — Anrufen + WhatsApp sind die
CTA-Pfade (Phase 1); Anfrage-Erfassung kommt via Monika-Embed (Plan 2,
`<MonikaEmbedSlot/>` rendert in Phase 1 `null`).

## Befehle
```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # → .next/standalone/server.js (+ postbuild assets-copy)
npm run start        # next start (Dev-Prod)
npm run smoke        # SMOKE_BASE_URL=... node scripts/smoke.mjs
```

## Struktur
- `app/` — Hub (`page.tsx` = Hauptstadt) + Spokes (`lp/[slug]/page.tsx`, `generateStaticParams` = 11 Nicht-Hauptstädte). `sitemap.ts`/`robots.ts`/`manifest.ts`/`api/track/route.ts`.
- `components/` — Section-Komponenten (Server) + interaktive Client-Inseln (`CasesCarousel`, `NetzwerkCompare`, `MapSection`, `FaqAccordion`, `FabStack`, `SiteScripts`). `LandingPage.tsx` komponiert alles.
- `lib/` — `cluster.ts` (Stadt-Daten), `content.ts` (cluster-agnostischer Content), `site.ts` (Konstanten/ENV), `seo.ts` (per-Stadt-Metadata), `schema.ts` (JSON-LD), `tracking.ts`, `text.tsx` (renderRich).
- `public/assets/` — `img/wuppertal/` (cluster), `img/shared/` + `img/local/` (geteilt), `brand/`. **Mehrere Platzhalter — siehe `MISSING-ASSETS.md`.**

## SEO / Routing
- Hub `/` = Wuppertal (canonical `/`). Spokes `/lp/{slug}/` für die 11 anderen Städte (eigener Title/Description/Canonical/`AutomotiveBusiness`+`FAQPage`+`BreadcrumbList`-JSON-LD, stadt-spezifische geo).
- Sitemap = 12 URLs (Hub + 11 Spokes). `/lp/wuppertal/` existiert bewusst nicht (= Hub, kein Duplicate).

## Tracking (Stubs bis ENV befüllt)
8+ CTA-Slots (`data-cta="*_call"` / `*_wa`) → delegiertes Klick-Tracking in `SiteScripts` → `dataLayer` + Beacon `/api/track` + (wenn ENV) Google-Ads-Conversion. gclid/utm → localStorage (90 Tage) für späteres Monika-Embed. Scroll-Depth 50/90. Plausible/Clarity/GTM optional via `NEXT_PUBLIC_*`.

## Klonen (Düsseldorf / Bonn)
1. `cp -r kfz-gutachter-wuppertal/ kfz-gutachter-duesseldorf/`
2. `lib/cluster.ts` → DUS-Cluster-Datensatz · `app/globals.css` :root Cluster-Vars (Block 2b) · `app/layout.tsx` theme-color · `public/assets/img/duesseldorf/`
3. `app/sitemap.ts`/`robots.ts`/`.env`/PM2-Port (3004) ziehen automatisch über `SITE.url`/`CLUSTER`.

Deploy: siehe `DEPLOY.md`. Asset-Status: siehe `MISSING-ASSETS.md`.
