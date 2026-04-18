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
    ]
  },
};

const withIntl = withNextIntl(nextConfig);

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withIntl, { silent: true })
  : withIntl;
