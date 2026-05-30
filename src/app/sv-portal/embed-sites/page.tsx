// AAR-939 · Monika-Embed · Stream 6 — Embed-Sites-Liste.
// Server-Component: liest die Sites des eingeloggten SV (RLS embed_sites_owner_select
// greift, da authentifizierter User-Client). embed_sites fehlt in database.types.ts
// → Cast-Idiom (wie /api/embed/config/route.ts).

import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/shared/PageHeader'
import EmbedSitesList, { type EmbedSiteListRow } from './EmbedSitesList'

export const dynamic = 'force-dynamic'

export default async function EmbedSitesPage() {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('embed_sites')
    .select('id, name, slug, variante, aktiv, anfragen_gesamt, erstellt_am')
    .order('erstellt_am', { ascending: false })

  const sites = (data ?? []) as EmbedSiteListRow[]

  return (
    <div className="py-6 space-y-4">
      <PageHeader
        title="Embed-Sites"
        size="lg"
        actions={<span className="text-sm text-claimondo-ondo">{sites.length} Sites</span>}
      />
      <EmbedSitesList sites={sites} />
    </div>
  )
}
