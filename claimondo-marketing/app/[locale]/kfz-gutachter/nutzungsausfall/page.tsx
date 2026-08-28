import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { RatgeberStaedteSection } from '@/components/landing/sections/RatgeberStaedteSection'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema, webApplicationSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164,
} from '@/lib/seo/jsonld'
import { getRouteLastUpdatedISO } from '@/lib/seo/freshness'
import { localeAlternates, localeOpenGraph } from '@/lib/seo/alternates'
import { NA_KLASSEN } from '@/lib/tools/nutzungsausfall'
import NutzungsausfallRechnerClient from './NutzungsausfallRechnerClient'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('kfz_gutachter_nutzungsausfall.title'),
    description: t('kfz_gutachter_nutzungsausfall.description'),
    keywords: [
      'Nutzungsausfall berechnen',
      'Nutzungsausfallentschädigung',
      'Nutzungsausfall Tabelle',
      'Nutzungsausfall pro Tag',
      'Nutzungsausfall Fahrzeugklasse',
      'Nutzungsausfall nach Unfall',
      'Mietwagen oder Nutzungsausfall',
    ],
    alternates: await localeAlternates('/kfz-gutachter/nutzungsausfall'),
    openGraph: {
      type: 'article',
      siteName: 'Claimondo',
      ...(await localeOpenGraph(`/kfz-gutachter/nutzungsausfall`)),
      title: t('kfz_gutachter_nutzungsausfall.og_title'),
      description: t('kfz_gutachter_nutzungsausfall.og_description'),
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Nutzungsausfall berechnen' }],
    },
  }
}

// Deutsche Konstanten — ausschliesslich fuer das JSON-LD (sichtbare FAQs kommen aus i18n).
const FAQS_SCHEMA = [
  {
    frage: 'Wie hoch ist der Nutzungsausfall pro Tag?',
    antwort:
      'Der Tagessatz richtet sich nach der Fahrzeugklasse: von rund 23–27 € bei Kleinstwagen (Klasse A) über 59–65 € in der Mittelklasse (Klasse E, z. B. VW Passat oder BMW 3er) bis 175–219 € bei Luxus-Sportwagen (Klasse L). Die konkrete Einstufung nimmt der Sachverständige im Gutachten vor; bei älteren Fahrzeugen wird die Klasse in der Regel zurückgestuft.',
  },
  {
    frage: 'Wann bekomme ich überhaupt Nutzungsausfall?',
    antwort:
      'Drei Voraussetzungen müssen zusammenkommen: Sie sind unverschuldet geschädigt, das Fahrzeug war während der Reparatur- oder Wiederbeschaffungsdauer nicht nutzbar, und Sie hätten es in dieser Zeit auch tatsächlich genutzt (Nutzungswille und Nutzungsmöglichkeit). Wer stattdessen einen Mietwagen nimmt, bekommt keinen Nutzungsausfall – beides zusammen geht nicht.',
  },
  {
    frage: 'Für wie viele Tage wird Nutzungsausfall gezahlt?',
    antwort:
      'Maßgeblich ist die im Gutachten ausgewiesene Reparatur- oder Wiederbeschaffungsdauer, zuzüglich einer angemessenen Überlegungs- und Bestellzeit. Im Reparaturfall liegt die erstattete Dauer typischerweise im Bereich von etwa 12 bis 14 Tagen; bei Totalschaden gilt die Wiederbeschaffungsdauer, üblicherweise 10 bis 14 Tage. Verzögert die Versicherung die Regulierung, kann sich der Zeitraum verlängern.',
  },
  {
    frage: 'Wird der Tagessatz bei einem älteren Auto gekürzt?',
    antwort:
      'In der Praxis ja: Ab etwa fünf Jahren wird üblicherweise eine Fahrzeugklasse zurückgestuft, ab etwa zehn Jahren zwei Klassen. Aus einem Mittelklasse-Fahrzeug (Klasse E) wird dann rechnerisch Klasse D beziehungsweise C. Ein pauschaler Ausschluss allein wegen des Alters ist damit aber nicht verbunden – der Anspruch bleibt bestehen.',
  },
  {
    frage: 'Mietwagen oder Nutzungsausfall – was lohnt sich mehr?',
    antwort:
      'Wer während der Ausfallzeit wirklich ein Fahrzeug braucht, nimmt den Mietwagen; wer die Zeit überbrücken kann, fährt mit der Nutzungsausfallentschädigung meist finanziell besser, weil sie ohne Gegenleistung ausgezahlt wird. Rechtlich sind es Alternativen: Es gibt entweder Mietwagenkosten oder Nutzungsausfall, nie beides für denselben Zeitraum.',
  },
]

export default function NutzungsausfallPage() {
  const t = useTranslations('kfz_gutachter_nutzungsausfall')
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Nutzungsausfall-Ermittlung nach Unfall',
            description:
              'Ermittlung und Durchsetzung der Nutzungsausfallentschädigung nach Verkehrsunfall – Fahrzeugklasse, Ausfalldauer und Tagessatz aus dem Sachverständigen-Gutachten.',
            url: `${SITE_URL}/kfz-gutachter/nutzungsausfall`,
          }),
          webApplicationSchema({
            name: 'Nutzungsausfall-Rechner',
            description:
              'Interaktiver Rechner für die Nutzungsausfallentschädigung nach Unfall – Tagessatz nach Fahrzeugklasse × Ausfalldauer, inklusive Alters-Rückstufung. Kostenlos.',
            url: `${SITE_URL}/kfz-gutachter/nutzungsausfall`,
          }),
          faqPageSchema(FAQS_SCHEMA, {
            dateModified: getRouteLastUpdatedISO('/kfz-gutachter/nutzungsausfall'),
            url: '/kfz-gutachter/nutzungsausfall',
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Nutzungsausfall', url: '/kfz-gutachter/nutzungsausfall' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
            <Link href="/kfz-gutachter" className="hover:text-white">{t('breadcrumb_start')}</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{t('breadcrumb_current')}</span>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">{t('hero_h1')}</h1>
          <p className="mt-3 text-lg text-claimondo-light-blue">
            {t.rich('hero_intro', { strong: (chunks) => <strong className="text-white">{chunks}</strong> })}
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="§249 BGB">
            {t.rich('antwort_capsule', { strong: (chunks) => <strong>{chunks}</strong> })}
          </AnswerCapsule>

          <NutzungsausfallRechnerClient />

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">{t('tabelle_h2')}</h2>
          <DataTableContainer variant="plain" className="mt-6 overflow-hidden rounded-ios-md border border-claimondo-border bg-white shadow-sm">
            <Table>
              <Thead>
                <Tr>
                  <Th className="!font-bold">{t('th_klasse')}</Th>
                  <Th className="!font-bold">{t('th_bezeichnung')}</Th>
                  <Th className="!font-bold">{t('th_beispiele')}</Th>
                  <Th className="!font-bold">{t('th_satz')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {NA_KLASSEN.map((k) => (
                  <Tr key={k.klasse}>
                    <Td className="font-semibold">{k.klasse}</Td>
                    <Td>{k.bezeichnung}</Td>
                    <Td className="!text-claimondo-shield">{k.beispiele}</Td>
                    <Td className="font-bold !text-claimondo-ondo">{`${k.satz[0]}–${k.satz[1]} €`}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
          <p className="mt-3 text-xs text-claimondo-ondo">{t('tabelle_note')}</p>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">{t('voraussetzungen_h2')}</h2>
          <AnswerCapsule quelle="§249 BGB">
            {t.rich('voraussetzungen_capsule', { strong: (chunks) => <strong>{chunks}</strong> })}
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">{t('dauer_h2')}</h2>
          <AnswerCapsule>{t('dauer_capsule')}</AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">{t('mietwagen_h2')}</h2>
          <AnswerCapsule>
            {t.rich('mietwagen_capsule', { strong: (chunks) => <strong>{chunks}</strong> })}
          </AnswerCapsule>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">{t('faq_h2')}</h2>
          <div className="mt-8 space-y-3">
            {faqs.map((f) => (
              <details key={f.frage} className="group rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
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

      {/* Cross-Links – entkanibalisiert den Nutzungsausfall-Cluster (rechtlich-tiefer Spoke) */}
      <section className="bg-claimondo-bg py-12">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-lg font-bold text-claimondo-navy">{t('crosslinks_h2')}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/kfz-gutachter/wertminderung" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_wertminderung')}
            </Link>
            <Link href="/kfz-gutachter/kosten" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_kosten')}
            </Link>
            <Link href="/haftpflicht/nutzungsausfall" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_recht')}
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
            <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-ios-md border border-white/20 px-8 py-4 text-base font-semibold text-white/85 hover:border-white/40 hover:text-white">
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <ReviewerByline datum="2026-08-11" />

      <RatgeberStaedteSection artikelSlug="nutzungsausfall" />


      <LandingFooter />
      <StickyCallBar quelle="Kfz-Gutachter Nutzungsausfall" />
    </div>
  )
}
