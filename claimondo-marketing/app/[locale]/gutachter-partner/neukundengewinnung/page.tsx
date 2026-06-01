import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, TrendingDown, Megaphone, MapPin, ShieldCheck } from 'lucide-react'
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
    title: t('gutachter_partner_neukundengewinnung.title'),
    description: t('gutachter_partner_neukundengewinnung.description'),
    keywords: [
      'Neukundengewinnung Kfz-Sachverständige',
      'Aufträge für Gutachter',
      'Auslastung Sachverständiger',
      'Kfz-Gutachter Akquise',
      'SV-Netzwerk Aufträge',
      'Schadenfälle ohne CPL',
    ],
    alternates: {
      canonical: `${GUTACHTER_LANDING_URL}/neukundengewinnung`,
      ...buildLanguageAlternates('/gutachter-partner/neukundengewinnung'),
    },
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${GUTACHTER_LANDING_URL}/neukundengewinnung`,
      title: t('gutachter_partner_neukundengewinnung.og_title'),
      description: t('gutachter_partner_neukundengewinnung.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Neukundengewinnung für Kfz-Sachverständige' }],
    },
  }
}

// German constants kept for JSON-LD (faqPageSchema) — inhaltlich identisch zu de.json faqs
const FAQS = [
  {
    frage: 'Wie gewinnen Kfz-Sachverständige planbar neue Aufträge?',
    antwort:
      'Statt teurer Eigenakquise über eine regionale Plattform-Zuteilung: qualifizierte, vorgeprüfte Schadenfälle aus dem eigenen Gebiet sichern eine planbare Auslastung, ohne dass Sie in Werbung investieren oder Leads einkaufen müssen.',
  },
  {
    frage: 'Was kostet die Teilnahme am Claimondo-Netzwerk?',
    antwort:
      'Es gibt kein Cost-per-Lead und kein Werbebudget. Die Abrechnung ist fair und transparent pro vermitteltem Fall. Die konkreten Konditionen finden Sie auf der Partner-Seite.',
  },
  {
    frage: 'Verliere ich meine Unabhängigkeit?',
    antwort:
      'Nein. Sie behalten Ihr eigenes Briefing, Ihre Honorarhoheit und Ihre Abrechnung. Claimondo übernimmt lediglich Akquise, Erstkontakt und Koordination — die gutachterliche Arbeit bleibt vollständig bei Ihnen.',
  },
  {
    frage: 'Wie funktioniert die regionale Freischaltung?',
    antwort:
      'Sie werden für Ihr Postleitzahl-Gebiet freigeschaltet und erhalten Schadenfälle aus dieser Region zugeteilt. Annahme und Kapazität steuern Sie selbst — bei Auslastung pausieren Sie die Zuteilung.',
  },
  {
    frage: 'Für wen lohnt sich das Modell?',
    antwort:
      'Besonders für Einzelbüros, Neugründungen und Sachverständige mit freier Kapazität, die ohne Werbebudget und ohne Akquise-Aufwand wachsen wollen.',
  },
]

// Aspekt icons in order — parallel to aspekte (t.raw aspekte array)
const ASPEKT_ICONS = [TrendingDown, Megaphone, MapPin, ShieldCheck]
const ASPEKT_NRS = ['01', '02', '03', '04']

export default function NeukundengewinnungPage() {
  const t = useTranslations('gutachter_partner_neukundengewinnung')

  const aspekte = t.raw('aspekte') as Array<{ titel: string; kicker: string; text: string }>
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Neukundengewinnung für Kfz-Sachverständige',
            description:
              'Planbare Auslastung für freie Kfz-Sachverständige ohne CPL-Risiko: regionale Freischaltung statt Cost-per-Lead — qualifizierte Schadenfälle direkt zugeteilt.',
            url: `${GUTACHTER_LANDING_URL}/neukundengewinnung`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Für Gutachter', url: `${GUTACHTER_LANDING_URL}/` },
            { name: 'Neukundengewinnung', url: `${GUTACHTER_LANDING_URL}/neukundengewinnung` },
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
            <Link href="/gutachter-partner/marketing" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_marketing')}
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
      <StickyCallBar quelle="Gutachter-Partner Neukundengewinnung" />
    </div>
  )
}
