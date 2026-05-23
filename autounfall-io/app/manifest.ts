import type { MetadataRoute } from 'next'

// PWA-Manifest (Next generiert /manifest.webmanifest + verlinkt es automatisch).
// STANDALONE: kein Claimondo. Aktuell nur das SVG-Icon — die Raster-PWA-Icons
// (icon-192/512/maskable, apple-touch 180) liegen in den 513-MB-Drive-Assets
// und werden mit dem Bild-Import (spaeteres WP) ergaenzt; bis dahin KEINE
// 404-Referenzen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'autounfall.io — Wissens-Hub für Unfall-Geschädigte',
    short_name: 'autounfall.io',
    description:
      'Unabhängiger redaktioneller Wissens-Hub für Unfall-Geschädigte: BGH-Urteile, § 249 BGB, Versicherer-Taktiken — quellenbasiert und werbefrei.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'de',
    dir: 'ltr',
    orientation: 'portrait-primary',
    theme_color: '#1E293B',
    background_color: '#FAF7F0',
    categories: ['education', 'news', 'lifestyle'],
    icons: [{ src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' }],
  }
}
