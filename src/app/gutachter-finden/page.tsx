import type { Metadata } from 'next'
import { GutachterFinderClient } from './GutachterFinderClient'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import {
  serviceSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL,
} from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Kfz-Gutachter finden in Ihrer Nähe — sofort & zertifiziert',
  description:
    'Auf der Karte freien Kfz-Sachverständigen finden. 89+ DAT-Experten bundesweit, Termin < 48 h, 0 € für unverschuldet Geschädigte (§249 BGB).',
  keywords: [
    'Kfz-Gutachter finden',
    'Sachverständiger in der Nähe',
    'Unfallgutachter',
    'DAT-Experte',
    'Kfz-Sachverständiger Köln',
    'Kfz-Sachverständiger Düsseldorf',
    'Kfz-Sachverständiger NRW',
    'unabhängiger Gutachter',
    'Schadensgutachten',
    'Wertminderung berechnen',
    'Karte Sachverständige',
  ],
  alternates: {
    canonical: '/gutachter-finden',
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/gutachter-finden`,
    title: 'Kfz-Gutachter finden — sofort & in Ihrer Nähe',
    description:
      'Karte aller verfügbaren Sachverständigen in Deutschland. Termin in unter 48h. Kostenfrei für unverschuldet Geschädigte.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Gutachter finden' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kfz-Gutachter finden — sofort & in Ihrer Nähe',
    description: 'Karte aller verfügbaren Sachverständigen in Deutschland. Termin in unter 48h.',
    images: ['/og-default.png'],
  },
}

export default async function GutachterFindenPage() {
  const [svResult, leadsResult] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])

  const aktiveSVs = svResult.ok ? svResult.data : []
  const svLeads = leadsResult.ok ? leadsResult.data : []

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          // localBusinessSchema kommt global aus layout.tsx
          serviceSchema({
            name: 'Kfz-Gutachter-Vermittlung',
            description:
              'Sofort-Vermittlung an einen unabhängigen Kfz-Sachverständigen in Ihrer Nähe. Über 50 zertifizierte DAT-Experten bundesweit, Termin in unter 48 Stunden, kostenfrei für unverschuldet Geschädigte gemäß §249 BGB.',
            url: `${SITE_URL}/gutachter-finden`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Gutachter finden', url: '/gutachter-finden' },
          ]),
        ])}
      />
      <GutachterFinderClient aktiveSVs={aktiveSVs} svLeads={svLeads} />
    </>
  )
}
