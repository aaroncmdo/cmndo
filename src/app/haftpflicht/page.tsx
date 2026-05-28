import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { MdxLanguageBanner } from '@/components/content/MdxLanguageBanner'
import { groupSpokesByCluster, clusterLabel } from '@/lib/content/claimondo-mdx'
import { SITE_URL, WHATSAPP_HREF } from '@/lib/seo/jsonld'

// Stream A (Doc 25 Gap 3): Index-Hub fuer das Kfz-Haftpflichtschaden-Glossar.
// Bisher waren die 57 Spokes nur unter /haftpflicht/[slug] erreichbar — /haftpflicht
// selbst war ein 404, obwohl alle Spoke-Schema-Bloecke ihr DefinedTermSet auf
// https://claimondo.de/haftpflicht zeigen. Diese Seite gibt dem Cluster die
// crawlbare Hub-URL (vollstaendige Auflistung nach Cluster, kein 3er-Teaser wie
// ClusterHubGrid auf der Cornerstone).

const WA = WHATSAPP_HREF
const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

// Kurz-Titel je Cluster (clusterLabel = Langform) — gespiegelt aus ClusterHubGrid
// fuer konsistente Benennung zwischen Cornerstone-Teaser und Glossar-Hub.
const SHORT: Record<string, string> = {
  H1: 'Haftungs-Grundlagen',
  H2: 'Anspruchs-Grundlagen',
  H3: 'Schadenspositionen',
  H4: 'Fristen',
  H6: 'Standard-Unfaelle',
  H7: 'Komplexe Faelle',
}
const ORDER = ['H1', 'H2', 'H3', 'H4', 'H6', 'H7']

export const metadata: Metadata = {
  title: 'Kfz-Haftpflichtschaden-Glossar — Begriffe, Ansprüche & Quoten · Claimondo',
  description:
    'Glossar zum Kfz-Haftpflichtschaden: Haftungsgrundlagen, Schadenspositionen und Fristen — jeder Begriff mit BGH-Bezug. Unverschuldet? §249 BGB.',
  alternates: { canonical: '/haftpflicht' },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/haftpflicht`,
    title: 'Kfz-Haftpflichtschaden-Glossar',
    description:
      'Alle Begriffe rund um den Kfz-Haftpflichtschaden — nach Cluster sortiert, mit BGH-Bezug und typischen Haftungsquoten.',
    locale: 'de_DE',
    siteName: 'Claimondo',
  },
}

export default function Page() {
  const groups = groupSpokesByCluster()
  const clusters = ORDER.filter((c) => groups[c]?.length)
  const total = clusters.reduce((n, c) => n + (groups[c]?.length ?? 0), 0)

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1040px] px-6 py-10">
        <MdxLanguageBanner />
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">
            Start
          </Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Kfz-Haftpflichtschaden-Glossar</span>
        </nav>

        <header className="max-w-3xl">
          <h1 style={HEAD_FONT} className="text-3xl font-bold text-claimondo-navy">
            Kfz-Haftpflichtschaden — Glossar &amp; Anspruchs-Lexikon
          </h1>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            {total} Begriffe rund um den unverschuldeten Kfz-Haftpflichtschaden — von den{' '}
            <strong className="text-claimondo-navy">Haftungs-Grundlagen</strong> über die einzelnen{' '}
            <strong className="text-claimondo-navy">Schadenspositionen</strong> und{' '}
            <strong className="text-claimondo-navy">Fristen</strong> bis zu den typischen{' '}
            <strong className="text-claimondo-navy">Unfall-Szenarien</strong>. Jeder Eintrag erklärt
            den Begriff mit BGH-Bezug, nennt die typische Haftungsquote und den konkreten nächsten
            Schritt. Bei unverschuldetem Unfall trägt die gegnerische Haftpflichtversicherung die
            Kosten (§ 249 BGB).
          </p>
        </header>

        {clusters.map((c) => (
          <section key={c} id={`cluster-${c.toLowerCase()}`} className="my-9 scroll-mt-24">
            <div className="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-claimondo-light-blue">
              Cluster {c}
            </div>
            <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
              {SHORT[c] ?? clusterLabel(c)}
            </h2>
            <p className="mb-4 mt-1 max-w-3xl text-[0.8125rem] leading-relaxed text-claimondo-shield">
              {clusterLabel(c)}
            </p>
            <div className="grid gap-3.5 md:grid-cols-2">
              {groups[c].map((s) => (
                <Link
                  key={s.url}
                  href={s.url}
                  className="block rounded-ios-md border border-claimondo-border bg-white p-[18px] transition-colors hover:border-claimondo-ondo"
                >
                  <h3 style={HEAD_FONT} className="font-bold text-claimondo-navy">
                    {s.title}
                  </h3>
                  {s.snippet ? (
                    <p className="mt-1.5 line-clamp-3 text-[0.8125rem] leading-relaxed text-claimondo-shield">
                      {s.snippet}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))}

        <SpokeCtaBand headline="Unklar, welcher Anspruch Ihnen zusteht? Wir prüfen Ihren Fall kostenfrei." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Hub: Haftpflicht-Glossar" whatsappHref={WA} />
    </div>
  )
}
