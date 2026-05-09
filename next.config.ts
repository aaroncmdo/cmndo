import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

// AAR-459 F1: next-intl v4 Plugin. Registriert `src/i18n/request.ts` als
// Server-Config (liest Cookie `claimondo-locale`, fallback 'de').
// URL-Locale-Präfix ist bewusst NICHT aktiviert — Sprache wird per Cookie
// geführt, damit `/`, `/flow/...`, `/schaden-melden` unverändert bleiben.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // VPS-Build: TS-Checker + ESLint werden im CI (GitHub Actions) geprüft,
  // auf dem RAM-limitierten VPS sparen wir den Check-Schritt.
  typescript: { ignoreBuildErrors: true },
  // eslint-Prop existiert in Next 16 TypeScript-Typen nicht mehr — cast nötig
  ...(({ eslint: { ignoreDuringBuilds: true } }) as object),
  // VPS-Deployment: standalone-Output bündelt nur die nötigsten node_modules
  // → kleines Deploy-Artefakt, kein node_modules-Upload nötig.
  output: 'standalone',
  // Dokument-Uploads (SA-Vorlage, Pflichtdokumente) erlauben bis 16 MB.
  // Next.js-Default ist 1 MB — Uploads > 1 MB werfen sonst clientseitig
  // „An unexpected response was received from the server" bevor die Action
  // überhaupt läuft.
  experimental: {
    serverActions: {
      bodySizeLimit: '16mb',
    },
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
      {
        source: '/admin/sv-onboarding',
        destination: '/admin/sachverstaendige/neu',
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
    ]
  },
};

const withIntl = withNextIntl(nextConfig);

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withIntl, { silent: true })
  : withIntl;
