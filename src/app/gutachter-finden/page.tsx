import type { Metadata } from 'next'
import { DynamicWizard } from '@/components/onboarding/DynamicWizard'
import {
  serviceSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

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
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
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
      <h1 className="sr-only">
        Kfz-Gutachter in Ihrer Nähe finden — sofort buchen, kostenfrei nach §249 BGB
      </h1>

      <div style={{
        minHeight: '100dvh',
        background: 'linear-gradient(160deg, #f8f9fb 0%, #eef1f6 100%)',
        padding: 'clamp(24px, 4vw, 56px) clamp(16px, 4vw, 32px)',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* Hero-Kopf */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(13,27,62,.06)', borderRadius: 999,
              padding: '8px 16px', marginBottom: 20,
              fontSize: 13, fontWeight: 600, color: 'var(--claimondo-navy)', letterSpacing: '-.005em',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34C759', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              Sachverständige in Echtzeit verfügbar
            </div>
            <h1 style={{
              fontSize: 'clamp(26px, 4vw, 38px)',
              fontWeight: 800, letterSpacing: '-.032em',
              color: 'var(--claimondo-navy)', lineHeight: 1.12,
              marginBottom: 14, fontFamily: 'var(--font-montserrat, Montserrat), sans-serif',
            }}>
              Kfz-Gutachter in Ihrer Nähe finden
            </h1>
            <p style={{
              fontSize: 'clamp(15px, 2vw, 17px)',
              color: 'var(--wiz-text-2)', lineHeight: 1.6,
              maxWidth: 500, margin: '0 auto',
              fontFamily: 'var(--font-montserrat, Montserrat), sans-serif',
            }}>
              Kostenlos für unverschuldet Geschädigte nach §249 BGB.
              Termin in unter 48 Stunden — bundesweit.
            </p>
          </div>

          <DynamicWizard flowKey="gutachter-finden" />
        </div>
      </div>
    </>
  )
}
