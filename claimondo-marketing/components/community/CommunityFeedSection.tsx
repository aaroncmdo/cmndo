import { getCommunityFeed, getUserLikedKeys } from '@/lib/community/community-queries'
import { getAuthState } from '@/lib/community/comments'
import { CommunityFeedClient } from './CommunityFeedClient'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

// Server-Sektion fuer den B2B-Community-Feed auf der Startseite.
// Mirrored WissensRatgeberSection: gleiche Shell, gleiche Tokens, gleiche
// padding/max-width-Konventionen. Laedt Daten parallel (Feed + Auth-State).
export async function CommunityFeedSection() {
  const [entries, authState] = await Promise.all([getCommunityFeed(), getAuthState()])
  const likedKeys = authState.isLoggedIn ? await getUserLikedKeys(entries) : []

  // Zeige die Sektion auch bei leerem Feed — der PostComposer ist fuer Partner sichtbar.
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue">
              B2B-Community
            </span>
            <h2
              style={HEAD_FONT}
              className="mt-1 max-w-2xl text-2xl font-bold text-claimondo-navy sm:text-3xl"
            >
              Aus der Community
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
              Fachlicher Austausch für Sachverständige, Makler und Werkstätten – Wissen, Urteile,
              Praxistipps.
            </p>
          </div>
        </div>

        {/* Client: Filter-Chips + Composer + Feed-Liste */}
        <div className="mt-8">
          <CommunityFeedClient
            entries={entries}
            isLoggedIn={authState.isLoggedIn}
            hasUsername={!!authState.username}
            likedKeys={likedKeys}
          />
        </div>

        {/* Footer-Hinweis */}
        <p className="mt-6 text-[0.75rem] text-claimondo-shield/70">
          Beiträge geben die Meinung der Verfasser:innen wieder, nicht die von Claimondo. Es gelten
          unsere{' '}
          <a href="/community-regeln" className="underline hover:text-claimondo-shield">
            Community-Regeln
          </a>
          .
        </p>
      </div>
    </section>
  )
}
