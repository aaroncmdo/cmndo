import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { getDecoder } from '@/lib/content/claimondo-mdx'
import { SITE_URL, WHATSAPP_HREF } from '@/lib/seo/jsonld'

// Stream A (Doc 25): Index-Hub für die Versicherer-Brief-Decoder. Bisher waren
// die 10 Decoder nur unter /decoder/[slug] erreichbar (kein Cluster-Index) —
// diese Seite gibt dem Cluster eine eigene crawlbare Hub-URL.

const WA = WHATSAPP_HREF
const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export const metadata: Metadata = {
  title: 'Versicherer-Brief-Decoder — Antwort auf jedes Kürzungsschreiben · Claimondo',
  description:
    'Die Versicherung kürzt Wertminderung, Mietwagen oder Nutzungsausfall — oder schickt ihren eigenen Gutachter? Unsere Decoder zerlegen die häufigsten Versicherer-Standardbriefe Satz für Satz und liefern die BGH-konforme Gegenargumentation.',
  alternates: { canonical: '/decoder' },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/decoder`,
    title: 'Versicherer-Brief-Decoder',
    description:
      'Was der Versicherer schreibt → was er meint → BGH-konformes Gegenargument. Antwort-Vorlagen für die häufigsten Kürzungs- und Standardbriefe.',
    locale: 'de_DE',
    siteName: 'Claimondo',
  },
}

export default function Page() {
  const decoder = [...getDecoder()].sort((a, b) =>
    (a.nummer ?? '').localeCompare(b.nummer ?? '', 'de', { numeric: true }),
  )

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1040px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">
            Start
          </Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Versicherer-Brief-Decoder</span>
        </nav>

        <header className="max-w-3xl">
          <h1 style={HEAD_FONT} className="text-3xl font-bold text-claimondo-navy">
            Versicherer-Brief-Decoder
          </h1>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Standardbriefe der gegnerischen Haftpflichtversicherung folgen Mustern: Wertminderung
            gestrichen, Mietwagen „zu hoch", Gutachten „nicht erforderlich". Jeder Decoder zerlegt ein
            solches Schreiben Satz für Satz — <strong className="text-claimondo-navy">was der Versicherer
            schreibt → was er meint → das BGH-konforme Gegenargument</strong> — und endet mit dem nächsten
            konkreten Schritt. Bei unverschuldetem Unfall trägt der Gegner die Kosten (§ 249 BGB).
          </p>
        </header>

        <section className="my-9">
          <h2 style={HEAD_FONT} className="mb-4 text-xl font-bold text-claimondo-navy">
            Die {decoder.length} häufigsten Versicherer-Schreiben
          </h2>
          <div className="grid gap-3.5 md:grid-cols-2">
            {decoder.map((d) => (
              <Link
                key={d.url}
                href={d.url}
                className="block rounded-ios-md border border-claimondo-border bg-white p-[18px] transition-colors hover:border-claimondo-ondo"
              >
                <h3 style={HEAD_FONT} className="font-bold text-claimondo-navy">
                  {d.title}
                </h3>
                {d.snippet ? (
                  <p className="mt-1.5 line-clamp-3 text-[0.8125rem] leading-relaxed text-claimondo-shield">{d.snippet}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>

        <SpokeCtaBand headline="Genau diesen Brief bekommen? Wir antworten kostenfrei für dich." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Hub: Decoder" whatsappHref={WA} />
    </div>
  )
}
