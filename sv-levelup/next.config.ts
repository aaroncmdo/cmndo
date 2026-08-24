import type { NextConfig } from 'next'

// sv-levelup.claimondo.de — Standalone Next.js 16. Eigener Build, eigener
// Deploy, eigener PM2-Prozess (Muster: claimondo-marketing :3006).
// `output: 'standalone'` erzeugt .next/standalone/server.js.
const nextConfig: NextConfig = {
  output: 'standalone',

  // Workspace-Root auf dieses Projekt pinnen. Ohne das waehlt Next im Worktree
  // den claimondo-v2-Root (mehrere package-lock.json sichtbar) und traced
  // `output: standalone` vom falschen Verzeichnis — auf dem VPS fehlten dann
  // Files. Uebernommen aus claimondo-marketing/next.config.ts.
  turbopack: {
    root: __dirname,
  },

  // Security-Header. Der Check ist eine oeffentliche Property; noindex setzt
  // erst /plan/[token] und /auswertung/[token] per Metadata (R-P, Design-Spec §5.3).
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=(), payment=(), usb=()' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ]
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
