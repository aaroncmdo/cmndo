import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { getAllArticles } from '@/lib/articles'

// sitemap.xml (Next generiert /sitemap.xml) — nur INDEXIERBARE Routen.
// noindex-Routen (PSEO `kfz-unfall/[stadt]/[typ]`, Leadmagnete, Selbstanzeige)
// werden NICHT aufgenommen. Decoder/Tools/Hubs kommen mit WP-3/4/7 dazu.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE.url}`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE.url}/impressum`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE.url}/datenschutz`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
  // WP-2: 71 portierte Artikel (flat-canonical), je mit eigenem dateModified.
  const articleRoutes: MetadataRoute.Sitemap = getAllArticles().map((a) => ({
    url: `${SITE.url}/${a.slug}`,
    lastModified: new Date(a.dateModified),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))
  return [...staticRoutes, ...articleRoutes]
}
