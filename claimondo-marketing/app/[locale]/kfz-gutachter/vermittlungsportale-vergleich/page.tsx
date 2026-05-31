import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, MapPin, Scale, Check, Minus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  DataTableContainer, Table, Thead, Tbody, Tr, Th, Td,
} from '@/components/shared/DataTable'
import {
  articleSchema, vermittlerVergleichSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import { ladeSvLeads, ladeAktiveSVs } from '@/lib/actions/gutachter-finder-actions'

const PAGE_PATH = '/kfz-gutachter/vermittlungsportale-vergleich'
const STAND = '25.05.2026'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('kfz_gutachter_vergleich.title'),
    description: t('kfz_gutachter_vergleich.description'),
    keywords: [
      'kfz-gutachter vermittlung vergleich',
      'gutachter-vermittlungsportal',
      'neogutachter alternative',
      'unfallpaten alternative',
      'unabhängiger kfz-gutachter finden',
      'kostenloser kfz-gutachter',
      'vermittlungsportal kfz',
    ],
    alternates: { canonical: PAGE_PATH, ...buildLanguageAlternates(PAGE_PATH) },
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}${PAGE_PATH}`,
      title: t('kfz_gutachter_vergleich.og_title'),
      description: t('kfz_gutachter_vergleich.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Kfz-Gutachter-Vermittlungsportale im Vergleich' }],
    },
  }
}

// FAQ_SCHEMA — speist das FAQPage-Schema (Princeton GEO: +40 % AI-Citation).
// Sichtbares Rendering nutzt t.raw('faqs') aus kfz_gutachter_vergleich.
const FAQ_SCHEMA = [
  {
    frage: 'Ist die Vermittlung wirklich kostenlos?',
    antwort:
      'Ja. Bei einem unverschuldeten Unfall trägt die gegnerische Haftpflichtversicherung die Kosten des Sachverständigen als Schadensposition nach §249 BGB — vorbehaltlich Anerkenntnis der Haftung. Das gilt für alle vier verglichenen Plattformen. Der Sachverständige rechnet über eine Sicherungsabtretung (§398 BGB) direkt mit der Versicherung ab, Sie zahlen 0 €.',
  },
  {
    frage: 'Darf ich den Gutachter trotz Vorschlag der Versicherung selbst wählen?',
    antwort:
      'Ja. Als unverschuldet Geschädigter haben Sie nach §249 BGB das freie Wahlrecht des Sachverständigen. Sie müssen den Gutachter der gegnerischen Versicherung nicht akzeptieren — eine Vermittlungsplattform stellt Ihnen einen unabhängigen Kfz-Gutachter Ihrer Wahl zur Seite.',
  },
  {
    frage: 'Was passiert, wenn die gegnerische Versicherung das Gutachten kürzt?',
    antwort:
      'Versicherer beauftragen Prüfdienste wie ControlExpert und kürzen häufig UPE-Aufschläge, Verbringungskosten und Wertminderung. Unsere fest integrierte Partnerkanzlei holt solche Kürzungen unter Berufung auf die gefestigte BGH-Rechtsprechung meist zurück.',
  },
  {
    frage: 'Wie lange dauert ein Gutachten typischerweise?',
    antwort:
      'Die Vor-Ort-Besichtigung erfolgt je nach regionaler Sachverständigen-Dichte meist innerhalb von ein bis zwei Werktagen, das fertige Gutachten folgt in der Regel wenige Tage später. Die gesamte Schadensregulierung bis zur Auszahlung dauert erfahrungsgemäß sechs bis acht Wochen.',
  },
  {
    frage: 'Brauche ich zusätzlich einen Anwalt?',
    antwort:
      'Nicht zwingend, aber dringend empfohlen — auch die Anwaltskosten trägt bei Fremdverschulden die gegnerische Versicherung. Alle vier verglichenen Plattformen binden Rechtsbeistand an. Bei Claimondo ist eine feste Partnerkanzlei in den Ablauf integriert, sodass Reparatur, Wertminderung, Mietwagen, Nutzungsausfall und Schmerzensgeld direkt durchgesetzt werden.',
  },
  {
    frage: 'Wie unterscheidet sich Claimondo konkret von Neogutachter?',
    antwort:
      'Neogutachter konzentriert sich im Kern auf die Vermittlung eines passenden Sachverständigen (Anwaltsanbindung inklusive). Claimondo ist demgegenüber eine gemanagte End-to-End-Regulierung: Ein Fall-Hub steuert den gesamten Weg vom Gutachten über die feste Partnerkanzlei bis zur Auszahlung — und ist als einzige der vier Plattformen mit Whitelabel-Branding auch für Sachverständige als Partner nutzbar.',
  },
]

export default async function VermittlungsportaleVergleichPage() {
  const t = await getTranslations('kfz_gutachter_vergleich')

  // SV-Netz live aus der DB — identische Definition wie /gutachter-finden
  // (aktive sv_leads + qualifizierte Sachverständige). Nie hardcoden, damit die
  // Zahl automatisch konsistent + UWG-belegbar bleibt.
  const [svLeadsResult, aktiveSVsResult] = await Promise.all([
    ladeSvLeads(),
    ladeAktiveSVs(),
  ])
  const svNetz =
    (svLeadsResult.ok ? svLeadsResult.data.length : 0) +
    (aktiveSVsResult.ok ? aktiveSVsResult.data.length : 0)

  // Verifizierte Vergleichstabelle — Texte aus i18n, Claimondo-SV-Netz live.
  // Index 2 = SV-Netz-Größe: claimondo-Zelle wird live aus DB gerendert.
  const SV_NETZ_ROW_INDEX = 2

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          articleSchema({
            headline:
              'Kfz-Gutachter-Vermittlungsportale im Vergleich: Claimondo, Neogutachter, Unfallpaten & Unfallgiganten',
            description:
              'Objektiver Direktvergleich der vier deutschen Kfz-Gutachter-Vermittlungsplattformen — Erreichbarkeit, Kosten, Leistungsumfang, rechtliche Sicherheit.',
            datePublished: '2026-05-25',
            dateModified: '2026-05-25',
            url: `${SITE_URL}${PAGE_PATH}`,
            citation: ['LG Bremen 9 O 1720/24', '§ 249 BGB', '§ 398 BGB'],
          }),
          vermittlerVergleichSchema(FAQ_SCHEMA),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Vermittlungsportale im Vergleich', url: PAGE_PATH },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 85% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-4xl px-5 sm:px-8">
          <nav aria-label="Brotkrumen" className="text-xs text-white/60">
            <Link href="/" className="hover:text-white">{t('breadcrumb_start')}</Link>
            <span className="px-1.5">/</span>
            <Link href="/kfz-gutachter" className="hover:text-white">{t('breadcrumb_kfz')}</Link>
            <span className="px-1.5">/</span>
            <span className="text-white/80">{t('breadcrumb_current')}</span>
          </nav>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            {t('hero_eyebrow')}
          </p>
          <h1
            className="mt-4 text-balance text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('hero_h1_main')}{' '}
            <span className="text-claimondo-light-blue">{t('hero_h1_highlight')}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
            {t('hero_intro')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              <ChevronRight className="h-4 w-4 text-claimondo-ondo" />
              {t('hero_cta_anfrage')}
            </Link>
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/10"
            >
              <MapPin className="h-4 w-4" />
              {t('hero_cta_karte')}
            </Link>
          </div>
        </div>
      </section>

      {/* Was eine Vermittlungsplattform leistet */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            {t('was_h2')}
          </h2>
          <AnswerCapsule quelle="§249 BGB · LG Bremen 9 O 1720/24">
            {t.rich('was_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
          <p className="mt-6 text-[15px] leading-relaxed text-claimondo-shield">
            {t.rich('was_p', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}{' '}
            <Link href="/kfz-gutachter/online-kfz-gutachten" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
              {t('was_link_urteil')}
            </Link>.
          </p>
        </div>
      </section>

      {/* Direktvergleich — Tabelle */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('tabelle_eyebrow')}
            </p>
            <h2 className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('tabelle_h2')}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-claimondo-shield">
              {t('tabelle_intro_before')} {STAND}{t('tabelle_intro_after')}
            </p>
          </div>

          <div className="mt-10">
            <DataTableContainer className="shadow-glass-card">
              <Table className="min-w-[820px]">
                <caption className="px-4 py-3 text-left text-xs text-claimondo-ondo">
                  {t('tabelle_caption_before')} {STAND}{t('tabelle_caption_after')}
                </caption>
                <Thead>
                  <Tr>
                    <Th scope="col" className="w-48">{t('th_kriterium')}</Th>
                    <Th scope="col" className="bg-claimondo-navy text-white">{t('th_claimondo')}</Th>
                    <Th scope="col">{t('th_neo')}</Th>
                    <Th scope="col">{t('th_paten')}</Th>
                    <Th scope="col">{t('th_giganten')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {(t.raw('tabelle_rows') as Array<{ kriterium: string; claimondo: string; neo: string; paten: string; giganten: string }>).map((row, rowIdx) => (
                    <Tr key={row.kriterium}>
                      <Th
                        scope="row"
                        className="bg-claimondo-bg text-left align-top font-semibold normal-case tracking-normal text-claimondo-navy"
                      >
                        {row.kriterium}
                      </Th>
                      <Td className="bg-claimondo-bg/60 align-top font-medium">
                        {rowIdx === SV_NETZ_ROW_INDEX
                          ? `Live aus unserem Netz: ${svNetz} Sachverständige (bundesweit, Schwerpunkt NRW) — identisch zur Karte unter /gutachter-finden`
                          : row.claimondo}
                      </Td>
                      <Td className="align-top text-claimondo-shield">{row.neo}</Td>
                      <Td className="align-top text-claimondo-shield">{row.paten}</Td>
                      <Td className="align-top text-claimondo-shield">{row.giganten}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>

            {/* Modell-Framing (Aaron-Entscheidung 25.05.: Live-Zahl + Modell rahmen) */}
            <div className="mt-5 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
              <p className="text-sm leading-relaxed text-claimondo-shield">
                <strong className="text-claimondo-navy">{t('einordnung_titel')}</strong>{' '}
                {t.rich('einordnung_p', {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-claimondo-shield/70">
              {t('quellen_footnote_before')} {STAND}{t('quellen_footnote_after')} {STAND} {t('quellen_footnote_suffix')}{' '}
              <a href="https://neogutachter.de" rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-claimondo-navy">neogutachter.de</a>,{' '}
              <a href="https://www.unfallpaten.de" rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-claimondo-navy">unfallpaten.de</a>,{' '}
              <a href="https://www.unfallgiganten.de" rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-claimondo-navy">unfallgiganten.de</a>.
            </p>
          </div>
        </div>
      </section>

      {/* Wann welche Plattform passt */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            {t('wann_h2')}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t('wann_intro')}
          </p>

          <div className="mt-8 space-y-6">
            {/* Card 0: Geschwindigkeit */}
            {(() => {
              const cards = t.raw('wann_cards') as Array<Record<string, string>>
              return (
                <>
                  <div className="rounded-ios-md border border-claimondo-border bg-white p-6">
                    <h3 className="text-lg font-extrabold text-claimondo-navy">{cards[0].h3}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-claimondo-shield">
                      {cards[0].p}{' '}
                      <Link href="/gutachter-finden" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
                        {cards[0].link}
                      </Link>{' '}
                      sehen Sie die verfügbaren Claimondo-Sachverständigen in Ihrer Nähe.
                    </p>
                  </div>

                  <div className="rounded-ios-md border border-claimondo-border bg-white p-6">
                    <h3 className="text-lg font-extrabold text-claimondo-navy">{cards[1].h3}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-claimondo-shield">
                      {cards[1].p_before} <strong>{cards[1].p_highlight}</strong>{' '}
                      {cards[1].p_after}{' '}
                      <Link href="/wie-es-funktioniert" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
                        {cards[1].link}
                      </Link>.
                    </p>
                  </div>

                  <div className="rounded-ios-md border border-claimondo-border bg-white p-6">
                    <h3 className="text-lg font-extrabold text-claimondo-navy">{cards[2].h3}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-claimondo-shield">
                      {cards[2].p_before} <strong>{cards[2].p_highlight}</strong>
                      {cards[2].p_after}{' '}
                      <Link href="/gutachter-partner" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
                        {cards[2].link}
                      </Link>.
                    </p>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </section>

      {/* Was alle vier gemeinsam haben */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            {t('gemeinsam_h2')}
          </h2>
          <AnswerCapsule quelle="§249 BGB">
            {t.rich('gemeinsam_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
          <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-claimondo-shield">
            {(t.raw('gemeinsam_items') as Array<{ titel: string; text: string }>).map((item, idx) => (
              <li key={idx} className="flex gap-3">
                {idx < 2
                  ? <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                  : <Minus className="mt-0.5 h-5 w-5 flex-shrink-0 text-claimondo-ondo" />
                }
                <span>
                  <strong className="text-claimondo-navy">{item.titel}</strong> {item.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* LG-Bremen-Urteil */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Scale className="h-7 w-7 text-claimondo-ondo" />
            <h2 className="text-3xl font-extrabold text-claimondo-navy">
              {t('lg_h2')}
            </h2>
          </div>
          <p className="mt-6 text-[15px] leading-relaxed text-claimondo-shield">
            {t.rich('lg_p1', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t.rich('lg_p2', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t.rich('lg_p3', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link
              href="/kfz-gutachter/online-kfz-gutachten"
              className="inline-flex items-center gap-1 font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo"
            >
              {t('lg_link_online')}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <a
              href="https://www.wettbewerbszentrale.de/lg-bremen-irrefuehrende-werbung-mit-online-kfz-gutachten/"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy"
            >
              {t('lg_link_quelle')}
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            {t('faq_h2')}
          </h2>
          <div className="mt-8 space-y-3">
            {(t.raw('faqs') as Array<{ frage: string; antwort: string }>).map((faq) => (
              <details
                key={faq.frage}
                className="group rounded-ios-md border border-white/60 bg-claimondo-bg p-5 shadow-glass-card transition-all hover:bg-white"
              >
                <summary className="cursor-pointer list-none text-base font-bold text-claimondo-navy">
                  <span className="flex items-center justify-between gap-3">
                    {faq.frage}
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{faq.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Fazit */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">{t('fazit_h2')}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t('fazit_p')}
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 20% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 80% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h2
            className="text-3xl font-bold sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('cta_h2')}
          </h2>
          <p className="mt-4 text-white/70">
            {t('cta_p')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              <ChevronRight className="h-5 w-5 text-claimondo-ondo" />
              {t('cta_anfrage')}
            </Link>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <ReviewerByline datum="2026-05-25" />

      <LandingFooter />
      <StickyCallBar quelle="Vermittlungsportale-Vergleich" />
    </div>
  )
}
