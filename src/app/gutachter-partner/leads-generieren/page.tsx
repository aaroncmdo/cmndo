import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, Target, Inbox, ShieldCheck, TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('gutachter_partner_leads.title'),
    description: t('gutachter_partner_leads.description'),
    keywords: [
      'Leads für Kfz-Gutachter generieren',
      'Aufträge für Kfz-Sachverständige',
      'Neukundengewinnung Kfz-Gutachter',
      'Kundenakquise Sachverständiger',
      'Kfz-Gutachter Marketing',
      'Sachverständigen-Aufträge',
    ],
    alternates: { canonical: '/gutachter-partner/leads-generieren', ...buildLanguageAlternates('/gutachter-partner/leads-generieren') },
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/gutachter-partner/leads-generieren`,
      title: t('gutachter_partner_leads.og_title'),
      description: t('gutachter_partner_leads.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Leads für Kfz-Gutachter' }],
    },
  }
}

// German constants kept for JSON-LD only (faqPageSchema)
const FAQS_SCHEMA = [
  {
    frage: 'Wie generiere ich als Kfz-Gutachter planbar neue Aufträge?',
    antwort:
      'Drei Hebel: (1) lokale Sichtbarkeit (Google-Unternehmensprofil, Bewertungen, lokale Landingpages je Einzugsgebiet), (2) bezahlte Suche auf hochintente Begriffe wie „Kfz-Gutachter [Stadt]" — teuer, im Schnitt 8–12 € CPC, (3) Plattform-Distribution: ein Vermittler liefert vorqualifizierte Geschädigten-Anfragen ohne eigenes Marketing-Budget. Der Mix entscheidet — rein organisch ist langsam, rein Ads ist teuer, Plattform-Leads sind planbar.',
  },
  {
    frage: 'Was kostet ein qualifizierter Kfz-Gutachter-Lead?',
    antwort:
      'Über bezahlte Suche liegen die Kosten pro Anfrage realistisch bei 80–250 €, weil generische Begriffe teuer und die Conversion-Raten niedrig sind. Über eine Plattform mit Geschädigten-Zulauf entfällt das Vorab-Budget — Sie übernehmen einen vorqualifizierten Auftrag aus Ihrem Einzugsgebiet. Claimondo verteilt Anfragen an verifizierte Sachverständige im Netzwerk.',
  },
  {
    frage: 'Was unterscheidet einen qualifizierten Lead von einer reinen Adresse?',
    antwort:
      'Ein qualifizierter SV-Lead ist eine konkrete Schadenanfrage eines Geschädigten mit unverschuldetem Unfall, geklärter Schuldfrage und Schaden über der Bagatellgrenze — also ein Fall, bei dem ein vollständiges Gutachten anfällt und die gegnerische Haftpflicht zahlt (§ 249 BGB). Reine Adress-Listen ohne Schadenkontext konvertieren kaum.',
  },
  {
    frage: 'Muss ich für das Claimondo-Partnernetzwerk Marketing-Budget mitbringen?',
    antwort:
      'Nein. Das Marketing (SEO, Google Ads, Landingpages) läuft zentral über Claimondo. Sie als Sachverständiger erhalten vorqualifizierte Anfragen aus Ihrer Region und konzentrieren sich auf das Gutachten. Voraussetzung ist die Verifizierung als unabhängiger Kfz-Sachverständiger.',
  },
]

const STEP_ICONS = [Target, Inbox, ShieldCheck, TrendingUp]
const STEP_NRS = ['01', '02', '03', '04']

export default function LeadsGenerierenPage() {
  const t = useTranslations('gutachter_partner_leads')
  const schritte = t.raw('schritte') as Array<{ titel: string; text: string }>
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Leads für Kfz-Gutachter — Claimondo Partnernetzwerk',
            description:
              'Vorqualifizierte Geschädigten-Anfragen für verifizierte Kfz-Sachverständige. Zentrales Marketing, planbare Auftragslage, kein eigenes Werbebudget nötig.',
            url: `${SITE_URL}/gutachter-partner/leads-generieren`,
          }),
          faqPageSchema(FAQS_SCHEMA),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Gutachter-Partner', url: '/gutachter-partner' },
            { name: 'Leads generieren', url: '/gutachter-partner/leads-generieren' },
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
          <AnswerCapsule quelle="Claimondo Partnernetzwerk">
            {t.rich('antwort_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl space-y-8 px-5 sm:px-8">
          {schritte.map((schritt, i) => {
            const Icon = STEP_ICONS[i]
            return (
              <div
                key={schritt.titel}
                className={`flex flex-col gap-6 rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-6 shadow-sm md:flex-row md:items-start ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className="flex-shrink-0">
                  <div className="flex h-16 w-16 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                    <Icon className="h-8 w-8 text-claimondo-ondo" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-black text-claimondo-border">{STEP_NRS[i]}</span>
                    <h2 className="text-xl font-extrabold text-claimondo-navy">{schritt.titel}</h2>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{schritt.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

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

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">{t('cta_h2')}</h2>
          <p className="mt-4 text-white/70">{t('cta_p')}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/gutachter-partner" className="inline-flex items-center gap-2 rounded-ios-md bg-white px-8 py-4 text-base font-bold text-claimondo-navy hover:bg-claimondo-light-blue/90">
              {t('cta_partner')}
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a href="tel:+4922125906530" className="inline-flex items-center gap-2 rounded-ios-md border border-white/20 px-8 py-4 text-base font-semibold text-white/85 hover:border-white/40 hover:text-white">
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Gutachter-Partner Leads" />
    </div>
  )
}
