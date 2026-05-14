import type { Metadata } from 'next'
import { DynamicWizard } from '@/components/onboarding/DynamicWizard'
import { KartenWizardToggle } from '@/components/onboarding/KartenWizardToggle'
import {
  serviceSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import { ladeSvLeads, ladeAktiveSVs } from '@/lib/actions/gutachter-finder-actions'
import { GutachterFinderMapClient } from './GutachterFinderMapClient'

export const metadata: Metadata = {
  title: 'Kfz-Gutachter finden in Ihrer Nähe — sofort & zertifiziert',
  description:
    'Auf der Karte freien Kfz-Sachverständigen finden. 62+ Partner mit Iso-Einsatzgebieten, Termin < 48 h, 0 € für unverschuldet Geschädigte (§249 BGB).',
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
    canonical: `${SITE_URL}/gutachter-finden`,
    ...buildLanguageAlternates('/gutachter-finden'),
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/gutachter-finden`,
    title: 'Kfz-Gutachter finden — sofort & in Ihrer Nähe',
    description:
      'Karte aller verfügbaren Sachverständigen in Deutschland. Termin in unter 48h. Kostenfrei für unverschuldet Geschädigte.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kfz-Gutachter finden — sofort & in Ihrer Nähe',
    description: 'Karte aller verfügbaren Sachverständigen in Deutschland. Termin in unter 48h.',
  },
}

// 2026-05-11: Mapbox-Karte (Vollbild) + DynamicWizard im Sidebar-Panel.
// Karte zeigt 62 sv_leads als Marker + Iso-Einsatzgebiete als Halos.
// SEO-H1 bleibt als sr-only, Visual-H1 ist im GutachterFinderMapClient.
export default async function GutachterFindenPage() {
  const [svLeadsResult, aktiveSVsResult] = await Promise.all([
    ladeSvLeads(),
    ladeAktiveSVs(),
  ])
  const svLeads = svLeadsResult.ok ? svLeadsResult.data : []
  const aktiveSVs = aktiveSVsResult.ok ? aktiveSVsResult.data : []

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachter-Vermittlung',
            description:
              'Sofort-Vermittlung an einen unabhängigen Kfz-Sachverständigen in Ihrer Nähe. Über 60 zertifizierte Sachverständige bundesweit, Termin in unter 48 Stunden, kostenfrei für unverschuldet Geschädigte gemäß §249 BGB.',
            url: `${SITE_URL}/gutachter-finden`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Gutachter finden', url: '/gutachter-finden' },
          ]),
        ])}
      />
      <h1 className="sr-only">
        Kfz-Gutachter in Ihrer Nähe finden — sofort buchen, kostenfrei nach §249 BGB
      </h1>

      <GutachterFinderMapClient
        svLeads={svLeads}
        aktiveSVs={aktiveSVs}
        // AAR-902: Toggle zwischen Termin-direkt-buchen (DynamicWizard,
        // Default) und Schnell-Anfrage (Mini-Wizard mit Magic-Link).
        // Termin-Funktionalitaet bleibt erhalten — Aaron-Feedback
        // 14.05.2026 "ineinanderfuehren, beides ist wichtig".
        wizardSlot={
          <KartenWizardToggle
            dynamicWizard={<DynamicWizard flowKey="gutachter-finden" />}
          />
        }
      />
    </>
  )
}
