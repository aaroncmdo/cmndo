import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { CLUSTER } from '@/lib/cluster'

// sitemap.xml — Hub (/) + Finder (/gutachter-finden) + alle Spoke-Pages
// (/lp/{slug}/). Die Hauptstadt-Spoke existiert nicht (= Hub), daher nur
// Nicht-Hauptstaedte.
//
// ⚠ Bewusst OHNE feste Gesamtzahl: die Staedtezahl ist je Cluster verschieden
// (Koeln 9 Spokes, andere mehr oder weniger). Der fruehere Kommentar behauptete
// „12 URLs (1 + 11)" — real waren es 10. Eine Zahl im Kommentar veraltet still,
// sobald eine Stadt dazukommt, und niemand prueft sie nach.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const hub: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    // Der Finder laeuft seit 21.08.2026 eigenstaendig unter dieser Domain
    // (vorher fuehrte nur ein Link auf claimondo.de hinaus). Hohe Prioritaet:
    // er ist das Werkzeug, auf das die ganze Domain hinauslaeuft.
    {
      url: `${SITE.url}/gutachter-finden`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
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
