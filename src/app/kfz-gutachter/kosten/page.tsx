import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Was kostet ein Kfz-Gutachter? — 0 € bei Fremdverschulden (§249 BGB)',
  description:
    'Kfz-Gutachter-Kosten: BVSK-Honorartabelle, Sicherungsabtretung (§398 BGB), Bagatellgrenze 750 €. Bei unverschuldetem Unfall zahlt die Gegnerseite — 0 €.',
  keywords: [
    'Kfz-Gutachter Kosten',
    'Was kostet ein Unfallgutachter',
    'BVSK-Honorartabelle',
    'Sachverständigen-Honorar',
    'Sicherungsabtretung §398 BGB',
    'Bagatellschaden Grenze',
    'Gutachter Kosten Versicherung',
  ],
  alternates: { canonical: '/kfz-gutachter/kosten' },
  openGraph: {
    type: 'article',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/kfz-gutachter/kosten`,
    title: 'Was kostet ein Kfz-Gutachter? — 0 € bei Fremdverschulden',
    description: 'Honorar nach BVSK 600–2.600 €, bei Fremdverschulden 0 € für Sie.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Kfz-Gutachter Kosten' }],
  },
}

// German constants kept for JSON-LD only
const FAQS_SCHEMA = [
  {
    frage: 'Wie viel kostet ein Kfz-Gutachter konkret?',
    antwort:
      'Die Honorare richten sich nach der BVSK-Honorartabelle und skalieren mit dem Wiederbeschaffungswert des Fahrzeugs. Spannen je nach Region: 550–2.600 €. Beispiele: Schaden 5.000 € → ca. 700 € Gutachterhonorar. Schaden 15.000 € → ca. 1.400 €. Schaden 30.000 € → ca. 2.200 €. Die Berechnung folgt der HB-V-Befragung des BVSK aus 2025.',
  },
  {
    frage: 'Wer zahlt den Gutachter bei einem Unfall?',
    antwort:
      'Bei unverschuldetem Unfall mit Schaden über 750 €: die gegnerische Haftpflichtversicherung zu 100 % gemäß §249 BGB. Sie zahlen 0 €. Die Abrechnung läuft direkt zwischen Gutachter und Versicherung über eine Sicherungsabtretung. Bei Selbstverschulden zahlt Ihre Vollkasko (mit Selbstbeteiligung) — ohne Vollkasko Sie selbst.',
  },
  {
    frage: 'Was ist die Bagatell-Grenze von 750 €?',
    antwort:
      'Bei Schäden unter 750 € sieht die Rechtsprechung in der Regel keinen Anspruch auf einen Sachverständigen — ein Kostenvoranschlag der Werkstatt reicht. Genaue Grenze ist vom OLG abhängig (Schwankung 700–1.000 €). Wir empfehlen: bei optisch geringen Schäden die Werkstatt prüfen lassen — oft sind verdeckte Schäden teurer als gedacht und rechtfertigen ein vollständiges Gutachten.',
  },
  {
    frage: 'Was ist eine Sicherungsabtretung?',
    antwort:
      'Bei der Sicherungsabtretung nach §398 BGB überträgt der Geschädigte den Anspruch gegen die gegnerische Versicherung in Höhe des Gutachterhonorars an den Sachverständigen. Sie unterzeichnen einmal — der Gutachter rechnet danach direkt mit der Versicherung ab. Sie haben kein Insolvenzrisiko, kein Vorleistungsrisiko. BGH-Rechtsprechung: Versicherer dürfen die Abtretung nicht einseitig zurückweisen.',
  },
  {
    frage: 'Was passiert wenn die Versicherung das Gutachterhonorar kürzt?',
    antwort:
      'Häufige Versicherer-Taktik: Honorar-Kürzung mit Hinweis auf "ortsüblich". Der BGH hat dem in mehreren Urteilen widersprochen (VI ZR 50/15, VI ZR 76/16): die BVSK-Tabelle ist als Schätzungs-Grundlage zulässig. Unsere Partnerkanzlei holt gekürzte Honorare standardmäßig zurück — bei Erfolg trägt die Versicherung die Anwaltskosten.',
  },
]

export default function KostenPage() {
  const t = useTranslations('kfz_gutachter_kosten')

  const bvskBeispiele = t.raw('bvsk_beispiele') as Array<{ schaden: string; honorar: string }>
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachter Kostenübernahme',
            description:
              'Bei unverschuldetem Verkehrsunfall trägt die gegnerische Haftpflichtversicherung 100 % der Sachverständigen-Honorare gemäß §249 BGB. Honorar nach BVSK-Tabelle 550–2.600 €.',
            url: `${SITE_URL}/kfz-gutachter/kosten`,
          }),
          faqPageSchema(FAQS_SCHEMA),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Kosten', url: '/kfz-gutachter/kosten' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
            <Link href="/kfz-gutachter" className="hover:text-white">{t('breadcrumb_start')}</Link>
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

      {/* Antwort-Block direkt */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="§249 BGB · BVSK-Honorartabelle">
            {t.rich('antwort_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            {t('bvsk_h2')}
          </h2>
          <AnswerCapsule>
            {t('bvsk_capsule')}
          </AnswerCapsule>

          {/* Konkrete Beispiele */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {bvskBeispiele.map((b) => (
              <div
                key={b.schaden}
                className="rounded-ios-md border border-claimondo-border bg-white p-5 text-center shadow-sm"
              >
                <div className="text-xs text-claimondo-ondo">{t('bvsk_beispiel_schaden_label')}</div>
                <div className="mt-1 text-2xl font-extrabold text-claimondo-navy">{b.schaden}</div>
                <div className="mt-3 text-xs text-claimondo-ondo">{t('bvsk_beispiel_honorar_label')}</div>
                <div className="text-lg font-bold text-claimondo-ondo">{b.honorar}</div>
              </div>
            ))}
          </div>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            {t('vorleistung_h2')}
          </h2>
          <AnswerCapsule quelle="§398 BGB Sicherungsabtretung">
            {t.rich('vorleistung_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            {t('bagatell_h2')}
          </h2>
          <AnswerCapsule>
            {t.rich('bagatell_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
        </div>
      </section>

      {/* Selbstverschuldet vs. unverschuldet */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            {t('wer_zahlt_h2')}
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-ios-md border-2 border-green-200 bg-green-50 p-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-700" />
                <h3 className="text-base font-bold text-green-900">{t('unverschuldet_h3')}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-green-900">
                {t.rich('unverschuldet_p', {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>

            <div className="rounded-ios-md border-2 border-amber-200 bg-amber-50 p-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
                <h3 className="text-base font-bold text-amber-900">{t('selbstverschuldet_h3')}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-amber-900">
                {t('selbstverschuldet_p')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">{t('faq_h2')}</h2>
          <div className="mt-8 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-claimondo-border bg-white p-5"
              >
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
            <Link href="/kfz-gutachter/wertminderung" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_wertminderung')}
            </Link>
            {/* Doc 37 §2: Kosten-Cluster entkanibalisieren — Cross-Links zum
                Konversions-Hub + zum rechtlich-tiefen Spoke. */}
            <Link href="/kosten-kfz-gutachten" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_kosten_ueberblick')}
            </Link>
            <Link href="/haftpflicht/sv-kosten" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              {t('crosslink_sv_kosten_recht')}
            </Link>
            <Link href="/kfz-gutachter" className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield">
              {t('crosslink_gutachter')}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
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

      <ReviewerByline datum="2026-05-13" />

      <LandingFooter />
      <StickyCallBar quelle="Kfz-Gutachter Kosten" />
    </div>
  )
}
