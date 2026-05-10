import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

// AAR-459 F1: next-intl v4 Plugin. Registriert `src/i18n/request.ts` als
// Server-Config (liest Cookie `claimondo-locale`, fallback 'de').
// URL-Locale-Präfix ist bewusst NICHT aktiviert — Sprache wird per Cookie
// geführt, damit `/`, `/flow/...`, `/schaden-melden` unverändert bleiben.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /* KFZ-177: ignoreBuildErrors entfernt — tsc ist jetzt sauber */
  // Production-Source-Maps einschalten — damit User-Errors wie „an.map is not
  // a function" auf den echten File + Zeile zurückverfolgt werden können.
  // Erhöht die Bundle-Größe leicht, aber nur die .map-Files, die werden
  // nicht zum Client geladen außer DevTools öffnet sie.
  productionBrowserSourceMaps: true,
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
  // Feldmodus-3D-Packages (three, deck.gl, loaders.gl) werden erst installiert
  // wenn das Feature produktionsreif ist. Bis dahin als Server-External
  // markieren damit Turbopack keinen Build-Fehler wirft.
  serverExternalPackages: ['three', '@deck.gl/mapbox', '@deck.gl/geo-layers', '@loaders.gl/3d-tiles'],
  webpack(config) {
    // Client-Bundle: 3D-Packages als leere Module auflösen bis installiert.
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...config.resolve.alias,
      three: false,
      '@deck.gl/mapbox': false,
      '@deck.gl/geo-layers': false,
      '@loaders.gl/3d-tiles': false,
    }
    return config
  },
};

const withIntl = withNextIntl(nextConfig);

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withIntl, { silent: true })
  : withIntl;
