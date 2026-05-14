// Next.js 16 Instrumentation-Hook — registriert die Sentry-Init für Server-
// und Edge-Runtime UND leitet RSC-/Server-Action-Render-Errors an Sentry
// weiter. Ohne diese Datei werden Server-Component-Render-Fehler nur in
// stdout (pm2-Log) geschrieben, landen aber NICHT in Sentry — genau das war
// am 13.05.2026 der Befund (22 326x Digest 249001202 EmptyState-Crash in
// PM2, 0 Issues in Sentry-Org). Siehe docs/13.05.2026/sentry-rsc-capture-
// workflow.md für die volle Diagnose und das Action-Item-Set.
//
// API-Referenzen:
//   - Next.js 16 instrumentation: node_modules/next/dist/docs/.../instrumentation.md
//   - @sentry/nextjs 10.48 captureRequestError: node_modules/@sentry/nextjs/
//     build/cjs/common/captureRequestError.js
//
// Die `sentry.server.config.ts` / `sentry.edge.config.ts` bleiben unverändert
// — wir laden sie hier dynamisch, damit `Sentry.init` zuverlässig vor jedem
// Server-Render läuft (vorher hat Next.js 16 den Auto-Loader nicht mehr
// zuverlässig getroffen, das war der eigentliche Bug).
//
// 13.05.2026 round 2: Datei jetzt unter `src/instrumentation.ts` (statt
// Repo-Root). Next.js mit `src/`-Konvention sucht hier — root-level Variante
// wurde nicht als Top-Level-Instrumentation erkannt, sondern nur als shared
// chunk gebundlet (kein `.next/server/instrumentation.js` erzeugt).
// Imports der Sentry-Configs (im Repo-Root) deshalb mit `../`-Prefix.

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
  // eslint-disable-next-line no-console
  console.log(`[instrumentation] register() fired (runtime=${process.env.NEXT_RUNTIME})`)
}

export const onRequestError = Sentry.captureRequestError
