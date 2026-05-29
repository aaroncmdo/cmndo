import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { CLUSTER } from '@/lib/cluster'

// PWA-Manifest (Next generiert /manifest.webmanifest + verlinkt automatisch).
// Icons: SVG-Fallback bis Cluster-Favicon-Set (PNG) mit den Assets kommt.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — Unfall-Gutachten ${CLUSTER.region}`,
    short_name: SITE.shortName,
    description:
      'Unabhängiger Kfz-Gutachter — gerichtsfestes DAT-Gutachten, bei Unschuld 0 €. Anwalt & Mietwagen inklusive, Soforthilfe rund um die Uhr.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'de',
    dir: 'ltr',
    orientation: 'portrait-primary',
    theme_color: CLUSTER.themeColor,
    background_color: '#FBFAF8',
    categories: ['business', 'utilities'],
    icons: [{ src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' }],
  }
}
