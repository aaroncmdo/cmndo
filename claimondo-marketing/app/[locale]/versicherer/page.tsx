import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { getVersicherer } from '@/lib/content/claimondo-mdx'
import { BAFIN_BRANCHENSCHNITT_2024 } from '@/data/versicherer-mapping'
import { getInitials } from '@/lib/initials'
import { SITE_URL, WHATSAPP_HREF } from '@/lib/seo/jsonld'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

const META_DESC =
  'Schadensregulierung der größten deutschen Kfz-Haftpflichtversicherer: BaFin-Beschwerdequoten 2024, dokumentierte Kürzungspraxis und Ihre Rechte als Geschädigter — journalistisch eingeordnet, mit Quellen.'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Kfz-Haftpflichtversicherer im Vergleich · Claimondo',
    description: META_DESC,
    alternates: { canonical: '/versicherer' },
    openGraph: {
      type: 'website',
      url: `${SITE_URL}/versicherer`,
      title: 'Kfz-Haftpflichtversicherer im Vergleich',
      description: META_DESC,
      locale: 'de_DE',
      siteName: 'Claimondo',
    },
  }
}

export default function Page() {
  const versicherer = getVersicherer()

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Start', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Versicherer', item: `${SITE_URL}/versicherer` },
    ],
  }
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Kfz-Haftpflichtversicherer im Vergleich',
    itemListElement: versicherer.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: v.base.anzeigename,
      url: `${SITE_URL}${v.url}`,
    })),
  }

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb, itemList]) }}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1140px] px-6 py-10">
        <header className="border-b border-claimondo-border pb-7">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            <span className="h-1.5 w-1.5 rounded-full bg-claimondo-light-blue" aria-hidden />
            Versicherer-Hubs
          </div>
          <h1
            style={HEAD_FONT}
            className="max-w-3xl text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-claimondo-navy md:text-5xl"
          >
            Kfz-Haftpflichtversicherer im Vergleich
          </h1>
          <p className="mt-5 max-w-[65ch] text-[1.0625rem] leading-relaxed text-claimondo-shield">
            Wie regulieren die großen deutschen Kfz-Haftpflichtversicherer Schäden Dritter? Diese
            Hubs ordnen die BaFin-Beschwerdequoten 2024, die dokumentierte Kürzungspraxis und die
            wegweisende Rechtsprechung ein — und zeigen, welche Rechte Ihnen als unverschuldet
            Geschädigtem zustehen.
          </p>
        </header>

        {versicherer.length === 0 ? (
          <p className="py-16 text-center text-claimondo-shield/70">
            Die Versicherer-Hubs werden gerade aufgebaut.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {versicherer.map((v) => {
              const q = v.base.bafinQuote2024
              const ueberSchnitt = q !== null && q > BAFIN_BRANCHENSCHNITT_2024
              return (
                <li key={v.slug}>
                  <Link
                    href={v.url}
                    className="group flex h-full flex-col rounded-ios-md border border-claimondo-border bg-white p-5 shadow-claimondo-sm transition hover:border-claimondo-ondo/40 hover:shadow-md"
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-claimondo-navy text-sm font-bold text-white"
                      aria-hidden
                    >
                      {getInitials(v.base.anzeigename)}
                    </span>
                    <h2
                      style={HEAD_FONT}
                      className="mt-3 text-lg font-extrabold leading-snug text-claimondo-navy"
                    >
                      {v.base.anzeigename}
                    </h2>
                    <p className="mt-1 text-sm text-claimondo-shield/70">{v.base.mutterkonzern}</p>
                    <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      <div>
                        <dt className="text-claimondo-shield/60">Marktanteil</dt>
                        <dd className="font-bold text-claimondo-navy">
                          ca. {v.base.marktanteilPct.toLocaleString('de-DE')} %
                        </dd>
                      </div>
                      <div>
                        <dt className="text-claimondo-shield/60">BaFin-Quote 2024</dt>
                        <dd
                          className={`inline-flex items-center gap-1 font-bold ${
                            ueberSchnitt ? 'text-red-600' : 'text-claimondo-navy'
                          }`}
                        >
                          {ueberSchnitt && <ShieldAlert className="h-3.5 w-3.5" aria-hidden />}
                          {q !== null ? q.toLocaleString('de-DE') : '—'}
                        </dd>
                      </div>
                    </dl>
                    <span className="mt-auto pt-4 text-sm font-semibold text-claimondo-ondo group-hover:underline">
                      Mehr erfahren →
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Versicherer-Hub-Index" whatsappHref={WHATSAPP_HREF} />
    </div>
  )
}
