import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/jsonld'
import { STAEDTE } from './kfz-gutachter/staedte'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/gutachter-finden`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${SITE_URL}/vorteile`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/wie-es-funktioniert`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ueber-uns`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/schaden-melden`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    // Kfz-Gutachter Pillar + Stadt-Landingpages (SEO-Hub)
    {
      url: `${SITE_URL}/kfz-gutachter`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    ...STAEDTE.map((s) => ({
      url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    // Gutachter-Partner-Subdomain
    {
      url: 'https://gutachter.claimondo.de/',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]
}
