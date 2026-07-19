import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { CLUSTER } from '@/lib/cluster'

// PWA-Manifest (Next generiert /manifest.webmanifest + verlinkt automatisch).
// BRIEF 08g: Cluster-Favicon-Set (PNG 192/512, Signet auf Cluster-Dunkel) —
// ersetzt den SVG-Fallback (Chrome warnte: SVG als Manifest-Icon invalid).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — Unfall-Gutachten ${CLUSTER.region}`,
    short_name: SITE.shortName,
    description:
      'Unabhängiger Kfz-Gutachter — gerichtsfestes Kfz-Gutachten, bei Unschuld 0 €. Anwalt & Mietwagen inklusive, Soforthilfe rund um die Uhr.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'de',
    dir: 'ltr',
    orientation: 'portrait-primary',
    theme_color: CLUSTER.themeColor,
    background_color: '#FBFAF8',
    categories: ['business', 'utilities'],
    icons: [
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
  }
}
