import type { Metadata } from 'next'
import {
  serviceSchema, breadcrumbsSchema,
  jsonLdScript, GUTACHTER_LANDING_URL,
} from '@/lib/seo/jsonld'
import GutachterPartnerClient from './GutachterPartnerClient'

export const metadata: Metadata = {
  title: 'Als Kfz-Sachverständiger Partner werden — Warteliste',
  description:
    'Jetzt auf die Warteliste setzen: Bundesweites SV-Netzwerk von Claimondo. Aufträge direkt vermittelt, ohne Akquise. DAT-Experten, BVSK-Mitglieder und IHK-zertifizierte Gutachter willkommen.',
  keywords: [
    'Kfz-Sachverständiger werden',
    'SV-Netzwerk beitreten',
    'Gutachter Aufträge',
    'DAT-Experte Partner',
    'BVSK Partner',
    'Claimondo SV-Partner',
    'Kfz-Gutachter selbstständig',
    'Aufträge Sachverständiger',
    'Partner werden Sachverständiger',
  ],
  alternates: {
    canonical: `${GUTACHTER_LANDING_URL}/`,
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${GUTACHTER_LANDING_URL}/`,
    title: 'Als Kfz-Sachverständiger Partner werden — Claimondo',
    description:
      'Aufträge ohne Akquise. Tragen Sie sich in das Claimondo SV-Netzwerk ein — wir vermitteln direkt in Ihrem Einzugsgebiet.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Als Kfz-Sachverständiger Partner werden — Claimondo',
    description:
      'Aufträge ohne Akquise. Tragen Sie sich in das Claimondo SV-Netzwerk ein.',
  },
}

export default function GutachterPartnerPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Claimondo SV-Partner-Netzwerk',
            description:
              'Kfz-Sachverständige tragen sich in das Claimondo-Netzwerk ein und erhalten Aufträge direkt ohne Eigenakquise. Über 89 DAT-Experten bundesweit.',
            url: `${GUTACHTER_LANDING_URL}/`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Sachverständiger werden', url: `${GUTACHTER_LANDING_URL}/` },
          ]),
        ])}
      />
      <h1 className="sr-only">
        Als Kfz-Sachverständiger Claimondo-Partner werden — Warteliste eintragen
      </h1>
      <GutachterPartnerClient />
    </>
  )
}
