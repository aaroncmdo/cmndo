import type { MetadataRoute } from 'next'
import { SITE_URL, GUTACHTER_LANDING_URL, MAKLER_LANDING_URL } from '@/lib/seo/jsonld'
import { STAEDTE } from './kfz-gutachter/staedte'

const HREFLANG_LOCALES = ['de-DE', 'en-US', 'ar', 'tr-TR', 'pl-PL', 'ru-RU'] as const

function langAlternates(path: string): Record<string, string> {
  const url = `${SITE_URL}${path}`
  const result: Record<string, string> = { 'x-default': url }
  for (const locale of HREFLANG_LOCALES) {
    result[locale] = url
  }
  return result
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
      alternates: { languages: langAlternates('/') },
    },
    {
      url: `${SITE_URL}/gutachter-finden`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
      alternates: { languages: langAlternates('/gutachter-finden') },
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
      alternates: { languages: langAlternates('/faq') },
    },
    {
      url: `${SITE_URL}/ueber-uns`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
      alternates: { languages: langAlternates('/ueber-uns') },
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
      alternates: { languages: langAlternates('/schadensreport-2026') },
    },
    // Kfz-Gutachter Pillar + Themen-Pages + Stadt-Landingpages
    {
      url: `${SITE_URL}/kfz-gutachter`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
      alternates: { languages: langAlternates('/kfz-gutachter') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/kosten`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/kosten') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/ablauf`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/ablauf') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/wertminderung`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/wertminderung') },
    },
    ...STAEDTE.map((s) => ({
      url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
    })),
    // Google-Ads-Landing Köln — dedizierte Konversions-Page (Phase Maik Pramor)
    {
      url: `${SITE_URL}/kfz-gutachter-koeln`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    },
    // Recruiting-Subdomains — eigene kanonische URLs (claimondo.de/<pfad> 301t dorthin)
    {
      url: `${GUTACHTER_LANDING_URL}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${MAKLER_LANDING_URL}/`,
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
