// AAR-151: /admin/sachverstaendige ist jetzt die integrierte Karten-Ansicht
// (ONE VIEW). Chunk 3a: KarteHubClient (Google Maps) wurde durch
// <LiveOpsMap role="admin"> (Mapbox Live-Ops) ersetzt. Sidebar, Filter
// und StatBar leben in LiveOpsMap. Der @drawer-Parallel-Slot bleibt
// unberührt — Klick auf SV-Pin öffnet weiterhin den Detail-Drawer.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  resolveLiveOpsScope,
  getLiveOpsSvs,
  getOffeneTermine,
  getUnterwegsRouten,
  getTagesrouten,
  getDeadPins,
  getLeads,
} from '@/lib/live-ops'
import AdminLiveOpsClient from './AdminLiveOpsClient'

export const dynamic = 'force-dynamic'

export default async function SachverstaendigeHubPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  // Pending Basic-SVs fuer den Queue-Badge im Header
  const { data: basicRaw } = await supabase
    .from('sachverstaendige')
    .select('id, paket, verifizierung_status')
    .is('geloescht_am', null)
    .eq('paket', 'basic')
    .eq('verifizierung_status', 'ausstehend')
  const basicFreigabenCount = (basicRaw ?? []).length

  // Live-Ops-Loader (role-scoped)
  const scope = await resolveLiveOpsScope('admin', user.id)
  // svs zuerst awaiten, dann als preloadedSvs an getUnterwegsRouten uebergeben (spart doppelten DB-Call)
  const svs = await getLiveOpsSvs(scope)
  const [termine, routen, tagesrouten, deadPins, leads] = await Promise.all([
    getOffeneTermine(scope),
    getUnterwegsRouten(scope, svs),
    getTagesrouten(scope),
    getDeadPins(scope),
    getLeads(scope),
  ])

  return (
    // Aaron 07.07.: Karte full-bleed — bricht via dokumentiertem PageContainer-
    // Escape (104.17% von 96% = 100% Main-Breite) aus dem 96%-Wrapper aus.
    <div className="flex flex-col h-full md:w-[104.17%] md:-ml-[2.08%]">
      {/* Schlanker Header: Titel + Einstiegspunkte */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-claimondo-border bg-claimondo-bg/60 shrink-0">
        <h1 className="text-sm font-semibold text-claimondo-navy">Sachverständige</h1>
        <div className="flex items-center gap-2">
          {basicFreigabenCount > 0 ? (
            <Link
              href="/admin/vertrieb/sachverstaendige/basic-freigaben"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-ios-lg bg-warning-soft text-warning-strong hover:bg-warning/25 border border-warning/30"
            >
              Basic-Freigaben
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-warning text-white text-[10px] font-bold">
                {basicFreigabenCount > 99 ? '99+' : basicFreigabenCount}
              </span>
            </Link>
          ) : (
            <Link
              href="/admin/vertrieb/sachverstaendige/basic-freigaben"
              className="text-xs font-medium px-3 py-1.5 rounded-ios-lg border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg"
            >
              Basic-Freigaben
            </Link>
          )}
          <Link
            href="/admin/vertrieb/sachverstaendige/leads"
            className="text-xs font-medium px-3 py-1.5 rounded-ios-lg border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg"
          >
            SV-Leads
          </Link>
          <Link
            href="/admin/vertrieb/sachverstaendige/anlegen"
            className="text-xs font-medium px-3 py-1.5 rounded-ios-lg bg-claimondo-ondo text-white hover:bg-claimondo-navy"
          >
            + Neuer SV
          </Link>
        </div>
      </div>

      {/* Karte — flex-1 + min-h-0 gibt der LiveOpsMap (h-full) eine definierte Höhe */}
      <div className="flex-1 min-h-0">
        <AdminLiveOpsClient data={{ svs, termine, routen, tagesrouten, deadPins, leads }} />
      </div>
    </div>
  )
}
