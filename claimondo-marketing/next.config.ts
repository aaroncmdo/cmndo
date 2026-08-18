import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// AAR-459-Pattern: next-intl v4 Plugin -> registriert ./i18n/request.ts (Cookie-Locale).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// autounfall.io · Standalone Next.js 16 (Property 2). Eigener Build/Deploy/
// Server-Prozess — KEIN Mono-Repo, KEIN (hub)-Routing. WP-8 deployt das als
// PM2 `autounfall-io:3002` nach /var/www/autounfall.io. `output: 'standalone'`
// erzeugt .next/standalone/server.js (analog claimondo-v2).
const nextConfig: NextConfig = {
  output: 'standalone',

  // Workspace-Root auf dieses Projekt pinnen. Sonst waehlt Next im Worktree den
  // claimondo-v2-Root (mehrere package-lock.json sichtbar) und tract `output:
  // standalone` vom falschen Verzeichnis — auf dem VPS (WP-8) fehlten dann Files.
  turbopack: {
    root: __dirname,
  },

  // Security-Header fuer die Public-Marketing-Property (Lighthouse-Best-Practice
  // + DSGVO). CSP bewusst NICHT gesetzt: Plausible braucht eine explizite
  // Quelle — separater Audit wenn enforced (analog claimondo-v2).
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      {
        // AAR-956: geolocation an die app.claimondo.de-Embed-iframe (Gutachter-Finder) delegieren.
        // Der Finder braucht den User-Standort fuer Karten-Zentrierung + Route zum naechsten SV.
        // `(self)` allein erlaubt nur die eigene Origin → die Cross-Origin-iframe wird sonst
        // blockiert TROTZ allow="geolocation" ("blocked because of a permissions policy").
        key: 'Permissions-Policy',
        value: 'geolocation=(self "https://app.claimondo.de"), camera=(), microphone=(), payment=(), usb=()',
      },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ]
    return [{ source: '/:path*', headers: securityHeaders }]
  },

  // Brand-Domain-Discovery: claimondo.de/openapi.json UND claimondo.de/api/v1/openapi.json ->
  // kanonische OpenAPI der oeffentlichen Funnel-API auf dem Portal-Host. AI-Crawler/Action-
  // Importer (ChatGPT-GPT-Builder etc.), die die OpenAPI auf der Brand-Domain raten — mit ODER
  // ohne /api/v1-Prefix — landen so beim echten Spec statt im 404. Single Source bleibt das
  // Portal (src/app/api/v1/openapi.json) — kein Duplikat. 308 (permanent).
  async redirects() {
    return [
      {
        source: '/openapi.json',
        destination: 'https://app.claimondo.de/api/v1/openapi.json',
        permanent: true,
      },
      {
        // doc34-Custom-GPT-Setup + haeufigster Rate-Versuch: die volle Portal-Pfad-URL auf der
        // Brand-Domain (claimondo.de/api/v1/openapi.json 404te bisher — Marketing hat kein /api/v1).
        source: '/api/v1/openapi.json',
        destination: 'https://app.claimondo.de/api/v1/openapi.json',
        permanent: true,
      },
      {
        // AAR-477 P1 (17.07.26): Fortsetzen-Deeplink der Lead-Nurture-Mails. Faellt die
        // Mail-Base auf die Marketing-Domain zurueck (kein NEXT_PUBLIC_APP_URL im Cron-Env),
        // landet der Klick hier — die Route (reminder_token -> FlowLink) lebt in der App.
        // 307 (permanent: false), NICHT cachen: das Ziel ist ein dynamischer Resolver.
        source: '/schaden-melden/fortsetzen/:token',
        destination: 'https://app.claimondo.de/schaden-melden/fortsetzen/:token',
        permanent: false,
      },
    ]
  },

  // Domain-Verifikation fuer die OpenAI-Plugin-/Apps-Directory-Einreichung
  // (docs/superpowers/specs/2026-06-18-mcp-active-in-chat-design.md, Baustein 6 —
  // der letzte offene Baustein: die Bausteine 1-5 + 8-10 sind live).
  //
  // REWRITE statt Ordner `app/.well-known/`: ein Segment, das mit '.' beginnt, ist
  // im App-Router kein verlaesslicher Routen-Name. REWRITE statt REDIRECT: OpenAI
  // erwartet den Token als Body dieser URL — ein 30x wuerde die Pruefung brechen
  // (anders als bei /openapi.json oben, wo ein 308 auf den Portal-Host korrekt ist).
  async rewrites() {
    return [
      {
        source: '/.well-known/openai-apps-challenge',
        destination: '/api/openai-apps-challenge',
      },
      {
        // Domain-Verifikation der offiziellen MCP-Registry. Der Namespace
        // `de.claimondo/sv-finder` ist Reverse-DNS unserer Domain und verlangt
        // deshalb einen Eigentumsnachweis — wahlweise per DNS-TXT oder ueber
        // genau diese Datei. Wir nutzen den HTTP-Weg: kein DNS-Zugriff noetig,
        // sofort widerrufbar (ENV leeren).
        source: '/.well-known/mcp-registry-auth',
        destination: '/api/mcp-registry-auth',
      },
    ]
  },
}

export default withNextIntl(nextConfig)
