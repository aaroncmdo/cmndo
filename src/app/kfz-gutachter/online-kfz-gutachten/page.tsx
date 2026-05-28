import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, Scale, Check, X, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  onlineGutachtenSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

const PAGE_PATH = '/kfz-gutachter/online-kfz-gutachten'
const STAND = '25.05.2026'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('kfz_gutachter_online.title'),
    description: t('kfz_gutachter_online.description'),
    keywords: [
      'online kfz-gutachten',
      'kfz-gutachten ohne besichtigung',
      'lg bremen online gutachten',
      'ferngutachten kfz',
      'digitales kfz-gutachten',
      'kfz-gutachten foto',
      '9 O 1720/24',
    ],
    alternates: { canonical: PAGE_PATH, ...buildLanguageAlternates(PAGE_PATH) },
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}${PAGE_PATH}`,
      title: t('kfz_gutachter_online.og_title'),
      description: t('kfz_gutachter_online.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'LG Bremen 2026: Grenzen für Online-Kfz-Gutachten' }],
    },
  }
}

const FAQ_SCHEMA = [
  {
    frage: 'Ist ein „Online-Kfz-Gutachten" mit Foto-Upload überhaupt verboten?',
    antwort:
      'Nicht jedes digitale Element ist verboten — aber ein vollständiges Gutachten allein auf Basis hochgeladener Fotos ohne persönliche Fahrzeug-Besichtigung hat das LG Bremen am 16.01.2026 (Az. 9 O 1720/24) als irreführende Werbung untersagt. Entscheidend ist die persönliche Inaugenscheinnahme durch den Sachverständigen. Ein Foto-Vor-Check zur ersten Schadenseinschätzung bleibt zulässig, ein darauf gestütztes Gutachten nicht.',
  },
  {
    frage: 'Akzeptieren Versicherungen Gutachten ohne Vor-Ort-Termin?',
    antwort:
      'In der Regel nicht zuverlässig. Versicherer erkennen Sachverständigen-Gutachten an, wenn sie auf einer persönlichen Begutachtung beruhen. Ein Kfz-Gutachten ohne Besichtigung riskiert, von der gegnerischen Versicherung als nicht belastbar zurückgewiesen zu werden — mit entsprechendem Risiko für Ihre Schadensregulierung.',
  },
  {
    frage: 'Was passiert mit meinem Schadensanspruch, wenn ich ein unzulässiges Online-Gutachten nutze?',
    antwort:
      'Im ungünstigen Fall steht Ihnen kein belastbares Beweismittel zur Verfügung. Wird das Gutachten angezweifelt, sind Reparaturkosten, Wertminderung und weitere Positionen schwerer durchsetzbar. Sicherer ist ein Gutachten mit persönlicher Besichtigung, das gegenüber der Versicherung und vor Gericht Bestand hat.',
  },
  {
    frage: 'Wie unterscheidet sich ein „digitales Gutachten" von einem „Online-Gutachten"?',
    antwort:
      'Ein digitales Gutachten meint einen digitalen Workflow — Online-Auftrag, Foto-Upload, digitale Kommunikation — bei dem der Sachverständige das Fahrzeug trotzdem persönlich vor Ort besichtigt. Ein „Online-Gutachten" im untersagten Sinn meint die Erstellung allein aus eingereichten Fotos ohne Besichtigung. Das erste ist zulässig und Standard, das zweite hat das LG Bremen beanstandet.',
  },
  {
    frage: 'Ist das LG-Bremen-Urteil rechtskräftig?',
    antwort:
      'Nein. Das Urteil vom 16.01.2026 (9 O 1720/24) ist nach unserem Kenntnisstand noch nicht rechtskräftig. Es setzt aber bereits jetzt einen deutlichen Maßstab, an dem sich seriöse Anbieter orientieren.',
  },
]

export default function OnlineKfzGutachtenPage() {
  const t = useTranslations('kfz_gutachter_online')
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          onlineGutachtenSchema({ modified: '2026-05-25' }),
          faqPageSchema(FAQ_SCHEMA),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Online-Kfz-Gutachten', url: PAGE_PATH },
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
          <p className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            <Scale className="h-4 w-4" />
            {t('hero_badge')}
          </p>
          <h1
            className="mt-4 text-balance text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('hero_h1_main')}{' '}
            <span className="text-claimondo-light-blue">{t('hero_h1_highlight')}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
            {t('hero_intro')}
          </p>
        </div>
      </section>

      {/* Direkt-Antwort */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="LG Bremen 9 O 1720/24 · 16.01.2026">
            {t.rich('answer_capsule', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
        </div>
      </section>

      {/* Warum 2026 wichtig */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            {t('warum_h2')}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t('warum_p1')}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t('warum_p2')}
          </p>
        </div>
      </section>

      {/* Urteil im Detail */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Scale className="h-7 w-7 text-claimondo-ondo" />
            <h2 className="text-3xl font-extrabold text-claimondo-navy">
              {t('urteil_h2')}
            </h2>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {(t.raw('urteil_meta') as Array<{ k: string; v: string }>).map((meta) => (
              <div key={meta.k} className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-claimondo-ondo">{meta.k}</div>
                <div className="mt-1 text-sm font-semibold text-claimondo-navy">{meta.v}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[15px] leading-relaxed text-claimondo-shield">
            {t('urteil_intro')}
          </p>

          {/* Zitat-Karte */}
          <blockquote className="my-6 rounded-ios-md border-l-4 border-claimondo-navy bg-white p-5 shadow-glass-card">
            <p className="text-[15px] italic leading-relaxed text-claimondo-navy">
              {t('urteil_zitat')}
            </p>
            <footer className="mt-2 text-xs text-claimondo-ondo">
              {t('urteil_zitat_quelle')}
            </footer>
          </blockquote>

          <ol className="mt-2 space-y-4 text-[15px] leading-relaxed text-claimondo-shield">
            {(t.raw('urteil_punkte') as Array<{ titel: string; text: string }>).map((punkt, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-xs font-bold text-white">{idx + 1}</span>
                <span>
                  <strong className="text-claimondo-navy">{punkt.titel}</strong>{' '}
                  {punkt.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Erlaubt vs Verboten */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">{t('erlaubt_h2')}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-claimondo-shield">
            {t('erlaubt_intro')}
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-ios-md border border-emerald-200 bg-emerald-50/60 p-6">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-emerald-700">
                <Check className="h-5 w-5" /> {t('erlaubt_h3')}
              </h3>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-claimondo-shield">
                {(t.raw('erlaubt_items') as string[]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-ios-md border border-red-200 bg-red-50/60 p-6">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-red-700">
                <X className="h-5 w-5" /> {t('verboten_h3')}
              </h3>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-claimondo-shield">
                {(t.raw('verboten_items') as string[]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Checkliste */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            {t('checkliste_h2')}
          </h2>
          <div className="mt-8 space-y-3">
            {(t.raw('checkliste_items') as string[]).map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-ios-md border border-claimondo-border bg-white p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-claimondo-ondo" />
                <span className="text-sm leading-relaxed text-claimondo-shield">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Wie Claimondo damit umgeht */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">{t('claimondo_h2')}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t.rich('claimondo_p1', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t('claimondo_p2_before')}{' '}
            <strong>{t('claimondo_p2_kanzlei')}</strong>
            {t('claimondo_p2_after')}{' '}
            <Link href="/wie-es-funktioniert" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
              {t('claimondo_link_ablauf')}
            </Link>
            {t('claimondo_link_vergleich_before')}{' '}
            <Link href="/kfz-gutachter/vermittlungsportale-vergleich" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
              {t('claimondo_link_vergleich')}
            </Link>.
          </p>
        </div>
      </section>

      {/* Verwandte Urteile */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">{t('verwandte_h2')}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            {t('verwandte_p')}{' '}
            <Link href="/vorteile" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
              {t('verwandte_link_vorteile')}
            </Link>{' '}
            {t('verwandte_suffix')}
          </p>
          <ul className="mt-5 space-y-2 text-sm leading-relaxed text-claimondo-ondo">
            {([
              { href: 'https://www.wettbewerbszentrale.de/lg-bremen-irrefuehrende-werbung-mit-online-kfz-gutachten/', idx: 0 },
              { href: 'https://www.iww.de/ue/schadenregulierung/schadengutachten-lg-bremen-online-gutachten-ohne-besichtigung-durch-den-gutachter-sind-unzulaessig-f172818', idx: 1 },
              { href: 'https://www.wettbewerbszentrale.de/lg-frankfurt-untersagt-irrefuehrende-werbung-fuer-ferngutachten/', idx: 2 },
              { href: 'https://www.autohaus.de/nachrichten/schadenbusiness/gericht-setzt-schadenplattformen-klare-grenzen-online-kfz-gutachten-gibt-es-nicht-3779423', idx: 3 },
              { href: 'https://www.anwalt.de/rechtstipps/online-unfallgutachten-ohne-fahrzeugbesichtigung-warum-das-ein-problem-ist-266537.html', idx: 4 },
            ] as Array<{ href: string; idx: number }>).map(({ href, idx }) => (
              <li key={idx}>
                <a href={href} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-claimondo-navy">
                  {(t.raw('quellen') as string[])[idx]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">{t('faq_h2')}</h2>
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
          <p className="mt-8 text-xs leading-relaxed text-claimondo-shield/70">
            {t('disclaimer')} Stand: {STAND}.
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
      <StickyCallBar quelle="Online-Kfz-Gutachten Wissens-Page" />
    </div>
  )
}
