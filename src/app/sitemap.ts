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
    // Schadensreport — Datenpublikation, hoher GEO-Hebel
    {
      url: `${SITE_URL}/schadensreport-2026`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    // Kfz-Gutachter Pillar + Themen-Pages + Stadt-Landingpages
    {
      url: `${SITE_URL}/kfz-gutachter`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${SITE_URL}/kfz-gutachter/kosten`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/kfz-gutachter/ablauf`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/kfz-gutachter/wertminderung`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    ...STAEDTE.map((s) => ({
      url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
    })),
    // Gutachter-Partner-Recruiting (Marketing-Seite + Subdomain)
    {
      url: `${SITE_URL}/gutachter-partner`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://gutachter.claimondo.de/',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Legal-Pages — fuer maschinenlesbare Vollstaendigkeit
    {
      url: `${SITE_URL}/impressum`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/datenschutz`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/agb`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/nutzungsbedingungen`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
