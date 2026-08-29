import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { localeAlternates, localeOpenGraph } from '@/lib/seo/alternates'
import { faqPageSchema, jsonLdScript } from '@/lib/seo/jsonld'

// "Was kostet Claimondo?" — die Antwort auf die haeufigste unausgesprochene Frage.
//
// ANLASS (Aaron 29.08.2026): "viele kunden haben angst dass die was zahlen
// muessen". Nachgemessen: "0 €" steht 233x in den Marketing-Messages,
// "Provision"/"verdienen" 7x — und jeder dieser Treffer auf der PARTNER-Seite,
// die kein Endkunde liest. Ein unbegruendetes "gratis" erzeugt Misstrauen.
//
// ⚠ ABGRENZUNG zu den bestehenden Kosten-Seiten — hier geht es NICHT um
// Gutachterhonorare:
//   /kfz-gutachter/kosten     was ein GUTACHTEN kostet (BVSK-Honorartabelle)
//   /kosten-kfz-gutachten     dasselbe Thema (bekannte Dublette, siehe P6 im
//                             B2C-Plan — dort steht die Konsolidierungs-Frage)
//   diese Seite               was UNSER SERVICE kostet und warum
// Der Titel traegt deshalb bewusst den Markennamen, nicht "Kfz-Gutachten".
//
// Der Abschnitt "Wann koennen doch Kosten entstehen?" ist Absicht, kein
// Beiwerk: Eine absolute Gratis-Aussage waere bei Bagatellschaden, Teilschuld
// oder Eigenverschulden schlicht unwahr — und eine spaetere Ueberraschung
// kostet mehr Vertrauen, als die ehrliche Einschraenkung vorher kostet.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('was_kostet_claimondo.title'),
    description: t('was_kostet_claimondo.description'),
    keywords: [
      'Was kostet Claimondo',
      'Claimondo kostenlos',
      'Claimondo Kosten',
      'Kfz-Gutachter kostenlos',
      'Gutachten wer zahlt',
      '§249 BGB Kosten',
    ],
    alternates: await localeAlternates('/was-kostet-claimondo'),
    openGraph: {
      type: 'website',
      siteName: 'Claimondo',
      ...(await localeOpenGraph('/was-kostet-claimondo')),
      title: t('was_kostet_claimondo.title'),
      description: t('was_kostet_claimondo.og_description'),
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Was kostet Claimondo' }],
    },
  }
}

export default async function WasKostetClaimondoPage() {
  const t = await getTranslations('was_kostet_claimondo')
  const items = t.raw('ehrlich_items') as string[]

  const faqs = [
    { frage: t('h1'), antwort: t('lead') },
    { frage: t('warum_h'), antwort: t('warum_p') },
    { frage: t('ehrlich_h'), antwort: `${t('ehrlich_p')} ${items.join(' ')} ${t('ehrlich_schluss')}` },
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqPageSchema(faqs))} />
      <LandingTopbar authenticatedUser={null} />

      <main className="bg-white">
        {/* Direkt-Antwort zuerst — wer diese Seite oeffnet, will eine Zahl, keinen Aufsatz. */}
        <section className="border-b border-claimondo-border/60 bg-claimondo-bg">
          <div className="mx-auto max-w-4xl px-5 py-16 sm:py-24 lg:px-8">
            <h1 className="text-balance text-4xl font-extrabold leading-tight tracking-tight text-claimondo-navy sm:text-5xl">
              {t('h1')}
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-claimondo-navy sm:text-2xl">
              {t('lead')}
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-5 py-16 sm:py-20 lg:px-8">
          <section aria-labelledby="warum">
            <h2 id="warum" className="text-2xl font-bold text-claimondo-navy sm:text-3xl">
              {t('warum_h')}
            </h2>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-claimondo-shield">
              {t('warum_p')}
            </p>
          </section>

          <section aria-labelledby="gegenseite" className="mt-14">
            <h2 id="gegenseite" className="text-2xl font-bold text-claimondo-navy sm:text-3xl">
              {t('gegner_h')}
            </h2>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-claimondo-shield">
              {t('gegner_p')}
            </p>
          </section>

          {/* Die Einschraenkungen stehen bewusst AUF derselben Seite wie das
              Versprechen — nicht im Kleingedruckten einer anderen. */}
          <section
            aria-labelledby="ehrlich"
            className="mt-14 rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-6 sm:p-8"
          >
            <h2 id="ehrlich" className="text-2xl font-bold text-claimondo-navy sm:text-3xl">
              {t('ehrlich_h')}
            </h2>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-claimondo-shield">
              {t('ehrlich_p')}
            </p>
            <ul className="mt-6 space-y-4">
              {items.map((item) => (
                <li key={item} className="flex gap-3 text-base leading-relaxed text-claimondo-navy">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-claimondo-ondo" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-prose text-base font-medium leading-relaxed text-claimondo-navy">
              {t('ehrlich_schluss')}
            </p>
          </section>

          <section aria-labelledby="cta" className="mt-16 text-center">
            <h2 id="cta" className="text-2xl font-bold text-claimondo-navy sm:text-3xl">
              {t('cta_h')}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-claimondo-shield">
              {t('cta_p')}
            </p>
            <Link
              href="/check"
              className="mt-8 inline-flex items-center justify-center rounded-ios-md bg-claimondo-navy px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-claimondo-shield"
            >
              {t('cta_btn')}
            </Link>
          </section>
        </div>
      </main>

      <LandingFooter />
      <StickyCallBar quelle="Was kostet Claimondo" />
    </>
  )
}
