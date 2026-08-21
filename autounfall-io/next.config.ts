import type { NextConfig } from 'next'

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
        key: 'Permissions-Policy',
        value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
      },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ]
    return [{ source: '/:path*', headers: securityHeaders }]
  },

  // Monika-Chat-Widget FOOTPRINT-SAFE proxen: Script + Sounds + Submit/Tracking-API
  // -> app.claimondo.de. Das Widget leitet seinen embedBase aus dem eigenen Script-src
  // ab (autounfall.io/embed/monika.js), also laufen ALLE Runtime-Requests ueber
  // autounfall.io und werden hier serverseitig geproxt -> KEIN crawlbarer claimondo.de-
  // Ref im HTML (Entity-Lock). Spezifische Pfade (nicht /api/:path*), damit au.io-eigene
  // Routen nicht geschattet werden.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/embed/:path*', destination: 'https://app.claimondo.de/embed/:path*' },
        { source: '/api/anfrage-from-lp', destination: 'https://app.claimondo.de/api/anfrage-from-lp' },
        { source: '/api/embed-track', destination: 'https://app.claimondo.de/api/embed-track' },
        { source: '/api/embed/:path*', destination: 'https://app.claimondo.de/api/embed/:path*' },
      ],
    }
  },

  // AAR 08.07.2026: Artikel /gutachter-dat-expert entfernt (Marken-
  // Zertifizierungs-Claim) -> 301 auf den Gutachter-Ratgeber-Pillar (kein 404,
  // Link-Equity bleibt).
  //
  // Broken-Link-Crawl 21.08.2026: /gutachter/ war der meistverlinkte tote Link
  // ueberhaupt — der Footer + die RatgeberSection JEDER Cluster-LP zeigten
  // darauf (50 Seiten). Die Call-Sites zeigen jetzt direkt auf
  // /gutachter-ratgeber; dieser Redirect faengt zusaetzlich EXTERNE Backlinks,
  // die wir nicht umschreiben koennen. Exact-Match ohne :path* -> die
  // Geschwister /gutachter-ratgeber und /gutachter-finden bleiben unberuehrt.
  // Die Slash-Variante /gutachter/ normalisiert Next (trailingSlash=false)
  // vorher per 308 auf /gutachter, faellt also mit hier rein.
  async redirects() {
    return [
      { source: '/gutachter-dat-expert', destination: '/gutachter-ratgeber', permanent: true },
      { source: '/gutachter', destination: '/gutachter-ratgeber', permanent: true },
    ]
  },
}

export default nextConfig
