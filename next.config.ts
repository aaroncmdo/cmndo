import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* KFZ-177: ignoreBuildErrors entfernt — tsc ist jetzt sauber */
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, { silent: true })
  : nextConfig;
