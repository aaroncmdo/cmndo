// Server Component — DRY-Kern fuer die Netzwerk-Portal-Seiten (Gutachter/Werkstatt/Flotte).
// Laedt je aktivem Tab die passenden Daten (Feed unberuehrt; Verbindungen/Anfragen neu).
import type { ReactNode } from 'react'
import { getNetzwerkFeed, getUserLikedKeys } from '@/lib/community/feed'
import { getTopCommentsPreview } from '@/lib/community/threads'
import { NetzwerkFeed } from '@/components/shared/netzwerk/NetzwerkFeed'
import type { NetzwerkPortal } from '@/components/shared/netzwerk/types'
import { ladeMeineVerbindungen, ladeMeineAnfragen } from '@/lib/netzwerk/verbindungen-queries'
import { ladeMeinNetzwerkGeo } from '@/lib/netzwerk/netzwerk-geo'
import { parseTab } from './tab'
import { NetzwerkTabBar } from './NetzwerkTabBar'
import { VerbindungenTab } from './VerbindungenTab'
import { AnfragenTab } from './AnfragenTab'
import { NetzwerkKarteClient } from './NetzwerkKarteClient'

export async function NetzwerkPortalPage({
  portal,
  searchParams,
}: {
  portal: NetzwerkPortal
  searchParams: { tab?: string }
}) {
  const tab = parseTab(searchParams?.tab)

  let content: ReactNode
  if (tab === 'verbindungen') {
    content = <VerbindungenTab verbindungen={await ladeMeineVerbindungen()} />
  } else if (tab === 'anfragen') {
    const { eingehend, ausgehend } = await ladeMeineAnfragen()
    content = <AnfragenTab eingehend={eingehend} ausgehend={ausgehend} />
  } else if (tab === 'karte') {
    content = <NetzwerkKarteClient geo={await ladeMeinNetzwerkGeo(portal)} />
  } else {
    const entries = await getNetzwerkFeed()
    const [likedKeys, previewsByKey] = await Promise.all([
      getUserLikedKeys(entries),
      getTopCommentsPreview(entries),
    ])
    content = (
      <NetzwerkFeed portal={portal} entries={entries} likedKeys={likedKeys} previewsByKey={previewsByKey} />
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <NetzwerkTabBar portal={portal} active={tab} />
      {content}
    </div>
  )
}
