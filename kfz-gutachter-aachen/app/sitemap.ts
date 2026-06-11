import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { CLUSTER } from '@/lib/cluster'

// sitemap.xml — Hub (/) + alle Spoke-Pages (/lp/{slug}/). Die Hauptstadt-Spoke
// existiert nicht (= Hub), daher nur Nicht-Hauptstaedte. = 12 URLs (1 + 11).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const hub: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
  ]
  const spokes: MetadataRoute.Sitemap = CLUSTER.cities
    .filter((c) => !c.main)
    .map((c) => ({
      url: `${SITE.url}/lp/${c.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }))
  return [...hub, ...spokes]
}
