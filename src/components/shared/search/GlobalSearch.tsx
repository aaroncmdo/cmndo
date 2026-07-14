'use client'

// Global-Suche Slice 1: EIN rollen-agnostischer Wrapper um das Shared-Spotlight,
// der den unified /api/search-Endpoint (search_global-RPC) nutzt. Ersetzt die
// frueheren portal-spezifischen Wrapper (admin Spotlight + SVSpotlight). Rollen-
// bewusstes Routing via routeForEntity; Gruppen-Mapping via mapGroupsToSpotlight (pure, getestet).

import { useRouter } from 'next/navigation'
import { Spotlight as SharedSpotlight, type SpotlightGroup } from '@/components/shared/Spotlight'
import { routeForEntity } from '@/lib/search/route-for-entity'
import { mapGroupsToSpotlight } from '@/lib/search/spotlight-mapping'
import type { SearchGroup, EntityType } from '@/lib/search/types'

export default function GlobalSearch({ rolle }: { rolle: string }) {
  const router = useRouter()

  function parseResponse(data: unknown): SpotlightGroup[] {
    return mapGroupsToSpotlight((data as { groups?: SearchGroup[] } | null)?.groups ?? [])
  }

  function navigate(groupKey: string, id: string) {
    const route = routeForEntity(groupKey as EntityType, id, rolle)
    if (route) router.push(route)
  }

  return (
    <SharedSpotlight
      searchEndpoint="/api/search"
      parseResponse={parseResponse}
      navigate={navigate}
      placeholder="Name, Kennzeichen, Aktenzeichen…"
      ariaLabel="Globale Suche"
    />
  )
}
