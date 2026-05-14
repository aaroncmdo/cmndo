# Sentry — RSC-Render-Errors capturen (Next.js 16 instrumentation)

**Stand 13.05.2026 16:13 UTC:** Sentry-Org `claimondo` (Projekt `javascript-nextjs`) hat **0 Issues** für die letzten 30 Tage, obwohl die SDK über `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` in beiden Deploy-Workflows konfiguriert ist und der heutige Kunde-Layout-Crash 22326 Server-Component-Render-Errors produziert hat (Digest 249001202) — keiner davon hat es zu Sentry geschafft.

Daraus folgt: ein toter Observability-Kanal genau dort, wo wir ihn am dringendsten brauchen.

## Was kaputt ist

Das aktuelle Setup nutzt das **alte Pre-15-Pattern**:

```
claimondo-v2/
  sentry.client.config.ts   # Sentry.init im Browser
  sentry.server.config.ts   # Sentry.init im Node-Server
  sentry.edge.config.ts     # Sentry.init im Edge-Runtime
  (instrumentation.ts FEHLT)
```

Bis Next.js 14 hat `@sentry/nextjs` diese drei `sentry.*.config.ts`-Files automatisch via Webpack-Wrapper geladen. **Ab Next.js 15** wird das Pattern deprecated, und ab **Next.js 16** wird der Server-Init nur noch verlässlich aufgerufen wenn ein `instrumentation.ts` im Repo-Root existiert und der Sentry-SDK von dort importiert wird.

Zusätzlich: das Pattern „RSC-Render-Errors zu Sentry schicken" braucht den expliziten Export `onRequestError` aus `instrumentation.ts` (Next.js-15+-API). Ohne den werden Render-Errors zwar von Next.js in `console.error` geloggt (das sehen wir in `pm2 logs`), aber nicht an Sentry weitergereicht. Genau der Befund hier.

## Repro-Beweis

```
# 13.05.2026 ~15:30 UTC, nach Kunde-Crash-Fix-Deploy
gh api repos/aaroncmdo/cmndo/actions/runs --jq '.workflow_runs[0:3]'  # alle deploys grün
mcp__sentry__search_issues --organizationSlug claimondo --naturalLanguageQuery "any issues at all from past 30 days"
# → No issues found

ssh root@vps 'grep -c "1699651472" /root/.pm2/logs/claimondo-v2-error.log'
# → 2145 Occurrences in pm2 log, 0 in Sentry
```

Das diskrepante Verhältnis ist die Diagnose.

## Fix-Workflow

### 1 · `instrumentation.ts` im Repo-Root anlegen

```ts
// instrumentation.ts  — Next.js 16 Pflicht für Server-Side Sentry-Capture
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// RSC-Render-Errors + Server-Action-Errors an Sentry weiterreichen.
// Ohne diesen Export landen sie nur in stdout (pm2-Log).
export const onRequestError = Sentry.captureRequestError
```

### 2 · `next.config.ts` prüfen

`@sentry/nextjs` braucht den `withSentryConfig`-Wrapper. Mindestens:

```ts
import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = { /* ... */ }

export default withSentryConfig(nextConfig, {
  org: 'claimondo',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Sentry braucht Source-Maps zum Symbolicate-n im Server-Build:
  sourcemaps: { disable: false },
  // Auth-Token kommt aus Env (SENTRY_AUTH_TOKEN), nicht ins Repo.
})
```

Falls schon vorhanden: `sourcemaps.disable` muss `false` (oder weggelassen) sein, damit auch Server-Bundles Sourcemaps haben — sonst sind die Stacks in Sentry minified-Garbage (`at stringify (<anonymous>)`).

### 3 · Source-Maps für Server-Bundle

Per Default uploaded `@sentry/nextjs` nur Client-Sourcemaps. Für RSC-Render-Errors brauchen wir Server-Sourcemaps. In `next.config.ts` zusätzlich:

```ts
const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,  // Client
  experimental: {
    serverSourceMaps: true,           // Server (Next.js 16, hinter Flag bis stable)
  },
}
```

Build-Zeit-Overhead: +20–40 s, +50–150 MB Output. Akzeptabel für die Observability-Klärung.

### 4 · Verifikations-Step

Nach Deploy:

```bash
# auf VPS: kurzen Fehler provozieren via /admin/test-sentry-route (falls vorhanden) oder echte Last
# danach in Sentry-MCP:
mcp__sentry__search_issues --organizationSlug claimondo --naturalLanguageQuery "errors in last 1 hour"
```

Erfolgreich wenn:
- Issue erscheint mit symbolicated Stack-Trace (Datei + Zeile, nicht `<anonymous>`)
- `release`-Tag matcht die deploy-Tag-Version
- Tags `environment=production`, `runtime=node` gesetzt

### 5 · Backfill — Digest 1699651472 aufdecken

Sobald Capture läuft, wartet man **eine** Runde Prod-Traffic ab (~15–30 min). Der RSC-Error mit Digest 1699651472 sollte dann in Sentry als Issue auftauchen, mit der konkreten Datei in welchem Server-Component eine `forwardRef`-Component als Prop-Value an einen Client-Child weitergeht (Pattern: `{$$typeof, render, displayName}` aus den PM2-Logs).

Wahrscheinliche Kandidaten — bei denen am ehesten ein Server-Component-renderer einen Lucide-Icon-Komponententyp (nicht JSX) als Prop weitergibt:
- `app/admin/finance/(hub)/page.tsx` Sub-Sections (`<FinanceClient chartData={...} />` etc.)
- `app/admin/_components/LeadPreiseVerteilungWidget.tsx` (Suspense'd, könnte Konfig durchreichen)
- `app/admin/_components/StripeConnectStatusWidget.tsx`
- Heuristik: jede Server-Component die irgendeine Map mit `icon: SomeLucideIcon`-Einträgen baut und an einen Client-Kind als ganzes Datenobjekt weitergibt

Sobald Sentry den richtigen File markiert, ist der Fix analog zum heutigen EmptyState-Fix (PR #937): das Server-Component erzeugt `<Icon icon={X} ... />` JSX **selbst** und passt nur die fertige ReactNode an den Client-Child weiter.

## Eigentliche Frage offen

Warum sind 22326 Occurrences von Digest 249001202 (EmptyState-Crash der heute war) auch NICHT in Sentry aufgetaucht? Heißt: das Problem ist nicht nur „onRequestError fehlt" — auch die *Client*-Side hat keine Capture. Wenn auch nach Step 1–4 keine Issues kommen, muss zusätzlich:

- `sentry.client.config.ts` — Init-Call beim Browser-Mount validieren (DevTools → Network → `https://*.ingest.sentry.io/`-Calls sehen?)
- DSN-Pfad: in Sentry-Project-Settings → SDK-Keys → DSN nochmal abgleichen mit `NEXT_PUBLIC_SENTRY_DSN` im VPS-Env
- `tunnel`-Option falls AdBlocker die Ingest-URL blocken (sehr häufig bei deutschen Endusern)

## Action Items

- [ ] `instrumentation.ts` im Repo-Root anlegen (Step 1) → eigener Branch `kitta/aar-sentry-rsc-capture`
- [ ] `withSentryConfig` in `next.config.ts` verifizieren / hinzufügen (Step 2)
- [ ] `experimental.serverSourceMaps: true` setzen (Step 3)
- [ ] Deploy, dann RSC-Capture-Verify via MCP (Step 4)
- [ ] Digest 1699651472 aus Sentry-Issue konkret pinpointen (Step 5)
- [ ] Falls auch nach Capture-Fix 0 Issues: Client-Side-Tunnel + DSN-Validierung (Step 6 oben)

## Referenz

- Next.js 16 instrumentation API: `node_modules/next/dist/docs/app/api-reference/file-conventions/instrumentation.md`
- `@sentry/nextjs` migration: <https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#instrumentationts>
- Heutiger Kunde-Crash-Runbook (mit dem dies aufgefallen ist): `docs/13.05.2026/smoke-claimondo-de/KUNDE-CRASH-RUNBOOK.md`
- PR #937 EmptyState-Fix als analoges Fix-Pattern: <https://github.com/aaroncmdo/cmndo/pull/937>

---

*Erstellt 13.05.2026 16:14 UTC nach Sentry-MCP-Investigation für Digest 1699651472.*
