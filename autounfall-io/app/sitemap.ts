import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { getAllArticles } from '@/lib/articles'
import { getAllDecoders } from '@/lib/decoders'
import { getRestRoutes } from '@/lib/rest'

// sitemap.xml (Next generiert /sitemap.xml) — nur INDEXIERBARE Routen.
// noindex-Routen (PSEO `kfz-unfall/[stadt]/[typ]`, Leadmagnete, Selbstanzeige,
// /unfall-assistance) werden NICHT aufgenommen. Decoder/Hubs kommen mit WP-3/7 dazu.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE.url}`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE.url}/impressum`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE.url}/datenschutz`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    // WP-4: interaktive Tools (indexierbar; /unfall-assistance ist noindex → raus).
    { url: `${SITE.url}/rechner`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE.url}/kuerzungs-checker`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE.url}/unfallbericht`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    {
      url: `${SITE.url}/schadenfreiheitsklasse/rechner`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]
  // WP-2: 71 portierte Artikel (flat-canonical), je mit eigenem dateModified.
  const articleRoutes: MetadataRoute.Sitemap = getAllArticles().map((a) => ({
    url: `${SITE.url}/${a.slug}`,
    lastModified: new Date(a.dateModified),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))
  // WP-3: Versicherer-Decoder-Hub + 20 Decoder.
  const decoderRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/versicherer-decoder`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...getAllDecoders().map((d) => ({
      url: `${SITE.url}/versicherer-decoder/${d.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
  // WP-7: Pillars + Master-Hubs + SF-Versicherer + nested-Artikel (alle indexierbar).
  const restRoutes: MetadataRoute.Sitemap = getRestRoutes().map((route) => ({
    url: `${SITE.url}${route}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))
  return [...staticRoutes, ...articleRoutes, ...decoderRoutes, ...restRoutes]
}
