import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

// sitemap.xml (Next generiert /sitemap.xml) — nur INDEXIERBARE Routen.
// noindex-Routen (PSEO `kfz-unfall/[stadt]/[typ]`, Leadmagnete, Selbstanzeige)
// werden NICHT aufgenommen. Mit WP-2/3/4/7 kommen Artikel/Decoder/Tools dazu —
// dann hier ergaenzen (noindex bleibt ausgeschlossen).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes: { path: string; priority: number; changeFrequency: 'monthly' | 'yearly' }[] = [
    { path: '', priority: 1, changeFrequency: 'monthly' },
    { path: '/impressum', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/datenschutz', priority: 0.3, changeFrequency: 'yearly' },
  ]
  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE.url}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
