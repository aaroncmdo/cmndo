import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { getSachverstaendige } from '@/lib/content/claimondo-mdx'
import { SITE_URL } from '@/lib/seo/jsonld'

const WA = 'https://wa.me/4922125906530'
const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export const metadata: Metadata = {
  title: 'Kfz-Sachverständige & Verbände — BVSK, DEKRA, IfS, öbV · Claimondo',
  description:
    'Welche Kfz-Sachverständigen-Verbände und Zertifizierungen gibt es — BVSK, DEKRA, GTÜ/KÜS/TÜV, ZKF, IfS, ZAK, IHK-öbV? Und warum Sie nach § 249 BGB Ihren eigenen unabhängigen Sachverständigen frei wählen.',
  alternates: { canonical: '/sachverstaendige' },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/sachverstaendige`,
    title: 'Kfz-Sachverständige & Verbände in Deutschland',
    description:
      'BVSK, DEKRA, GTÜ/KÜS/TÜV, ZKF, IfS, ZAK, IHK-öbV und Prüfdienstleister — verständlich erklärt, mit Ihren Rechten nach § 249 BGB.',
    locale: 'de_DE',
    siteName: 'Claimondo',
  },
}

export default function Page() {
  const spokes = [...getSachverstaendige()].sort((a, b) =>
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
          <span className="text-claimondo-navy">Sachverständige</span>
        </nav>

        <header className="max-w-3xl">
          <h1 style={HEAD_FONT} className="text-3xl font-bold text-claimondo-navy">
            Kfz-Sachverständige &amp; Verbände in Deutschland
          </h1>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            BVSK, DEKRA, GTÜ, KÜS, TÜV, IfS, ZAK, IHK-öbV — die Landschaft der Kfz-Sachverständigen ist
            unübersichtlich. Diese Übersicht erklärt die wichtigsten Verbände, Zertifizierungen und
            Prüforganisationen verständlich. Das Wichtigste vorweg: Bei einem unverschuldeten Unfall wählen
            Sie nach <strong className="text-claimondo-navy">§ 249 BGB</strong> Ihren eigenen, unabhängigen
            Sachverständigen frei — die Kosten trägt der gegnerische Haftpflichtversicherer.
          </p>
        </header>

        <section className="my-9">
          <h2 style={HEAD_FONT} className="mb-4 text-xl font-bold text-claimondo-navy">
            Verbände, Zertifizierungen &amp; Prüfdienste
          </h2>
          <div className="grid gap-3.5 md:grid-cols-2">
            {spokes.map((s) => (
              <Link
                key={s.url}
                href={s.url}
                className="block rounded-ios-md border border-claimondo-border bg-white p-[18px] transition-colors hover:border-claimondo-ondo"
              >
                <h3 style={HEAD_FONT} className="font-bold text-claimondo-navy">
                  {s.title}
                </h3>
                {s.snippet ? (
                  <p className="mt-1.5 line-clamp-3 text-[0.8125rem] leading-relaxed text-claimondo-shield">{s.snippet}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>

        <SpokeCtaBand headline="Eigenen Sachverständigen finden — bundesweit, in unter 48 Stunden." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Hub: Sachverständige" whatsappHref={WA} />
    </div>
  )
}
