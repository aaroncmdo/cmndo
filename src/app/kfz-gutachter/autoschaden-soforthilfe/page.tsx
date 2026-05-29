import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, AlertTriangle, Camera, PhoneOff, FileSearch, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema, howToSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('kfz_gutachter_autoschaden_soforthilfe.title'),
    description: t('kfz_gutachter_autoschaden_soforthilfe.description'),
    keywords: [
      'Autoschaden was tun',
      'Unfall was tun',
      'Sofortmaßnahmen Autounfall',
      'erste Schritte nach Unfall',
      'Autounfall Checkliste',
      'Verhalten nach Verkehrsunfall',
    ],
    alternates: {
      canonical: '/kfz-gutachter/autoschaden-soforthilfe',
      ...buildLanguageAlternates('/kfz-gutachter/autoschaden-soforthilfe'),
    },
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/kfz-gutachter/autoschaden-soforthilfe`,
      title: t('kfz_gutachter_autoschaden_soforthilfe.og_title'),
      description: t('kfz_gutachter_autoschaden_soforthilfe.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Autoschaden — was tun?' }],
    },
  }
}

// German constants for JSON-LD (howToSchema + faqPageSchema) — inhaltlich == de.json.
const SCHRITTE = [
  {
    titel: 'Unfallstelle sichern',
    text: 'Warnblinker an, Warndreieck aufstellen (innerorts ~50 m, außerorts ~100 m, Autobahn ~150–400 m), Warnweste anziehen. Verletzten helfen und bei Personenschaden sofort 112 rufen. Bringen Sie sich selbst aus dem Gefahrenbereich.',
  },
  {
    titel: 'Beweise sichern + Polizei',
    text: 'Fotos aus mehreren Winkeln: Schäden, Endposition beider Fahrzeuge, Kennzeichen, Bremsspuren, Verkehrszeichen. Daten der Gegenseite notieren (Name, Anschrift, Versicherung, Kennzeichen, Fahrer). Zeugen ansprechen. Bei unklarer Schuld, Fahrerflucht oder Personenschaden: Polizei (110) rufen.',
  },
  {
    titel: 'Nichts zugeben, nichts unterschreiben',
    text: 'Geben Sie weder am Unfallort noch am Telefon ein Schuldeingeständnis ab und unterschreiben Sie keine Erklärung der gegnerischen Versicherung. Bietet die Gegenseite eine »schnelle, kostenlose« Abwicklung an, ist das Schadensteuerung — verweisen Sie freundlich auf Ihren Gutachter und Anwalt.',
  },
  {
    titel: 'Eigenen Gutachter beauftragen',
    text: 'Bei Schaden über etwa 750 € haben Sie Anspruch auf einen eigenen, unabhängigen Sachverständigen (BGH VI ZR 67/06). Beauftragen Sie nicht den Gutachter der gegnerischen Versicherung — dieser arbeitet in deren Interesse. Termin idealerweise vor jeder Reparatur.',
  },
  {
    titel: 'Schaden melden + Anwalt',
    text: 'Melden Sie den Schaden — bei Claimondo in 5 Minuten online. Wir koordinieren Gutachter, Werkstatt und Partnerkanzlei. Bei Fremdverschulden trägt die gegnerische Haftpflicht auch die Anwaltskosten (§ 249 BGB).',
  },
]

const FAQS = [
  {
    frage: 'Muss ich nach einem Autoschaden die Polizei rufen?',
    antwort:
      'Pflicht ist es bei Personenschaden, Fahrerflucht oder erheblichem Sachschaden mit unklarer Schuld. Bei eindeutigen kleinen Blechschäden mit einvernehmlichem Datenaustausch ist die Polizei nicht zwingend — ein polizeiliches Protokoll hilft aber später als Beweis. Im Zweifel rufen Sie an (110).',
  },
  {
    frage: 'Was sollte ich fotografieren?',
    antwort:
      'Schäden an beiden Fahrzeugen aus mehreren Winkeln, die Endposition der Fahrzeuge im Verkehrsraum, alle Kennzeichen, Bremsspuren, Splitter, Verkehrszeichen und Ampeln. Außerdem Führerschein und Versicherungsdaten der Gegenseite. Lieber zu viele Fotos als zu wenige.',
  },
  {
    frage: 'Darf ich mein Auto reparieren lassen, bevor der Gutachter kommt?',
    antwort:
      'Nein — warten Sie das Gutachten ab. Wird vor der Begutachtung repariert, lässt sich der Schaden nicht mehr neutral dokumentieren, und die Versicherung kürzt oder verweigert die Erstattung. Der Gutachter-Termin ist in der Regel innerhalb von 48 Stunden möglich.',
  },
  {
    frage: 'Muss ich der gegnerischen Versicherung Auskunft geben?',
    antwort:
      'Sie sind nicht verpflichtet, der gegnerischen Versicherung am Telefon Angaben zu Hergang, Schuld oder Verletzungen zu machen. Solche Aussagen werden später gern gegen Sie verwendet. Verweisen Sie freundlich auf Ihren Gutachter und Ihren Anwalt.',
  },
  {
    frage: 'Was ist, wenn die Schuldfrage unklar ist?',
    antwort:
      'Dann sind Beweissicherung und Polizei besonders wichtig. Unfallskizze, Zeugen und Fotos entscheiden später über die Haftungsquote. Auch bei Teilschuld lohnt ein eigener Gutachter — Ihr Schaden wird anteilig erstattet, und ein neutrales Gutachten verhindert überhöhte Mitverschuldens-Quoten der Gegenseite.',
  },
]

const STEP_ICONS = [AlertTriangle, Camera, PhoneOff, FileSearch, Send]
const STEP_NRS = ['01', '02', '03', '04', '05']

export default function AutoschadenSoforthilfePage() {
  const t = useTranslations('kfz_gutachter_autoschaden_soforthilfe')

  const schritte = t.raw('schritte') as Array<{ titel: string; dauer: string; text: string }>
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Schaden-Soforthilfe',
            description:
              'Sofortmaßnahmen nach einem Autoschaden: Unfallstelle sichern, Beweise sichern, keine Schuldeingeständnisse, eigenen Gutachter beauftragen, Schaden melden. Koordination von Gutachter, Werkstatt und Anwalt.',
            url: `${SITE_URL}/kfz-gutachter/autoschaden-soforthilfe`,
          }),
          howToSchema({
            name: 'Autoschaden — was tun? Die 5 Sofort-Schritte',
            description: 'Die fünf wichtigsten Schritte direkt nach einem Autoschaden, um alle Ansprüche zu sichern.',
            estimatedCost: { currency: 'EUR', value: '0' },
            schritte: SCHRITTE.map((s) => ({ name: s.titel, text: s.text })),
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Autoschaden — was tun?', url: '/kfz-gutachter/autoschaden-soforthilfe' },
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
          <AnswerCapsule quelle="§ 249 BGB · BGH VI ZR 67/06">
            {t.rich('antwort_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
        </div>
      </section>

      {/* 5 Sofort-Schritte */}
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
                    <div>
                      <h2 className="text-xl font-extrabold text-claimondo-navy">{schritt.titel}</h2>
                      <div className="mt-0.5 text-xs font-semibold text-claimondo-ondo">{schritt.dauer}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{schritt.text}</p>
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
      <StickyCallBar quelle="Kfz-Gutachter: Autoschaden Soforthilfe" />
    </div>
  )
}
