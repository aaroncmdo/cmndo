import Link from 'next/link'
import { MessageSquare, ArrowRight } from 'lucide-react'
import { getCommunityFeed } from '@/lib/community/community-queries'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const ANZAHL = 3

// Anriss des B2B-Feeds auf der Startseite. Der vollstaendige Feed lebt seit
// 24.08.2026 unter /community.
//
// Warum ein Anriss statt der ganzen Sektion: Der volle Feed war mit 18.501 px
// der groesste Block der Startseite (37 % der Gesamthoehe mobil, 2.243 Woerter,
// 62 Links). Vor allem aber gehoert er einer anderen Zielgruppe — fachlicher
// Austausch unter Sachverstaendigen, Maklern und Werkstaetten, waehrend die
// Startseite dem Unfallgeschaedigten kurz nach dem Schaden gehoert (PRODUCT.md).
//
// Bewusst KEINE PostCards: die tragen Like- und Kommentar-Interaktion und
// brauchen den Auth-Zustand. Ein Anriss zeigt, DASS es den Austausch gibt,
// und fuehrt zum vollen Feed — er ist keine zweite Feed-Implementierung.

function kurzfassung(entry: { title: string | null; body: string }): string {
  const roh = entry.title?.trim() || entry.body
  const sauber = roh.replace(/\s+/g, ' ').trim()
  return sauber.length > 96 ? `${sauber.slice(0, 95)}…` : sauber
}

export async function CommunityTeaserSection() {
  const alle = await getCommunityFeed()
  const neueste = alle.slice(0, ANZAHL)
  // Kein Feed, kein Abschnitt. Ein leerer Anriss waere nur Rahmen ohne Inhalt.
  if (neueste.length === 0) return null

  return (
    <section className="bg-white py-16 sm:py-20" aria-labelledby="community-teaser">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue">
          B2B-Community
        </span>
        <h2
          id="community-teaser"
          style={HEAD_FONT}
          className="mt-1 max-w-2xl text-2xl font-bold text-claimondo-navy sm:text-3xl"
        >
          Woran unsere Partner gerade arbeiten
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-claimondo-shield">
          Sachverständige, Makler und Werkstätten tauschen sich über Urteile, Honorare und Praxis
          aus. Öffentlich mitlesbar.
        </p>

        <ul className="mt-8 divide-y divide-claimondo-border/60 border-y border-claimondo-border/60">
          {neueste.map((e) => (
            <li key={`${e.kind}-${e.id}`}>
              <Link
                href="/community"
                className="flex items-start gap-3 py-4 transition-colors hover:bg-claimondo-bg/60"
              >
                <MessageSquare
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-light-blue"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug text-claimondo-navy">
                    {kurzfassung(e)}
                  </span>
                  <span className="mt-1 block text-xs text-claimondo-shield/70">
                    {e.authorDisplay}
                    {e.tags.length > 0 && <> · {e.tags[0]}</>}
                    {e.commentCount > 0 && <> · {e.commentCount} Antworten</>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/community"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-claimondo-ondo transition-colors hover:text-claimondo-navy"
        >
          Zur Community
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
