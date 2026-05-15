import * as Sentry from '@sentry/nextjs'
import { loadEnvConfig } from '@next/env'

// 13.05.2026 Sentry-Capture-Fix:
// Next.js standalone-server.js lädt `.env.local` NICHT automatisch beim Boot —
// erst zur Render-Zeit übers interne next-server.js. instrumentation.ts:register()
// läuft aber vor dem ersten Render, deshalb war `process.env.NEXT_PUBLIC_SENTRY_DSN`
// zur Init-Zeit `undefined`, der Guard fiel auf false, `Sentry.init` wurde nie
// aufgerufen, kein RSC-Capture (Befund: 0 Sentry-Issues trotz 22 326 Errors
// in pm2-Logs am 13.05.). Phase-1-Beweis: bare `node -e 'process.env.X'`
// im standalone-cwd → UNDEFINED; mit explizitem `loadEnvConfig` → SET.
//
// Fix: idempotent `loadEnvConfig(process.cwd())` aufrufen, bevor wir auf
// process.env zugreifen. Im dev-Modus ist Next.js schon vorgelaufen und
// loadEnvConfig findet nichts Neues — no-op. Im standalone-prod-Modus
// populiert es process.env aus dem .env.local-Symlink. Plus serverseitiges
// `SENTRY_DSN` als Fallback akzeptieren (NEXT_PUBLIC_* ist eigentlich für
// Client-Bundles gedacht).
loadEnvConfig(process.cwd())

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

// 15.05.2026 Noise-Filter (Sentry-Issues #3 #5 #6 in claimondo-Org waren reines
// Rauschen, kein User-Impact):
//   - Client-Disconnects ('aborted' aus abortIncoming, 'failed to pipe response'
//     aus pipeToNodeResponse): Browser/Bots schließen die Verbindung mitten in
//     der Response. Mechanism auto.function.nextjs.on_request_error.
//   - Node-24.14-Webstreams-Race auf /_not-found ('controller[kState].transform-
//     Algorithm is not a function'): tritt nur in lokalen Playwright-HeadlessChrome-
//     Smokes auf, nicht auf Prod-VPS (der läuft Node 20.20.1).
// → ignoreErrors droppt diese Events vor dem Send. Sentry-Quota schonen.
//
// beforeSend droppt zusätzlich ALLE Events aus environment=development —
// lokale Aaron-Laptop-Smokes sind kein Produktiv-Signal, Sentry ist für Prod.

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'NetworkError when attempting to fetch',
      // Connection-Aborts
      'failed to pipe response',
      'aborted',
      // Node-24-Webstreams-Race (dev-only, siehe Memory feedback_proxy_stub_callable)
      'controller[kState].transformAlgorithm is not a function',
    ],
    beforeSend(event) {
      if (event.environment === 'development') return null
      return event
    },
  })
  // eslint-disable-next-line no-console
  console.log(`[sentry] server init OK (dsn ${dsn.slice(0, 40)}…, env ${process.env.NODE_ENV})`)
} else {
  // eslint-disable-next-line no-console
  console.warn('[sentry] server init SKIPPED — weder SENTRY_DSN noch NEXT_PUBLIC_SENTRY_DSN gesetzt')
}
