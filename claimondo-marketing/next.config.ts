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
}

export default nextConfig
