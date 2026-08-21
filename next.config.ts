import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

// AAR-459 F1: next-intl v4 Plugin. Registriert `src/i18n/request.ts` als
// Server-Config (liest Cookie `claimondo-locale`, fallback 'de').
// URL-Locale-Präfix ist bewusst NICHT aktiviert — Sprache wird per Cookie
// geführt, damit `/`, `/flow/...`, `/schaden-melden` unverändert bleiben.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Marketing-Content-Studio Standalone-Trace-Fix: die kompletten Remotion-Runtime-Trees.
// @vercel/nft (output:standalone) traced die runtime-required/nativen/ESM-Files NICHT
// (renderer/dist/index.js CJS-Entry, @rspack/binding native, ws, @jridgewell ESM-Sourcemap-
// Toolchain die Remotions Render-bundle() zur Laufzeit braucht) -> ganze Trees force-includen.
const REMOTION_TRACE_INCLUDES = [
  'node_modules/@remotion/**/*',
  'node_modules/remotion/**/*',
  'node_modules/@rspack/**/*',
  'node_modules/ws/**/*',
  'node_modules/@jridgewell/**/*',
  // mediabunny (+ @mediabunny/*-Encoder) = Media-Toolchain, die @remotion/studio im
  // Render-bundle() importiert; ebenfalls ESM-gestrippt vom Standalone-Trace (prod 14.07.).
  'node_modules/mediabunny/**/*',
  'node_modules/@mediabunny/**/*',
];

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
  // Remotion (Marketing-Content-Studio): @remotion/renderer + @remotion/bundler laden
  // native Binaries (Chromium-Compositor, esbuild) via runtime-require. Turbopack darf sie
  // NICHT in den Route-Chunk bundlen (analog pdf-parse) -> als serverExternalPackages laufen
  // sie als echte node_modules. Der Render-Orchestrator (src/lib/marketing/render-clip.ts)
  // buendelt src/remotion/ separat, ausserhalb von Next.
  serverExternalPackages: ['pdf-parse', '@remotion/renderer', '@remotion/bundler'],
  // SV-Onboarding-Doku-Upload (uploadSvPflichtdokument / uploadSaVorlage) erlaubt
  // 15 MB PDFs/Scans. Server-Actions capen den Request-Body per Default bei 1 MB
  // -> jede Datei > 1 MB warf einen Framework-Fehler VOR dem Action-Code, der
  // User sah "Upload fehlgeschlagen". Limit auf 20 MB (15 MB Datei + Multipart-
  // Overhead) angehoben; Bucket fall-dokumente erlaubt bis 50 MB. Next 16:
  // serverActions liegt unter experimental (config-shared.d.ts:634).
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // Doc-45-Perf-Nachzug: AVIF zusaetzlich zu WebP fuer next/image. AVIF ist
  // ~20-30% kleiner als WebP bei Foto-Heros (LP-Hero-PNGs 670-690 KB Quelle)
  // -> kleinerer LCP-Transfer auf ~95 % der Browser. Trade-off: erstmaliges
  // On-Demand-AVIF-Encoding pro Variante ist CPU-intensiv auf dem PM2-VPS
  // (kein Image-CDN); Next cached das Ergebnis unter .next/cache/images
  // (einmalig je Variante/Deploy). Bei VPS-CPU-Sorge: Eintrag entfernen
  // -> Fallback WebP-only (Next-Default).
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // CMM-55: pdf-parse v2 laedt @napi-rs/canvas via try/catch-gekapseltem
  // require fuer die DOMMatrix/ImageData/Path2D-Polyfills. @vercel/nft
  // (output: 'standalone') uebersieht den gekapselten require -> @napi-rs/
  // canvas fehlt im getraceten Standalone-node_modules -> auf dem VPS
  // "ReferenceError: DOMMatrix is not defined", die OCR-Route liest kein PDF.
  // Force-include fuer die ocr-gutachten-Route (Next-Doku-Pattern, analog sharp).
  outputFileTracingIncludes: {
    // @napi-rs/canvas (DOMMatrix-Polyfill) + die kompletten pdf-parse- und
    // pdfjs-dist-Trees: beide Pakete laden Files dynamisch (pdf.worker.mjs,
    // CMaps/Fonts), die @vercel/nft nicht statisch traced. Ganze Trees
    // force-includen -> deterministisch, kein Missing-File im Standalone.
    '/api/ocr-gutachten': [
      'node_modules/@napi-rs/**/*',
      'node_modules/pdf-parse/**/*',
      'node_modules/pdfjs-dist/**/*',
    ],
    // QR-Pool-Flyer: die A5-Vorlage ins Standalone tracen, damit die Flyer-
    // Server-Actions (generateFlyerPdf) sie auf dem VPS via
    // process.cwd()/public/... finden — sonst fehlt das PDF im getraceten
    // Standalone-Output (analog OCR-Force-Include oben).
    // F2b Route-Konsolidierung (08.08.): der QR-Pool rendert jetzt kanonisch unter
    // /admin/vertrieb/werkstaetten/qr-pool(/drucken) (Legacy redirectet 308 dorthin) --
    // outputFileTracingIncludes keyt auf die RENDERNDE Route, nicht auf Import-Pfade,
    // daher zusaetzlich die vertrieb-Keys mit demselben Include-Wert. Legacy-Keys bleiben
    // als Belt-and-Suspenders (kein Schaden, falls je wieder direkt gerendert).
    '/admin/werkstaetten/qr-pool': ['public/flyer-templates/werkstatt-partner-a5.pdf'],
    '/admin/werkstaetten/qr-pool/drucken': ['public/flyer-templates/werkstatt-partner-a5.pdf'],
    '/admin/vertrieb/werkstaetten/qr-pool': ['public/flyer-templates/werkstatt-partner-a5.pdf'],
    '/admin/vertrieb/werkstaetten/qr-pool/drucken': ['public/flyer-templates/werkstatt-partner-a5.pdf'],
    // Marketing-Content-Studio: der Render-Orchestrator (src/lib/marketing/render-clip.ts)
    // laedt @remotion/renderer + @remotion/bundler via runtime-require (serverExternalPackages,
    // s.o.). @vercel/nft traced deren CJS-Entry (renderer/dist/index.js), das native
    // @rspack/binding (bundler nutzt rspack) und ws (Browser-Protokoll) NICHT -> fehlten im
    // Standalone-node_modules -> Server-Component-500 beim Laden der Marketing-Route (prod
    // 14.07.: "Cannot find module '@rspack/binding'" / renderer/dist/index.js / ws). Komplette
    // Trees force-includen (analog OCR/pdf-parse oben) -> deterministischer, deploy-fester Fix.
    '/admin/marketing/content-studio': REMOTION_TRACE_INCLUDES,
    '/admin/marketing/content-studio/[id]': REMOTION_TRACE_INCLUDES,
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
    // X-Frame-Options ist BEWUSST aus securityHeaders raus (greift unten separat
    // ueberall AUSSER /embed). Grund: X-Frame-Options kennt keinen "erlaube genau
    // diese Origins"-Wert — die Embed-Route (AAR-956 WS6) wird absichtlich cross-
    // origin auf claimondo.de eingebettet, also darf sie SAMEORIGIN schlicht nicht
    // senden; statt dessen steuert die frame-ancestors-CSP unten, wer einbetten darf.
    const securityHeaders = [
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
      {
        // Klickjacking-Schutz (X-Frame-Options) ueberall AUSSER /embed/* — der
        // Negative-Lookahead haelt die Embed-Route frei, damit sie einbettbar bleibt.
        source: '/((?!embed/).*)',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        // AAR-956 WS6: der Gutachter-Finder-Embed wird per <iframe> auf claimondo.de
        // (Apex) + *.claimondo.de (www/app/staging) eingebettet. KEIN X-Frame-Options
        // hier; frame-ancestors erlaubt genau diese Origins.
        //
        // 21.08.2026 — die fuenf Cluster-Domains kamen dazu ("Partner-Domains
        // spaeter" aus dem urspruenglichen Kommentar ist jetzt hier): Aaron hat
        // entschieden, dass der Gutachter-Finder dort EIGENSTAENDIG laeuft
        // statt auf claimondo.de zu verlinken (`/gutachter-finden` je Domain).
        //
        // ⚠ WAS PASSIERT, WENN EINE DOMAIN HIER FEHLT: der Browser blockt den
        // iframe stumm. Die Seite antwortet mit HTTP 200 und rendert eine LEERE
        // FLAECHE — kein Server-Fehler, kein roter Build, nichts im Log ausser
        // einer CSP-Meldung in der Browser-Konsole. Genau so sah es beim
        // lokalen Test aus. Neue Cluster-Domain => diese Liste ergaenzen.
        source: '/embed/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              'frame-ancestors',
              "'self'",
              'https://claimondo.de',
              'https://*.claimondo.de',
              'https://kfz-unfallgutachter-koeln.de',
              'https://kfz-unfallgutachter-duesseldorf.de',
              'https://kfz-unfallgutachter-aachen.de',
              'https://kfz-unfallgutachter-bonn.de',
              'https://kfz-unfallgutachter-wuppertal.de',
            ].join(' '),
          },
        ],
      },
      {
        // AAR-939: Monika-Embed-Sounds laedt das Widget cross-origin (Cluster-LPs +
        // SV-Embeds) per fetch()+decodeAudioData. Ohne CORS blockt der Browser den
        // Response-Body -> loadBuffers faengt den Fehler -> die Sounds bleiben still.
        // Public Audio-Assets ohne Credential -> ACAO:* ist sicher. (proxy.ts nimmt
        // /embed/sounds vom Auth-Matcher aus, #2517 -> headers() greift hier separat.)
        source: '/embed/sounds/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
      {
        // Slice 2 (Offline-Read): der Service-Worker darf nicht HTTP-gecacht werden,
        // sonst greifen SW-Updates verzoegert. no-store => Browser holt sw.js bei jedem
        // Load neu (zusammen mit updateViaCache:'none' in register-sw.ts).
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
  async redirects() {
    return [
      // SV-Org-Retire 2026-07-28: /gutachter/team (Verwalter/Pool-Lead-Modell)
      // retired — dormant + off-roadmap (s. docs/fundament/DECISIONS.md). War eh
      // org-gated (0 Orgs → alle wurden auf /gutachter umgeleitet); Alt-Bookmarks
      // → SV-Home statt 404. Exakt-Match, permanent (308).
      {
        source: '/gutachter/team',
        destination: '/gutachter',
        permanent: true,
      },
      // Werkstatt-Interesse-Formular-Retire 2026-08-05 (Aaron): /werkstatt-partner-werden
      // (partner_leads-Prospect OHNE Account, Alt-Weg vor dem Self-Signup) ist zugunsten
      // der Selbst-Registrierung retired — "Anfrage = sofort aktiver Partner". Exakt-Match,
      // permanent (308); faengt Alt-Bookmarks + versendete Cold-Mail-Links ab.
      {
        source: '/werkstatt-partner-werden',
        destination: '/werkstatt/registrieren',
        permanent: true,
      },
      // Doc 41 PR9: Frueherer /haftpflicht -> /kfz-haftpflicht-schaden 301
      // (Stream A #1599, 23.05.) ENTFERNT. #1663 (24.05.) hat /haftpflicht bewusst
      // zum vollwertigen Glossar-Hub gemacht (alle 57 Spokes, eigener Canonical)
      // UND die Sitemap listet /haftpflicht als crawlbare URL — der stale 301 hat
      // diese Seite nur verschattet (toter Code). Jetzt 200: Glossar-Index (volle
      // Cluster-Auflistung) != Cornerstone-Marketing-Teaser, eigener Canonical ->
      // keine Duplikat-Hub-Kannibalisierung. Aktiviert zugleich die PR7-Cluster-
      // Headline-Deep-Links (#cluster-* Anker liegen auf der Glossar-Seite).
      // /haftpflicht/[slug]-Spokes waren nie betroffen (Exakt-Match).
      // AAR-295: Alte SV-Auftrag-Detail-Route → einheitliche Fallakte.
      // Permanent (301), damit Bookmarks und Email-Links sauber umgeleitet werden.
      {
        source: '/gutachter/auftrag/:id',
        destination: '/gutachter/fall/:id',
        permanent: true,
      },
      // AAR-956 T1.1b: /anfrage/[token]-Self-Service-Strecke retired (kanonischer
      // Ersatz = /start → /flow). Alt-Magic-Links (WhatsApp/Email, alle Token bereits
      // abgelaufen) → Startseite statt 404. Permanent (301): Route kommt nicht zurück.
      {
        source: '/anfrage/:token*',
        destination: '/',
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
      // F2b Route-Konsolidierung (08.08.): Ziel direkt auf vertrieb/sachverstaendige
      // gezogen (die Liste lebt dort jetzt als echter Content, s.u.) -- sonst
      // Doppel-Hop ueber den bereits bestehenden Exact-Match-Redirect
      // /admin/sachverstaendige -> /admin/vertrieb (Zeile ~399, landet auf dem
      // allgemeinen Cockpit-Roster statt der SV-Karte).
      {
        source: '/admin/karte',
        destination: '/admin/vertrieb/sachverstaendige',
        permanent: true,
      },
      // Aaron 07.07.: SV-Leads-Verwaltung wanderte in die Sachverstaendige-
      // Sektion (Drawer ueber der Karte). Alte Bookmarks -> neue Route.
      // F2b Route-Konsolidierung (08.08.): Ziel direkt auf vertrieb gezogen --
      // sonst Doppel-Hop ueber den neuen Exact-Match-Redirect
      // /admin/sachverstaendige/leads -> vertrieb (s.u.).
      {
        source: '/admin/sv-leads',
        destination: '/admin/vertrieb/sachverstaendige/leads',
        permanent: true,
      },
      // P4b (Aufgaben-Hub-Konsolidierung): der Aufgaben-Hub /admin/aufgaben (Nav)
      // ist kanonisch (Tabs: KI-Vorschlaege/Alle/Meine). Die alten Standalone-
      // Routen /admin/tasks + /admin/meine-tasks (die die Tabs nur re-exportierten)
      // -> 308-Redirect in die Hub-Tab, ihre page.tsx wurde in den Tab gemoved.
      // KEIN redirect()-Stub (s. Redirect-Stub-Gate). Exakt-Match.
      {
        source: '/admin/tasks',
        destination: '/admin/aufgaben/alle',
        permanent: true,
      },
      {
        source: '/admin/meine-tasks',
        destination: '/admin/aufgaben/meine',
        permanent: true,
      },
      // Portal-Header P1 (Finance-Hub-Konvergenz): die 7 Finance-Sub-Routen leben jetzt
      // als Client-State-Tabs im Hub (?tab=). Alte Routen -> Redirect auf den Hub-Tab
      // (KEIN redirect()-Stub in page.tsx, s. Redirect-Stub-Gate; Content lebt in _views/).
      // permanent:false (307): ?tab= ist Client-State + die Tab-Struktur evolviert noch
      // (Param-Forwarding ?monat=/?nr= = Follow-up), daher kein gecachter 308.
      { source: '/admin/finance/abrechnungen', destination: '/admin/finance?tab=abrechnungen', permanent: false },
      { source: '/admin/finance/saeumige-svs', destination: '/admin/finance?tab=saeumige-svs', permanent: false },
      { source: '/admin/finance/offene-faelle', destination: '/admin/finance?tab=offene-faelle', permanent: false },
      { source: '/admin/finance/per-sv-balance', destination: '/admin/finance?tab=per-sv-balance', permanent: false },
      { source: '/admin/finance/kanzlei', destination: '/admin/finance?tab=kanzlei', permanent: false },
      { source: '/admin/finance/provisionen', destination: '/admin/finance?tab=provisionen', permanent: false },
      { source: '/admin/finance/partner-abrechnungen', destination: '/admin/finance?tab=partner-abrechnungen', permanent: false },
      // P4a (Detail-View-Konsistenz / Faelle-Hub-Konvergenz F2): die 4 Hub-Tools
      // leben kanonisch als Tabs unter /admin/faelle (Hub-Shell + shared Header, F0).
      // Die alten Standalone-Routen (= Doppel-Routen: gleicher *Content, nur eigener
      // Header) -> 308-Redirect in die Hub-Tab, ihre page.tsx wurde geloescht (KEIN
      // redirect()-Stub in page.tsx, s. AGENTS.md Redirect-Stub-Gate). Die *Content-
      // Components bleiben (Hub-Tabs importieren sie). EXAKT-Match, damit Sub-Routen
      // wie /admin/statistiken/ki-usage weiter erreichbar bleiben.
      {
        source: '/admin/sla',
        destination: '/admin/faelle/sla',
        permanent: true,
      },
      {
        source: '/admin/reklamationen',
        destination: '/admin/faelle/reklamationen',
        permanent: true,
      },
      {
        source: '/admin/statistiken',
        destination: '/admin/faelle/statistiken',
        permanent: true,
      },
      {
        source: '/admin/kanzlei-board',
        destination: '/admin/faelle/kanzlei',
        permanent: true,
      },
      // AAR-889 (14.05.26): /admin/sv-onboarding zeigte vorher auf
      // /admin/sachverstaendige/neu — der selbst ein RSC-Stub auf
      // /anlegen war (Sweep-Eintrag unten). Direktes Ziel statt
      // Redirect-Kette.
      // F2b Route-Konsolidierung (08.08.): Ziel direkt auf vertrieb gezogen --
      // sonst Doppel-Hop ueber den neuen Exact-Match-Redirect
      // /admin/sachverstaendige/anlegen -> vertrieb (s.u.).
      {
        source: '/admin/sv-onboarding',
        destination: '/admin/vertrieb/sachverstaendige/anlegen',
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
      // E1 (Routen-Cleanup, docs/2026-07-17-routen-cleanup-detail-view-audit.md): /mitarbeiter/faelle
      // war ein Scope-Duplikat der rollen-adaptiven /faelle-Liste (KB → eigene Fälle, MitarbeiterNav-
      // Shell via faelle/layout.tsx AAR-628). EXAKT-Match — /faelle/[id]-Detail bleibt.
      { source: '/mitarbeiter/faelle', destination: '/faelle', permanent: true },
      // W2.8 (Routen-Cleanup): Kundentermine ist ein ?view= von /mitarbeiter/termine.
      { source: '/mitarbeiter/kundentermine', destination: '/mitarbeiter/termine?view=kundentermine', permanent: true },
      // Partner-Hub (AAR-527):
      { source: '/admin/organisationen', destination: '/admin/partner', permanent: true },
      { source: '/admin/versicherungen', destination: '/admin/partner/versicherer', permanent: true },
      { source: '/admin/communities', destination: '/admin/partner/communities', permanent: true },
      // Team-Hub (W1.4, Routen-Cleanup): Leaderboard + Incentives sind ?tab=-Views des
      // Team-Hubs statt eigener Routen. EXAKT-Match -> /admin/team/[id] (Detail) bleibt.
      { source: '/admin/team/leaderboard', destination: '/admin/team?tab=leaderboard', permanent: true },
      { source: '/admin/team/incentives', destination: '/admin/team?tab=incentives', permanent: true },
      // Finanzen-Hub (AAR-528):
      { source: '/admin/abrechnungen', destination: '/admin/finance/abrechnungen', permanent: true },
      { source: '/admin/kanzlei-abrechnungen', destination: '/admin/finance/kanzlei', permanent: true },
      { source: '/admin/finance/provisionen-maik', destination: '/admin/finance/provisionen', permanent: true },
      // Aufgaben-Hub (AAR-531):
      { source: '/admin/meine-tasks', destination: '/admin/aufgaben/meine', permanent: true },
      { source: '/admin/tasks', destination: '/admin/aufgaben/alle', permanent: true },
      { source: '/admin/ai-vorschlaege', destination: '/admin/aufgaben/vorschlaege', permanent: true },
      { source: '/admin/aufgaben', destination: '/admin/aufgaben/alle', permanent: true },
      // W1.5 (Routen-Cleanup): Kunde-Fälle-Liste -> Hub (rendert dasselbe FallKarten-Grid +
      // Jetzt-zu-tun + Übersicht). EXAKT-Match, damit /kunde/faelle/[id] (Detail-View) bleibt.
      { source: '/kunde/faelle', destination: '/kunde', permanent: true },
      // Vertrieb-Konsolidierung: Alt-Listen-Routen -> Cockpit (/admin/vertrieb).
      // EXAKT-Match (kein :path*) -> Sub-Routen (sachverstaendige/[id], /anlegen,
      // /basic-freigaben, werkstaetten/[id], /qr-pool) bleiben erreichbar. Die
      // Verwaltungen selbst leben weiter unter /admin/vertrieb/<rolle> (Re-Export)
      // und sind aus der Cockpit-Aktionsleiste verlinkt (inkl. SV-Live-Ops-Karte).
      { source: '/admin/makler', destination: '/admin/vertrieb', permanent: true },
      { source: '/admin/sachverstaendige', destination: '/admin/vertrieb', permanent: true },
      { source: '/admin/werkstaetten', destination: '/admin/vertrieb', permanent: true },
      { source: '/admin/partner-leads', destination: '/admin/vertrieb', permanent: true },
      // F2 Route-Konsolidierung (08.08.): die SV-Detail-Akte ist jetzt kanonisch unter
      // /admin/vertrieb/sachverstaendige/[id] (vorher Re-Export-Ziel, jetzt der echte
      // Content -- admin/sachverstaendige/[id]/page.tsx wurde zu SvAkteContent.tsx und
      // hat keinen Route-Slot mehr). UUID-Regex (nicht :path*) faengt NICHT die
      // Geschwister anlegen/basic-freigaben/leads, die unter /admin/sachverstaendige/*
      // unveraendert weiterleben. Der Legacy-@drawer/(.)[id]-Soft-Nav-Intercept auf der
      // Legacy-Liste wurde entfernt (Option 3a) -- die vertrieb-Konsole hat ihren eigenen
      // Cockpit-Drawer (admin/vertrieb/@drawer/(.)sachverstaendige/[id]), unberuehrt.
      {
        source: '/admin/sachverstaendige/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
        destination: '/admin/vertrieb/sachverstaendige/:id',
        permanent: true,
      },
      // F2b Route-Konsolidierung REST (08.08.): analog fuer die restlichen 3 SV-Routen
      // (anlegen/basic-freigaben/leads) -- ihre page.tsx wurden zu *Content.tsx umbenannt
      // und haben keinen Route-Slot mehr. EXAKT-Match (kein :path*) je Route, damit die
      // Routen sauber getrennt bleiben (kein Ueberschatten der Geschwister). Der Legacy-
      // @drawer/(.)anlegen + (.)leads-Soft-Nav-Intercept auf der Legacy-Liste wurde
      // entfernt (dieselbe Begruendung wie beim [id]-Drawer oben: die vertrieb-Konsole
      // hat kein eigenes Pendant fuer diese 3 Routen -- verifiziert, kein Cockpit-Drawer
      // fuer anlegen/basic-freigaben/leads vorhanden).
      {
        source: '/admin/sachverstaendige/anlegen',
        destination: '/admin/vertrieb/sachverstaendige/anlegen',
        permanent: true,
      },
      {
        source: '/admin/sachverstaendige/basic-freigaben',
        destination: '/admin/vertrieb/sachverstaendige/basic-freigaben',
        permanent: true,
      },
      {
        source: '/admin/sachverstaendige/leads',
        destination: '/admin/vertrieb/sachverstaendige/leads',
        permanent: true,
      },
      // F2 Route-Konsolidierung (08.08.): analog fuer Werkstatt -- die Detail-Akte ist
      // jetzt kanonisch unter /admin/vertrieb/werkstaetten/[id] (admin/werkstaetten/[id]/
      // page.tsx wurde zu WsAkteContent.tsx und hat keinen Route-Slot mehr). UUID-Regex
      // (nicht :path*) faengt NICHT qr-pool/qr-pool/drucken -- die haben (F2b, s.u.)
      // eigene EXAKT-Match-Redirects. Kein Legacy-@drawer/(.)[id] auf der Werkstatt-Liste
      // vorhanden (anders als bei SV) -- nichts zu entfernen.
      {
        source: '/admin/werkstaetten/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
        destination: '/admin/vertrieb/werkstaetten/:id',
        permanent: true,
      },
      // F2b Route-Konsolidierung REST (08.08.): analog fuer die restlichen 2 Werkstatt-
      // Routen (qr-pool/qr-pool/drucken) -- ihre page.tsx wurden zu *Content.tsx
      // umbenannt und haben keinen Route-Slot mehr. ZWEI SEPARATE EXAKT-Match-Eintraege
      // (kein :path*), sonst wuerde ein :path* auf qr-pool das drucken-Sub-Segment
      // schlucken statt es an seinen eigenen Redirect zu uebergeben. Kein Legacy-@drawer
      // fuer Werkstatt vorhanden (s.o.) -- nichts zu entfernen.
      {
        source: '/admin/werkstaetten/qr-pool',
        destination: '/admin/vertrieb/werkstaetten/qr-pool',
        permanent: true,
      },
      {
        source: '/admin/werkstaetten/qr-pool/drucken',
        destination: '/admin/vertrieb/werkstaetten/qr-pool/drucken',
        permanent: true,
      },
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
      // Static:
      // W1.8: /admin/aufgaben-Doppel-Redirect entfernt — der Aufgaben-Hub-Eintrag oben (→alle)
      // gewinnt per first-match; dieser (→meine) war toter Config-Code.
      // F2b Route-Konsolidierung (08.08.): Ziel direkt auf vertrieb gezogen -- sonst
      // Doppel-Hop ueber den neuen Exact-Match-Redirect /admin/sachverstaendige/anlegen
      // -> vertrieb (s.o.).
      { source: '/admin/sachverstaendige/neu', destination: '/admin/vertrieb/sachverstaendige/anlegen', permanent: true },
      { source: '/gutachter/mitteilungen', destination: '/gutachter/heute', permanent: true },
      { source: '/gutachter/nachrichten', destination: '/gutachter/posteingang', permanent: true },
      { source: '/gutachter/route', destination: '/gutachter/heute', permanent: true },
      // E2 (Routen-Cleanup, Aaron 17.07.): verwaiste /gutachter/gebiet-Route (CMM-17 hatte den
      // Nav-Punkt entfernt) -> Einstellungen (dort lebt der Gebiets-Polygon-Toggle). Bookmarks safe.
      { source: '/gutachter/gebiet', destination: '/gutachter/einstellungen', permanent: true },
      { source: '/gutachter/termine', destination: '/gutachter/kalender?view=liste', permanent: true },
      // W1 Quick-Wins (Routen-Cleanup, docs/2026-07-17-routen-cleanup-detail-view-audit.md):
      // Funktion/Information in bestehende Flaechen migriert — Alt-Routen 308
      // (Bookmarks, Vertrags-Anhang-Links aus OrderSummaryCard, historische Direkt-URLs).
      { source: '/gutachter/leadpreise', destination: '/gutachter/abrechnung', permanent: true },
      { source: '/gutachter/statistiken', destination: '/gutachter/abrechnung', permanent: true },
      { source: '/gutachter/onboarding/buero', destination: '/gutachter/willkommen', permanent: true },
      { source: '/gutachter/einstellungen/embed/:id/tracking-anleitung', destination: '/gutachter/einstellungen/embed/:id', permanent: true },
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
      // AAR-477 (17.07.26): Der fruehere fortsetzen-Stopgap (308 auf den Funnel-Start,
      // Token verworfen) ist raus — der Pfad ist jetzt eine echte Route (reminder_token
      // -> kanonischer FlowLink). Ein Redirect hier liefe VOR dem Routing und wuerde
      // die Route ueberschatten. Siehe src/app/schaden-melden/fortsetzen/[token]/route.ts.
      // AAR-939: /sv-portal stillgelegt — Embed-Verwaltung + Anfragen ins
      // Gutachter-Cockpit gezogen (gutachter/einstellungen/embed). HTTP-308
      // statt RSC-Redirect-Stub (Memory-Lehre AAR-889) — Bookmarks/Links
      // brechen nicht; Query-Strings (?variante=) behält Next automatisch.
      { source: '/sv-portal', destination: '/gutachter/einstellungen/embed', permanent: true },
      { source: '/sv-portal/anfragen', destination: '/gutachter/einstellungen/embed/anfragen', permanent: true },
      { source: '/sv-portal/embed-sites', destination: '/gutachter/einstellungen/embed', permanent: true },
      { source: '/sv-portal/embed-sites/:path*', destination: '/gutachter/einstellungen/embed/:path*', permanent: true },
      // Werkstatt-Konsolidierung (06.07.): "Meine Vermittlungen" in "Auftraege" vereint.
      // Als HTTP-308 statt RSC-redirect()-Stub: die page.tsx mit redirect('/werkstatt/auftraege')
      // traf exakt die AAR-889-Falle oben (RSC-Redirect-Stub triggert React-#310/#418) — der
      // Prod-Smoke 06.07. bestaetigte 200 mit leerer Shell + KEINEN Redirect. page.tsx geloescht.
      { source: '/werkstatt/vermittlungen', destination: '/werkstatt/auftraege', permanent: true },
      // Kunde-Portal (SP4 1+): /kunde/einstellungen wurde nach /kunde/profil konsolidiert.
      // Als HTTP-308 statt RSC-redirect()-Stub — die page.tsx mit redirect('/kunde/profil') traf
      // exakt dieselbe AAR-889-Falle (leere 200-Shell, kein Redirect; Prod-Smoke 07.07. als
      // test-kunde bestaetigt). page.tsx geloescht.
      { source: '/kunde/einstellungen', destination: '/kunde/profil', permanent: true },
      // Gutachter-Onboarding (ARCH-1, seit 04.2026): /gutachter/onboarding war ein data-driven
      // RSC-redirect()-Router (4 SV-State-Faelle) -> traf die AAR-889-Falle (Prod-Smoke 07.07. als
      // smoke-sv: leere 200-Shell, kein Redirect). Der aktive Flow liegt eh in /gutachter/willkommen,
      // das ALLE Faelle selbst routet (freigeschaltet->/gutachter Z.160, no-sv Z.57, sonst Steps).
      // Statischer 308 dorthin + page.tsx geloescht.
      { source: '/gutachter/onboarding', destination: '/gutachter/willkommen', permanent: true },
      // Kunde-Portal (AAR-450): /kunde/termin (Termin-Liste) wurde aus der Nav entfernt — Termine
      // leben jetzt in den Fall-Karten. Als HTTP-308 statt permanentRedirect()-Stub: die page.tsx
      // traf die AAR-889-Falle (leere 200-Shell, kein Redirect; Prod-Smoke 07.07. als test-kunde
      // bestaetigt). Exakt-Match -> die Token-Subroute /kunde/termin/[token] (WhatsApp-Magic-Links
      // fuer SV-Termin-Tracking) bleibt unberuehrt.
      { source: '/kunde/termin', destination: '/kunde', permanent: true },
      // /flotte-Partner-Portal (AAR-956 Layer 0): Exakt-Match-Redirect auf die Fleet-View.
      // Exakt (kein :path*) damit /flotte/flotte und spätere Sub-Routen (Layer 1/2) live bleiben.
      { source: '/flotte', destination: '/flotte/flotte', permanent: false },
    ]
  },
};

const withIntl = withNextIntl(nextConfig);

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withIntl, { silent: true })
  : withIntl;
