import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import FaqClient from './FaqClient'
import { FAQ_GRUPPEN } from '@/lib/faq/faqs'
import type { FaqGruppe } from '@/lib/faq/faqs'
import {
  faqPageSchema, breadcrumbsSchema, jsonLdScript, SITE_URL,
} from '@/lib/seo/jsonld'
import { getRouteLastUpdatedISO } from '@/lib/seo/freshness'
import { localeAlternates, localeOpenGraph } from '@/lib/seo/alternates'

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
    alternates: await localeAlternates('/faq'),
    openGraph: {
      type: 'website',
      siteName: 'Claimondo',
      ...(await localeOpenGraph(`/faq`)),
      title: t('faq.title'),
      description: t('faq.og_description'),
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FAQ Claimondo' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('faq.twitter_title'),
      description: t('faq.twitter_description'),
      images: ['/opengraph-image'],
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
          faqPageSchema(alleFragen, {
            dateModified: getRouteLastUpdatedISO('/faq'),
            url: '/faq',
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'FAQ', url: '/faq' },
          ]),
        ])}
      />
      {/* ⚠ 30.08.2026 ENTFERNT: hier stand zusaetzlich ein `<h1 className="sr-only">`
          mit der Begruendung, der Hero-H1 des FaqClient sei nicht "garantiert im
          initialen SSR-HTML".

          Die Annahme ist widerlegt. `FaqClient` ist zwar eine Client-Component, wird
          von Next aber server-seitig VORGERENDERT — sein H1 steht im ausgelieferten
          HTML. Gemessen mit AI-Bot-User-Agent gegen prod:

              H1-Tags im ausgelieferten HTML: 2

          Damit erzeugte der Zusatz-H1 genau den Fehler, den er verhindern sollte:
          zwei H1 auf einer Seite (aufgefallen im GEO-Baseline-Lauf, `pagesMultiH1: 1`
          — /faq war die einzige Seite der Stichprobe mit dem Problem).

          Der sichtbare H1 traegt "Häufige Fragen – Antworten in unter 60 Sekunden";
          das Keyword "BGH-belegt" steht weiterhin im <title> und im trust_badge. */}
      <FaqClient groups={groups} />
    </>
  )
}
