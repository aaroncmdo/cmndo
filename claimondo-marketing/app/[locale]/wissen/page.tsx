import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { getWissenData } from '@/lib/feed/wissen'
import { SITE_URL, WHATSAPP_HREF, jsonLdScript, OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'
import type { FeedItem } from '@/lib/feed/types'
import { GuidePopover } from '@/components/content/GuidePopover'

// Lesbare Wissens-Uebersicht — die menschliche Zwillingsseite des Maschinen-Feeds
// (/feed.xml, /feed/katalog.xml). Gleiche Quelle (getWissenData -> Asset-Loader),
// hier als crawl- und lesbarer Themen-Hub aufbereitet. de-only (Body deutsch ->
// canonical auf die de-Version, vgl. /versicherer + /haftpflicht).

const WA = WHATSAPP_HREF
const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export const metadata: Metadata = {
  title: 'Wissen & Ratgeber zur Kfz-Schadenregulierung',
  // 168 -> 146 Zeichen: Google kappt die Description bei rund 158.
  description:
    'Alle Ratgeber, Versicherer-Brief-Decoder, Versicherer-Profile und Sachverständigen-Themen rund um den unverschuldeten Kfz-Schaden – mit BGH-Bezug.',
  alternates: { canonical: '/wissen' },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/wissen`,
    title: 'Wissen & Ratgeber zur Kfz-Schadenregulierung',
    description:
      'Verständlich erklärtes Wissen rund um den unverschuldeten Kfz-Schaden: Ratgeber, Versicherer-Brief-Decoder, Versicherer-Profile und Sachverständige.',
    locale: 'de_DE',
    siteName: 'Claimondo',
    images: OG_DEFAULT_IMAGES,
  },
}

/** Internen Pfad aus der absoluten Feed-URL ableiten (kein Full-Reload via <Link>). */
function toInternalHref(link: string): string {
  return link.startsWith(SITE_URL) ? link.slice(SITE_URL.length) : link
}

function WissenCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={toInternalHref(item.link)}
      className="block rounded-ios-md border border-claimondo-border bg-white p-[18px] transition-colors hover:border-claimondo-ondo"
    >
      <h3 style={HEAD_FONT} className="font-bold leading-snug text-claimondo-navy">
        {item.title}
      </h3>
      {item.excerpt ? (
        <p className="mt-1.5 line-clamp-3 text-[0.8125rem] leading-relaxed text-claimondo-shield">
          {item.excerpt}
        </p>
      ) : null}
    </Link>
  )
}

export default async function Page() {
  const { gruppen, weiterstoebern } = await getWissenData()
  const alleItems = gruppen.flatMap((g) => g.items)

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Wissen & Ratgeber zur Kfz-Schadenregulierung',
    description:
      'Wissens-Inhalte von Claimondo zur Kfz-Haftpflicht-Schadenregulierung: Ratgeber, Versicherer-Brief-Decoder, Versicherer-Profile und Sachverständige.',
    numberOfItems: alleItems.length,
    itemListElement: alleItems.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: it.link,
      name: it.title,
    })),
  }

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(itemListSchema)}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1040px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">
            Start
          </Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Wissen & Ratgeber</span>
        </nav>

        <header className="max-w-3xl">
          <h1 style={HEAD_FONT} className="text-3xl font-bold text-claimondo-navy">
            Wissen & Ratgeber rund um den Kfz-Schaden
          </h1>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Verständlich erklärtes Wissen für unverschuldet Geschädigte – von den großen{' '}
            <strong className="text-claimondo-navy">Ratgebern</strong> über den{' '}
            <strong className="text-claimondo-navy">Versicherer-Brief-Decoder</strong> und die{' '}
            <strong className="text-claimondo-navy">Versicherer-Profile</strong> bis zu den{' '}
            <strong className="text-claimondo-navy">Sachverständigen-Verbänden</strong>. Jeder
            Beitrag erklärt das Thema mit BGH-Bezug und konkretem nächsten Schritt. Bei
            unverschuldetem Unfall trägt die gegnerische Haftpflichtversicherung die Kosten
            (§ 249 BGB).
          </p>
        </header>

        {gruppen.map((g) => (
          <section key={g.key} id={`thema-${g.key}`} className="my-9 scroll-mt-24">
            <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
              {g.label}
            </h2>
            <p className="mb-4 mt-1 max-w-3xl text-[0.8125rem] leading-relaxed text-claimondo-shield">
              {g.hint}
            </p>
            <div className="grid gap-3.5 md:grid-cols-2">
              {g.items.map((item) => (
                <WissenCard key={item.guid} item={item} />
              ))}
            </div>
          </section>
        ))}

        <section className="my-10 border-t border-claimondo-border pt-8">
          <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
            Weiter stöbern
          </h2>
          <div className="mt-4 grid gap-3.5 md:grid-cols-2">
            {weiterstoebern.map((h) => (
              <Link
                key={h.href}
                href={h.href}
                className="group block rounded-ios-md border border-claimondo-border bg-white p-5 transition-colors hover:border-claimondo-ondo"
              >
                <span
                  style={HEAD_FONT}
                  className="flex items-center gap-1.5 font-bold text-claimondo-navy"
                >
                  {h.label}
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-claimondo-shield">
                  {h.hint}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <SpokeCtaBand headline="Unverschuldet verunfallt? Wir regeln Ihren Schaden – kostenfrei nach § 249 BGB." />
      </main>
      <LandingFooter />
      {/* Guide-Angebot bei 15 % Lesetiefe. Ohne eigenen Selektor: die Seite
          hat kein <article>, GuidePopover faellt auf den Seiteninhalt zurueck. */}
      <GuidePopover />
      <StickyCallBar quelle="Hub: Wissen & Ratgeber" whatsappHref={WA} />
    </div>
  )
}
