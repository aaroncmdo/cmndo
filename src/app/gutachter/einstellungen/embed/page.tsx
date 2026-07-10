// AAR-939 · Monika-Embed · Stream 6 — Embed-Sites-Liste.
// Server-Component: liest die Sites des eingeloggten SV (RLS embed_sites_owner_select
// greift, da authentifizierter User-Client). embed_sites fehlt in database.types.ts
// → Cast-Idiom (wie /api/embed/config/route.ts).

import Link from 'next/link'
import { InboxIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SvPageChrome } from '@/app/gutachter/_shell/SvPageChrome'
import EmbedSitesList, { type EmbedSiteListRow } from './EmbedSitesList'

export const dynamic = 'force-dynamic'

export default async function EmbedSitesPage() {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('embed_sites')
    .select('id, name, slug, variante, aktiv, anfragen_gesamt, erstellt_am, tracking_webhook_url, tracking_webhook_last_status')
    .order('erstellt_am', { ascending: false })

  const sites = (data ?? []) as EmbedSiteListRow[]

  return (
    <div className="py-6 space-y-4">
      <SvPageChrome
        title="Embed-Sites"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-claimondo-ondo">{sites.length} Sites</span>
            {/* Route-Reachability-Audit 06.07.: die SV-Lead-Inbox (/embed/anfragen) war
                nirgends verlinkt — nur per direkter URL erreichbar. Einstieg vom Embed-Hub. */}
            <Link
              href="/gutachter/einstellungen/embed/anfragen"
              className="inline-flex items-center gap-1 rounded-ios-lg bg-claimondo-ondo px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-claimondo-navy"
            >
              <InboxIcon className="w-4 h-4" />
              Anfragen
            </Link>
          </div>
        }
      />
      <EmbedSitesList sites={sites} />
    </div>
  )
}
