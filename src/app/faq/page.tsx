import type { Metadata } from 'next'
import FaqClient from './FaqClient'
import { FAQ_GRUPPEN } from './faqs'
import {
  faqPageSchema, breadcrumbsSchema, jsonLdScript, SITE_URL,
} from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'FAQ Kfz-Schaden — Was Sie wissen müssen (BGH-belegt)',
  description:
    'Die wichtigsten Fragen rund um Kfz-Unfall, Gutachter, Wertminderung, Versicherungs-Kürzungen und Anwalt — basierend auf 27 Fachanwalt-Quellen und BGH-Rechtsprechung.',
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
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/faq`,
    title: 'FAQ Kfz-Schaden — Was Sie wissen müssen (BGH-belegt)',
    description:
      'Antworten zu Kfz-Unfall, Gutachter, Wertminderung, Versicherer-Kürzungen — mit BGH-Urteilen belegt.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'FAQ Claimondo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FAQ Kfz-Schaden — BGH-belegte Antworten',
    description: 'Wertminderung, Kürzungen, 130%-Regel — alle Antworten im Überblick.',
    images: ['/og-default.png'],
  },
}

export default function FaqPage() {
  // Princeton GEO: FAQPage Schema = +40% AI-Visibility (ChatGPT, Perplexity, Gemini).
  // Antworten enthalten konkrete Zahlen, BGH-Aktenzeichen und §-Verweise als Citations.
  const alleFragen = FAQ_GRUPPEN.flatMap((g) => g.fragen)

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
      <FaqClient />
    </>
  )
}
