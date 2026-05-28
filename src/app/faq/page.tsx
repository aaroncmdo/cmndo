import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import FaqClient from './FaqClient'
import { FAQ_GRUPPEN } from './faqs'
import type { FaqGruppe } from './faqs'
import {
  faqPageSchema, breadcrumbsSchema, jsonLdScript, SITE_URL,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('faq.title'),
    description: t('faq.description'),
    keywords: [
      'Kfz-Unfall FAQ',
      'Wertminderung Auto',
      'BGH Kfz-Schaden',
      '§249 BGB',
      'UPE-Aufschläge',
      'Verbringungskosten',
      'HUK Versicherung Kürzung',
      'LVM Schaden',
      'AXA Versicherung',
      '130-Prozent-Regel',
      'Werkstattrisiko',
      'Schmerzensgeld HWS',
      'Fahrerflucht Schaden',
    ],
    alternates: {
      canonical: '/faq',
      ...buildLanguageAlternates('/faq'),
    },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/faq`,
      title: t('faq.title'),
      description: t('faq.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'FAQ Claimondo' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('faq.twitter_title'),
      description: t('faq.twitter_description'),
      images: ['/og-default.png'],
    },
  }
}

export default async function FaqPage() {
  // Princeton GEO: FAQPage Schema = +40% AI-Visibility (ChatGPT, Perplexity, Gemini).
  // JSON-LD-Schema bleibt auf FAQ_GRUPPEN (deutsch) — Structured Data fuer Crawler.
  // UI-Render via locale-aware groups aus Translations.
  const alleFragen = FAQ_GRUPPEN.flatMap((g) => g.fragen)

  const t = await getTranslations('faq')
  // t.raw gibt das Array 1:1 zurueck; cast auf FaqGruppe[] ist sicher da de.json
  // strukturell identisch mit FAQ_GRUPPEN ist.
  const groups = t.raw('groups') as FaqGruppe[]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          faqPageSchema(alleFragen),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'FAQ', url: '/faq' },
          ]),
        ])}
      />
      {/* H1 explizit in der Server-Component fuer Crawler/AI-Suchmaschinen.
          FaqClient rendert seinen eigenen Hero-H1 nochmal als Glass-Variante,
          aber der hier ist garantiert im initialen SSR-HTML. */}
      <h1 className="sr-only">Häufige Fragen zum Kfz-Schaden — BGH-belegt</h1>
      <FaqClient groups={groups} />
    </>
  )
}
