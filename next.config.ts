import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

// AAR-459 F1: next-intl v4 Plugin. Registriert `src/i18n/request.ts` als
// Server-Config (liest Cookie `claimondo-locale`, fallback 'de').
// URL-Locale-Präfix ist bewusst NICHT aktiviert — Sprache wird per Cookie
// geführt, damit `/`, `/flow/...`, `/schaden-melden` unverändert bleiben.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // VPS-Deploy: `output: 'standalone'` erzeugt .next/standalone/ mit server.js
  // + minimal node_modules — der deploy-vps.yml-Workflow tart das in /var/www
  // und pm2 startet server.js. Ohne standalone schaeft cp -r .next/static
  // fehl (das ist genau der Fehler aus Run #25694487759).
  output: 'standalone',
  // CMM-55: pdf-parse v2 + pdfjs-dist sind Native-Node-Pakete (DOMMatrix via
  // @napi-rs/canvas). Turbopack darf sie NICHT in den Route-Chunk bundlen —
  // der gebuendelte require('@napi-rs/canvas') loest sonst gegen Turbopacks
  // virtuellen /ROOT-Pfad statt das echte node_modules auf -> "Cannot find
  // module '@napi-rs/canvas'". Als serverExternalPackage laeuft pdf-parse als
  // echtes node_modules-Modul; sein require('@napi-rs/canvas') loest normal auf.
  serverExternalPackages: ['pdf-parse'],
  // CMM-55: pdf-parse v2 laedt @napi-rs/canvas via try/catch-gekapseltem
  // require fuer die DOMMatrix/ImageData/Path2D-Polyfills. @vercel/nft
  // (output: 'standalone') uebersieht den gekapselten require -> @napi-rs/
  // canvas fehlt im getraceten Standalone-node_modules -> auf dem VPS
  // "ReferenceError: DOMMatrix is not defined", die OCR-Route liest kein PDF.
  // Force-include fuer die ocr-gutachten-Route (Next-Doku-Pattern, analog sharp).
  outputFileTracingIncludes: {
    '/api/ocr-gutachten': ['node_modules/@napi-rs/**/*'],
  },
  // Turbopack-Alias für 3D-Pakete die NICHT installiert sind (Feldmodus-Backlog).
  // three/@deck.gl/@loaders.gl würden OOM im CI-Build verursachen (4 GB Runner).
  // Die Stub-Dateien liefern Proxy-basierte No-Ops — alle Exports die die
  // @ts-nocheck-Dateien referenzieren sind vorhanden, Build bleibt grün.
  turbopack: {
    resolveAlias: {
      'three': './src/lib/mapbox/__stubs__/three-stub.ts',
      // 2026-05-11: three/examples/jsm/loaders/OBJLoader.js wurde vom
      // sv-car-3d-three.ts dynamisch geladen — Turbopack kann den Subpath
      // nicht ueber den Top-Level-Alias aufloesen, deshalb explizit.
      'three/examples/jsm/loaders/OBJLoader.js': './src/lib/mapbox/__stubs__/three-stub.ts',
      'three/examples/jsm/loaders/MTLLoader.js': './src/lib/mapbox/__stubs__/three-stub.ts',
      'three/examples/jsm/loaders/RGBELoader.js': './src/lib/mapbox/__stubs__/three-stub.ts',
      '@deck.gl/mapbox': './src/lib/mapbox/__stubs__/three-stub.ts',
      '@deck.gl/geo-layers': './src/lib/mapbox/__stubs__/three-stub.ts',
      '@loaders.gl/3d-tiles': './src/lib/mapbox/__stubs__/three-stub.ts',
    },
  },
  // CMM-14 Follow-up 14.05.26: `next build` (Production) nutzt Webpack, NICHT
  // Turbopack — der turbopack.resolveAlias greift dort nicht. Folge: echtes
  // three.js (0.184, pure-ESM) wird gebundlt; ESM/CJS-Interop-Bug minified
  // `THREE.Color` zu `a.Color = undefined`, Modul-Evaluation crasht im
  // `/gutachter/heute`-Chunk → React #310 (Re-Try-Loop um den failed dynamic
  // Import). Webpack-Alias spiegelt die Turbopack-Liste 1:1 auf die Stubs.
  webpack: (config) => {
    const stub = path.resolve(__dirname, 'src/lib/mapbox/__stubs__/three-stub.ts')
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'three$': stub,
      'three/examples/jsm/loaders/OBJLoader.js': stub,
      'three/examples/jsm/loaders/MTLLoader.js': stub,
      'three/examples/jsm/loaders/RGBELoader.js': stub,
      '@deck.gl/mapbox': stub,
      '@deck.gl/geo-layers': stub,
      '@loaders.gl/3d-tiles': stub,
    }
    return config
  },
  // Production-Source-Maps einschalten — damit User-Errors wie „an.map is not
  // a function" auf den echten File + Zeile zurückverfolgt werden können.
  // Erhöht die Bundle-Größe leicht, aber nur die .map-Files, die werden
  // nicht zum Client geladen außer DevTools öffnet sie.
  productionBrowserSourceMaps: true,
  // Security-Header für Public-Routes — Lighthouse-Best-Practice + DSGVO.
  // CSP NICHT gesetzt: Mapbox-GL, Sentry, Google-Fonts, Vercel-Analytics
  // brauchen explizite Quellen — separater Audit nötig wenn enforced.
  async headers() {
    const securityHeaders = [
      // Klickjacking-Schutz (sticky bei alten Browsern, frame-ancestors in CSP wäre moderner)
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      // MIME-Sniffing aus
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // Referrer policy: Cross-Site keine vollen URLs leaken
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // HSTS — HTTPS-Force für 2 Jahre inkl. Subdomains
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      // Permissions-Policy: nur was wir nutzen erlauben (Geolocation für Map, Camera für Foto-Upload)
      {
        key: 'Permissions-Policy',
        value: 'geolocation=(self), camera=(self), microphone=(self), payment=(), usb=(), magnetometer=()',
      },
      // X-DNS-Prefetch-Control für schnelleres DNS-Auflösen externer Ressourcen
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ]
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  async redirects() {
    return [
      // AAR-295: Alte SV-Auftrag-Detail-Route → einheitliche Fallakte.
      // Permanent (301), damit Bookmarks und Email-Links sauber umgeleitet werden.
      {
        source: '/gutachter/auftrag/:id',
        destination: '/gutachter/fall/:id',
        permanent: true,
      },
      // CMM-14 (14.05.26): /gutachter ist nur noch ein Redirect-Stub auf
      // /gutachter/heute (AAR-700). Der Server-Component-Redirect über
      // `redirect('/gutachter/heute')` produzierte deterministisch React-
      // #310 ("Rendered more hooks than during the previous render") im
      // Next-AppRouter — Hook-Count diverged zwischen der initialen
      // /gutachter-RSC-Payload und der /gutachter/heute-Re-Render-Payload.
      // Als HTTP-301-Redirect umgehen wir RSC komplett — Browser navigiert
      // direkt, AppRouter sieht nur die finale Ziel-URL.
      {
        source: '/gutachter',
        destination: '/gutachter/heute',
        permanent: true,
      },
      // AAR-894 (14.05.26): /dispatch/karte ist jetzt eine echte Mapbox-Route
      // (Leads-Triage-Layer). Der temporäre AAR-889-Stub-Redirect zu
      // /dispatch/sachverstaendige wurde entfernt — die Route hat jetzt eine
      // eigene page.tsx und braucht keinen Stub mehr.
      // AAR-338: Admin-Dispatch-Board gibt's nicht mehr als Admin-Layout —
      // /dispatch/* ist jetzt das einzige Dispatch-Frontend (Full-Screen).
      {
        source: '/admin/dispatch',
        destination: '/dispatch/dashboard',
        permanent: true,
      },
      // AAR-524: Legacy-Redirects die vorher als runtime-`redirect()` in
      // page.tsx-Files hingen. Als HTTP-301 in next.config effizienter und
      // für SEO/Bookmarks sauberer — die Route wird gar nicht erst
      // gerendert.
      {
        source: '/admin/karte',
        destination: '/admin/sachverstaendige',
        permanent: true,
      },
      // AAR-889 (14.05.26): /admin/sv-onboarding zeigte vorher auf
      // /admin/sachverstaendige/neu — der selbst ein RSC-Stub auf
      // /anlegen war (Sweep-Eintrag unten). Direktes Ziel statt
      // Redirect-Kette.
      {
        source: '/admin/sv-onboarding',
        destination: '/admin/sachverstaendige/anlegen',
        permanent: true,
      },
      // AAR-530 (A6): Legacy-Redirects für die Hub-Konsolidierung aus
      // AAR-523. Alle alten Übersichts-Routes redirecten auf die neue
      // Hub-Tab-URL. Detail-Routes (/:id) bleiben unberührt, weil die
      // Quellen (re-export-Pages) noch existieren und Detail-Deep-Links
      // direkt treffen sollen — next redirect matcht nur exakt die source,
      // nicht Sub-Paths wenn kein :path* Wildcard dranhängt.
      //
      // Fälle-Hub (AAR-526):
      { source: '/admin/sla', destination: '/admin/faelle/sla', permanent: true },
      { source: '/admin/statistiken', destination: '/admin/faelle/statistiken', permanent: true },
      { source: '/admin/kanzlei-board', destination: '/admin/faelle/kanzlei', permanent: true },
      { source: '/admin/reklamationen', destination: '/admin/faelle/reklamationen', permanent: true },
      // Partner-Hub (AAR-527):
      { source: '/admin/organisationen', destination: '/admin/partner', permanent: true },
      { source: '/admin/versicherungen', destination: '/admin/partner/versicherer', permanent: true },
      { source: '/admin/communities', destination: '/admin/partner/communities', permanent: true },
      // Finanzen-Hub (AAR-528):
      { source: '/admin/abrechnungen', destination: '/admin/finance/abrechnungen', permanent: true },
      { source: '/admin/kanzlei-abrechnungen', destination: '/admin/finance/kanzlei', permanent: true },
      { source: '/admin/finance/provisionen-maik', destination: '/admin/finance/provisionen', permanent: true },
      // Aufgaben-Hub (AAR-531):
      { source: '/admin/meine-tasks', destination: '/admin/aufgaben/meine', permanent: true },
      { source: '/admin/tasks', destination: '/admin/aufgaben/alle', permanent: true },
      // AAR-628: Fallakte-Route-Konsolidierung. Die Detail-Route wird
      // aus /admin/faelle/[id] rausgezogen in die neutrale Route /faelle/[id],
      // damit KB + Kanzlei ihre eigene Shell bekommen. Der Redirect muss
      // Sub-Pfade (z.B. ?tab=dokumente) mitnehmen — Query-Strings behält
      // Next automatisch, nur zusätzliche Pfad-Segmente brauchen :path*.
      //
      // Die Liste/Kanban bleibt unter /admin/faelle/(hub) — nur der
      // [id]-Branch wird umgezogen. Deshalb präzises UUID-like Match.
      {
        source: '/admin/faelle/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/:path*',
        destination: '/faelle/:id/:path*',
        permanent: true,
      },
      {
        source: '/admin/faelle/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
        destination: '/faelle/:id',
        permanent: true,
      },
      // AAR-889 (14.05.26): RSC-Redirect-Stubs Sweep. Alle hier gelisteten
      // page.tsx-Stubs hatten exakt das Pattern aus dem CMM-14-Fix für
      // /gutachter und /dispatch/karte oben — `export default function() {
      // redirect('/woandershin') }` als Server-Component. Das triggert
      // deterministisch React-#310/#418 im Next-AppRouter, sobald jemand
      // auf der Stub-URL landet. Lösung wie gehabt: HTTP-301 via
      // next.config.ts, page.tsx-File gelöscht.
      //
      // Source-Match ist überall exakt (kein `:path*`), weil unter den
      // Stub-Pfaden Sub-Routen weiterleben sollen (z. B.
      // /gutachter/termine/[id]/vor-ort, /admin/aufgaben/meine,
      // /admin/aufgaben/alle, /kanzlei/dashboard, …).
      //
      // Static (7):
      { source: '/admin/aufgaben', destination: '/admin/aufgaben/meine', permanent: true },
      { source: '/admin/sachverstaendige/neu', destination: '/admin/sachverstaendige/anlegen', permanent: true },
      { source: '/gutachter/mitteilungen', destination: '/gutachter/heute', permanent: true },
      { source: '/gutachter/nachrichten', destination: '/gutachter/posteingang', permanent: true },
      { source: '/gutachter/route', destination: '/gutachter/heute', permanent: true },
      { source: '/gutachter/termine', destination: '/gutachter/kalender?view=liste', permanent: true },
      { source: '/kanzlei', destination: '/kanzlei/mandate', permanent: true },
      // 15.05.2026: Mandate-Route umbenannt — vorher /kanzlei/dashboard,
      // jetzt /kanzlei/mandate (passend zum Page-Titel und Nav-Label
      // "Mandate"). Mobile-Hygiene-Audit (Iteration 2-3) hat den 404 auf
      // /kanzlei/mandate aufgedeckt. Alter Pfad als HTTP-308 für Bookmarks.
      { source: '/kanzlei/dashboard', destination: '/kanzlei/mandate', permanent: true },
      // 15.05.2026: /dispatch hatte weder eine page.tsx noch einen Redirect —
      // Audit-Smoke (docs/15.05.2026/mobile-hygiene/) zeigte 404 auf dem
      // Portal-Root. Analog zu /kanzlei → /kanzlei/mandate (Z. 202) und
      // /gutachter → /gutachter/heute (Z. 108) jetzt als HTTP-308 statt
      // page.tsx-Stub (vermeidet React-#310/#418, siehe AAR-889-Block oben).
      { source: '/dispatch', destination: '/dispatch/dashboard', permanent: true },
      // Dynamic Param-Stubs (2):
      // AAR-713 Phase 1: Legacy /ablehnen/<token> → /sv/termin/<token>
      // (vollständiger SV-Mini-Flow). Email-Clients lernen die neue URL
      // über das 308.
      { source: '/ablehnen/:token', destination: '/sv/termin/:token', permanent: true },
      // AAR-kanzlei-portal PR 2b: /kanzlei/fall/[id] → /faelle/[id]. Die
      // /faelle/layout.tsx erkennt Kanzlei-Rolle und rendert KanzleiNav-
      // Shell; FALL_PERMISSIONS gated Edit-Actions auf READONLY.
      { source: '/kanzlei/fall/:id', destination: '/faelle/:id', permanent: true },
      // AAR-904 (14.05.26): Alter 4-Step-Wizard ist abgeschafft, /schaden-melden
      // ist jetzt direkt der Mini-Wizard. Alte URL-Pfade landen sauber auf
      // der neuen Seite — Bookmarks + Email-Links der Schritt-1-Voice-Variante
      // werden via HTTP-301 weitergeleitet.
      { source: '/schaden-melden/schritt-1', destination: '/schaden-melden', permanent: true },
      { source: '/schaden-melden/schritt-1/voice', destination: '/schaden-melden', permanent: true },
      { source: '/schaden-melden/schritt-2', destination: '/schaden-melden', permanent: true },
      { source: '/schaden-melden/schritt-2/analyse', destination: '/schaden-melden', permanent: true },
      { source: '/schaden-melden/schritt-2/gegner', destination: '/schaden-melden', permanent: true },
      { source: '/schaden-melden/schritt-3', destination: '/schaden-melden', permanent: true },
      { source: '/schaden-melden/schritt-4', destination: '/schaden-melden', permanent: true },
      { source: '/schaden-melden/prototyp', destination: '/schaden-melden', permanent: true },
      { source: '/schaden-melden/prototyp/link-versendet', destination: '/schaden-melden/link-versendet', permanent: true },
      { source: '/schaden-melden/prototyp/selbstverschulden', destination: '/schaden-melden/selbstverschulden', permanent: true },
      { source: '/schaden-melden/fortsetzen/:token', destination: '/schaden-melden', permanent: true },
    ]
  },
};

const withIntl = withNextIntl(nextConfig);

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withIntl, { silent: true })
  : withIntl;
