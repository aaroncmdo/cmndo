import Link from 'next/link'
import { getNewsFeedItems } from '@/lib/feed/news-items'
import { SITE_URL } from '@/lib/seo/jsonld'

// Startseiten-Teaser fuer den /wissen-Hub: zeigt 3 Beitraege aus dem Wissens-Feed
// (gleiche Quelle wie /feed.xml) + Link auf die volle Uebersicht. Server-Komponente
// (liest MDX zur Render-Zeit), bewusst dateless — die Karten sollen lesbar
// einladen, nicht ein (aktuell aelteres) Datum betonen.

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

function toInternalHref(link: string): string {
  return link.startsWith(SITE_URL) ? link.slice(SITE_URL.length) : link
}

export async function WissensRatgeberSection() {
  const items = (await getNewsFeedItems()).slice(0, 3)
  if (items.length === 0) return null

  return (
    <section className="bg-claimondo-bg py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            {/* Ondo statt Light-Blue: dieses Eyebrow steht als einziges auf dem
                HELLEN Grund (bg-claimondo-bg). Light-Blue ergibt dort 2,51:1,
                Ondo 4,76:1. Auf den Navy-Sektionen bleibt Light-Blue richtig
                (6,23:1) — deshalb hier gezielt eine Stelle statt global. */}
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
              Wissen &amp; Ratgeber
            </span>
            <h2
              style={HEAD_FONT}
              className="mt-1 max-w-2xl text-2xl font-bold text-claimondo-navy sm:text-3xl"
            >
              Verständlich erklärt: Ihre Rechte nach dem Unfall
            </h2>
          </div>
          <Link
            href="/wissen"
            className="hidden shrink-0 text-sm font-semibold text-claimondo-ondo transition-colors hover:text-claimondo-navy sm:inline"
          >
            Alle Themen ansehen →
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.guid}
              href={toInternalHref(item.link)}
              className="block rounded-ios-md border border-claimondo-border bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-sm"
            >
              <h3 style={HEAD_FONT} className="font-bold leading-snug text-claimondo-navy">
                {item.title}
              </h3>
              {item.excerpt ? (
                <p className="mt-2 line-clamp-3 text-[0.8125rem] leading-relaxed text-claimondo-shield">
                  {item.excerpt}
                </p>
              ) : null}
            </Link>
          ))}
        </div>

        <div className="mt-6 sm:hidden">
          <Link
            href="/wissen"
            className="text-sm font-semibold text-claimondo-ondo transition-colors hover:text-claimondo-navy"
          >
            Alle Themen ansehen →
          </Link>
        </div>
      </div>
    </section>
  )
}
