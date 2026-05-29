import type { NextConfig } from 'next'

// Kfz-Gutachter Wuppertal · Standalone Next.js 16 (Cluster-Master, Pattern wie
// autounfall-io). Eigener Build/Deploy/Server-Prozess auf dem VPS als PM2
// `kfz-gutachter-wuppertal:3003` → kfz-unfallgutachter-wuppertal.de.
// `output: 'standalone'` erzeugt .next/standalone/server.js (PM2-Entrypoint).
const nextConfig: NextConfig = {
  output: 'standalone',

  // Workspace-Root auf dieses Projekt pinnen. Sonst waehlt Next im Monorepo/
  // Worktree den claimondo-v2-Root (mehrere package-lock.json sichtbar) und
  // baut `output: standalone` aus dem falschen Verzeichnis — dann fehlen auf
  // dem VPS Files (Lektion autounfall-io WP-8).
  turbopack: {
    root: __dirname,
  },

  // Security-Header fuer die Public-Marketing-Property (Lighthouse-Best-Practice
  // + DSGVO). CSP bewusst NICHT enforced: Leaflet/Tile-CDN + Tag-Loader brauchen
  // explizite Quellen — separater Audit bei Aktivierung (analog autounfall-io).
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
