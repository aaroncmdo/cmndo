import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Users, Star, Globe, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, GUTACHTER_LANDING_URL,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('gutachter_partner_marketing.title'),
    description: t('gutachter_partner_marketing.description'),
    keywords: [
      'Marketing Kfz-Gutachter',
      'Kundenakquise Sachverständige',
      'lokale SEO Gutachter',
      'Google Business Sachverständiger',
      'Bewertungen Kfz-Gutachter',
      'Online-Präsenz Sachverständiger',
    ],
    alternates: {
      canonical: `${GUTACHTER_LANDING_URL}/marketing`,
      ...buildLanguageAlternates('/gutachter-partner/marketing'),
    },
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${GUTACHTER_LANDING_URL}/marketing`,
      title: t('gutachter_partner_marketing.og_title'),
      description: t('gutachter_partner_marketing.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Marketing für Kfz-Gutachter' }],
    },
  }
}

// German constants kept for JSON-LD (faqPageSchema) — inhaltlich identisch zu de.json faqs
const FAQS = [
  {
    frage: 'Welches Marketing bringt Kfz-Gutachtern die meisten Aufträge?',
    antwort:
      'Die Kombination aus lokaler Sichtbarkeit (Google Business Profile, Bewertungen) und Plattform-Distribution. Beide bauen eine planbare Auftragsbasis auf, ohne dass laufend Werbebudget nötig ist — anders als bei Anzeigen.',
  },
  {
    frage: 'Lohnen sich Google Ads für Sachverständige?',
    antwort:
      'Ads bringen schnelle Sichtbarkeit, sind aber teuer und enden, sobald das Budget stoppt. Für die meisten regionalen Sachverständigen ist lokale SEO plus Plattform-Anbindung nachhaltiger und günstiger.',
  },
  {
    frage: 'Wie wichtig sind Online-Bewertungen?',
    antwort:
      'Sehr wichtig. Bewertungen sind bei lokaler Suche ein zentraler Ranking- und Vertrauensfaktor. Bitten Sie zufriedene Kunden aktiv um eine Bewertung — das ist kostenlos und wirkt direkt auf die Auftragslage.',
  },
  {
    frage: 'Brauche ich als Gutachter eine eigene Website?',
    antwort:
      'Ja — sie ist die Vertrauens-Landeseite für jede Marketing-Maßnahme. Sie sollte Leistungen, Qualifikationen und Referenzen klar zeigen. Ohne sie verpufft die Reichweite anderer Kanäle.',
  },
  {
    frage: 'Wie ergänzt eine Plattform mein eigenes Marketing?',
    antwort:
      'Eine Plattform übernimmt Akquise und Erstkontakt für einen Teil Ihrer Auslastung, während Ihr eigenes Marketing (lokal, Empfehlungen) parallel läuft. So senken Sie Ihr Akquise-Risiko, ohne Ihre Unabhängigkeit aufzugeben.',
  },
]

// Aspekt icons in order — parallel to aspekte (t.raw aspekte array)
const ASPEKT_ICONS = [Users, Star, Globe, Share2]
const ASPEKT_NRS = ['01', '02', '03', '04']

export default function MarketingPage() {
  const t = useTranslations('gutachter_partner_marketing')

  const aspekte = t.raw('aspekte') as Array<{ titel: string; kicker: string; text: string }>
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Marketing für Kfz-Sachverständige',
            description:
              'Kundenakquise für Kfz-Sachverständige: lokale SEO, Bewertungen, Online-Präsenz und Plattform-Distribution — was wirklich Aufträge bringt statt Budget zu verbrennen.',
            url: `${GUTACHTER_LANDING_URL}/marketing`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Für Gutachter', url: `${GUTACHTER_LANDING_URL}/` },
            { name: 'Marketing', url: `${GUTACHTER_LANDING_URL}/marketing` },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
            <Link href="/gutachter-partner" className="hover:text-white">{t('breadcrumb_hub')}</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{t('breadcrumb_current')}</span>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t('hero_h1')}
          </h1>
          <p className="mt-3 text-lg text-claimondo-light-blue">
            {t.rich('hero_intro', {
              strong: (chunks) => <strong className="text-white">{chunks}</strong>,
            })}
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="Claimondo SV-Partner-Netzwerk">
            {t.rich('antwort_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
        </div>
      </section>

      {/* 4 Aspekte */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl space-y-8 px-5 sm:px-8">
          {aspekte.map((aspekt, i) => {
            const Icon = ASPEKT_ICONS[i]
            return (
              <div
                key={aspekt.titel}
                className={`flex flex-col gap-6 rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-6 shadow-sm md:flex-row md:items-start ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className="flex-shrink-0">
                  <div className="flex h-16 w-16 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                    <Icon className="h-8 w-8 text-claimondo-ondo" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-black text-claimondo-border">{ASPEKT_NRS[i]}</span>
                    <div>
                      <h2 className="text-xl font-extrabold text-claimondo-navy">{aspekt.titel}</h2>
                      <div className="mt-0.5 text-xs font-semibold text-claimondo-ondo">{aspekt.kicker}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{aspekt.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">{t('faq_h2')}</h2>
          <div className="mt-8 space-y-3">
            {faqs.map((f) => (
              <details key={f.frage} className="group rounded-ios-md border border-claimondo-border bg-white p-5">
                <summary className="cursor-pointer list-none text-base font-bold text-claimondo-navy">
                  <span className="flex items-center justify-between">
                    {f.frage}
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-Links */}
      <section className="bg-claimondo-bg py-12">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-lg font-bold text-claimondo-navy">{t('crosslinks_h2')}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/gutachter-partner/neukundengewinnung" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_neukundengewinnung')}
            </Link>
            <Link href="/gutachter-partner" className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield">
              {t('crosslink_partner')}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">{t('cta_h2')}</h2>
          <p className="mt-4 text-white/70">{t('cta_p')}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/gutachter-partner" className="inline-flex items-center gap-2 rounded-ios-md bg-white px-8 py-4 text-base font-bold text-claimondo-navy hover:bg-claimondo-light-blue/90">
              {t('cta_button')}
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Gutachter-Partner Marketing" />
    </div>
  )
}
