import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, FileText, Zap, Users, Wallet } from 'lucide-react'
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
import { localeAlternates } from '@/lib/seo/alternates'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('kfz_gutachter_gutachten_service.title'),
    description: t('kfz_gutachter_gutachten_service.description'),
    keywords: [
      'Kfz-Gutachten Service',
      'Kfz-Schadengutachten',
      'Gutachten erstellen lassen',
      'Schadengutachten Auto',
      'Kfz-Gutachten digital',
      'Gutachten Unfall Service',
    ],
    alternates: await localeAlternates('/kfz-gutachter/gutachten-service'),
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/kfz-gutachter/gutachten-service`,
      title: t('kfz_gutachter_gutachten_service.og_title'),
      description: t('kfz_gutachter_gutachten_service.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Kfz-Gutachten-Service' }],
    },
  }
}

// German constant for JSON-LD (faqPageSchema) — inhaltlich == de.json `faqs`.
const FAQS = [
  {
    frage: 'Was umfasst ein Kfz-Gutachten?',
    antwort:
      'Reparaturkosten-Kalkulation (DAT/Audatex), merkantile Wertminderung, Wiederbeschaffungswert, Restwert bei Totalschaden, Lichtbilddokumentation, Reparaturweg und Schadenhergang. Das Gutachten ist die Grundlage für die gesamte Schadensregulierung.',
  },
  {
    frage: 'Was kostet der Gutachten-Service?',
    antwort:
      'Bei unverschuldetem Unfall mit Schaden über etwa 750 €: 0 €. Die gegnerische Haftpflicht trägt das Honorar (§ 249 BGB), der Sachverständige rechnet via Sicherungsabtretung (§ 398 BGB) direkt mit ihr ab. Nur bei Eigenverschulden oder Bagatellschaden tragen Sie die Kosten selbst.',
  },
  {
    frage: 'Wie schnell bekomme ich einen Termin?',
    antwort:
      'In der Regel innerhalb von 48 Stunden. Der Sachverständige kommt zu Ihnen — Wohnort, Arbeitsplatz oder Werkstatt. Der schriftliche Bericht folgt meist 1–2 Tage nach der Besichtigung.',
  },
  {
    frage: 'Bekomme ich das Gutachten auch digital?',
    antwort:
      'Ja. Sie erhalten den vollständigen Gutachtenbericht digital als PDF — auf Wunsch zusätzlich postalisch. Die Partnerkanzlei nutzt das Gutachten direkt für die Forderung gegenüber der gegnerischen Versicherung.',
  },
  {
    frage: 'Lohnt sich ein Gutachten bei kleinem Schaden?',
    antwort:
      'Bei optisch kleinen Schäden über etwa 750 € meist ja — verdeckte Folgeschäden (Steuergeräte, Längsträger) bleiben sonst unentdeckt. Unter der Bagatellgrenze von ~750 € genügt in der Regel ein Kostenvoranschlag der Werkstatt.',
  },
]

const ASPEKT_ICONS = [FileText, Zap, Users, Wallet]
const ASPEKT_NRS = ['01', '02', '03', '04']

export default function GutachtenServicePage() {
  const t = useTranslations('kfz_gutachter_gutachten_service')

  const aspekte = t.raw('aspekte') as Array<{ titel: string; kicker: string; text: string }>
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachten-Service',
            description:
              'Unabhängiges Kfz-Schadengutachten plus Koordination der gesamten Regulierung: Terminierung in unter 48 h, Werkstatt, Mietwagen und anwaltliche Durchsetzung. Bei Fremdverschulden kostenfrei (§ 249 BGB).',
            url: `${SITE_URL}/kfz-gutachter/gutachten-service`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Gutachten-Service', url: '/kfz-gutachter/gutachten-service' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
            <Link href="/kfz-gutachter" className="hover:text-white">{t('breadcrumb_hub')}</Link>
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
          <AnswerCapsule quelle="§ 249 BGB · § 398 BGB · DAT/Audatex">
            {t.rich('antwort_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
        </div>
      </section>

      {/* 4 Leistungen */}
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
            <Link href="/kfz-gutachter/ablauf" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_ablauf')}
            </Link>
            <Link href="/kfz-gutachter/kosten" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_kosten')}
            </Link>
            <Link href="/kfz-gutachter" className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield">
              {t('crosslink_gutachter')}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">{t('cta_h2')}</h2>
          <p className="mt-4 text-white/70">{t('cta_p')}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/schaden-melden" className="inline-flex items-center gap-2 rounded-ios-md bg-white px-8 py-4 text-base font-bold text-claimondo-navy hover:bg-claimondo-light-blue/90">
              {t('cta_schaden')}
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
      <StickyCallBar quelle="Kfz-Gutachter: Gutachten-Service" />
    </div>
  )
}
