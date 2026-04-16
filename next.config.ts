import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, { silent: true })
  : nextConfig;
