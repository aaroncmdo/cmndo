import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, Scale, BadgeCheck, ShieldCheck, Gavel } from 'lucide-react'
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
    title: t('kfz_gutachter_sv_vs_gutachter.title'),
    description: t('kfz_gutachter_sv_vs_gutachter.description'),
    keywords: [
      'Sachverständiger oder Gutachter',
      'Unterschied Sachverständiger Gutachter',
      'Kfz-Gutachter Kfz-Sachverständiger Unterschied',
      'öffentlich bestellt vereidigt',
      'unabhängiger Kfz-Gutachter',
      'eigener Gutachter Unfall',
    ],
    alternates: await localeAlternates('/kfz-gutachter/sachverstaendiger-vs-gutachter'),
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/kfz-gutachter/sachverstaendiger-vs-gutachter`,
      title: t('kfz_gutachter_sv_vs_gutachter.og_title'),
      description: t('kfz_gutachter_sv_vs_gutachter.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Sachverständiger oder Gutachter' }],
    },
  }
}

// German constant for JSON-LD (faqPageSchema) — inhaltlich identisch zu de.json `faqs`.
const FAQS = [
  {
    frage: 'Heißt es Kfz-Sachverständiger oder Kfz-Gutachter?',
    antwort:
      'Beides ist richtig — im Kfz-Schaden werden die Begriffe synonym verwendet. Weder »Sachverständiger« noch »Gutachter« ist als Berufsbezeichnung gesetzlich geschützt. Geregelt ist nur die Zusatzbezeichnung »öffentlich bestellt und vereidigt« (§ 36 GewO), die eine bestandene IHK-Sachkundeprüfung voraussetzt.',
  },
  {
    frage: 'Brauche ich nach einem Unfall einen eigenen Gutachter?',
    antwort:
      'Bei einem unverschuldeten Unfall mit Schaden über etwa 750 € ja. Ein eigenes, unabhängiges Gutachten dokumentiert Reparaturkosten, Wertminderung und Wiederbeschaffungswert in Ihrem Interesse. Die Kosten trägt die gegnerische Haftpflichtversicherung als Teil des Schadens (§ 249 BGB). Bei Bagatellschäden unter ~750 € genügt meist ein Kostenvoranschlag.',
  },
  {
    frage: 'Was bedeutet »öffentlich bestellt und vereidigt«?',
    antwort:
      'Diese Sachverständigen haben vor der Industrie- und Handelskammer eine Prüfung über besondere Sachkunde abgelegt (§ 36 GewO) und sind zur Unparteilichkeit vereidigt. Es ist die höchste Qualifikationsstufe und hat vor Gericht besonderes Gewicht. Daneben sind Zertifizierungen nach DIN EN ISO 17024 (DEKRA, KÜS, TÜV, DAT) sowie die BVSK-Mitgliedschaft anerkannte Qualitätsmerkmale.',
  },
  {
    frage: 'Darf die gegnerische Versicherung mir einen Gutachter vorschreiben?',
    antwort:
      'Nein. Sie haben das Recht auf freie Wahl Ihres Sachverständigen (BGH VI ZR 67/06). Bietet die gegnerische Versicherung einen »eigenen« Gutachter oder eine »kostenlose« Schadensabwicklung an, ist das Schadensteuerung in ihrem Interesse — Sie dürfen das ablehnen und einen unabhängigen Sachverständigen beauftragen.',
  },
  {
    frage: 'Worauf sollte ich bei der Auswahl achten?',
    antwort:
      'Auf Unabhängigkeit (kein Vertrag mit der gegnerischen Versicherung), eine anerkannte Zertifizierung oder öffentliche Bestellung, kalkulationssichere Software (DAT/Audatex) sowie schnelle regionale Verfügbarkeit. Claimondo vermittelt ausschließlich unabhängige, qualifizierte Sachverständige in Ihrer Nähe — Termin in der Regel unter 48 Stunden.',
  },
]

const ASPEKT_ICONS = [Scale, BadgeCheck, ShieldCheck, Gavel]
const ASPEKT_NRS = ['01', '02', '03', '04']

export default function SvVsGutachterPage() {
  const t = useTranslations('kfz_gutachter_sv_vs_gutachter')

  const aspekte = t.raw('aspekte') as Array<{ titel: string; kicker: string; text: string }>
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Unabhängiges Kfz-Schadengutachten',
            description:
              'Vermittlung unabhängiger, zertifizierter Kfz-Sachverständiger für ein neutrales Schadengutachten nach einem unverschuldeten Unfall. Freie Gutachterwahl, Kosten trägt die gegnerische Versicherung.',
            url: `${SITE_URL}/kfz-gutachter/sachverstaendiger-vs-gutachter`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Sachverständiger oder Gutachter', url: '/kfz-gutachter/sachverstaendiger-vs-gutachter' },
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
          <AnswerCapsule quelle="§ 249 BGB · § 36 GewO · BGH VI ZR 67/06">
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
      <StickyCallBar quelle="Kfz-Gutachter: Sachverständiger vs Gutachter" />
    </div>
  )
}
