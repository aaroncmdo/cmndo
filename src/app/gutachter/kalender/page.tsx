import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SVKalenderClient from './SVKalenderClient'
import EmptyState from '@/components/shared/EmptyState'
import PageHeader from '@/components/shared/PageHeader'

// AAR-229 W5 / F-12: Kalender + Termine merge mit View-Toggle.
export default async function SVKalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view = 'kalender' } = await searchParams
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Get the SV's sachverstaendige ID
  const sv = await getGutachterForUser<{ id: string; gcal_connected: boolean | null; standort_lat: number | null; standort_lng: number | null }>(supabase, user.id, 'id, gcal_connected, standort_lat, standort_lng')

  if (!sv) redirect('/login')

  // AAR-google-cal-drift: Source-of-Truth für „verbunden?" sind die
  // profiles.google_*-Tokens, NICHT sachverstaendige.gcal_connected. Der alte
  // /api/auth/google-calendar/-Flow schrieb nach der falschen Spalte —
  // dadurch zeigte die UI „verbunden" während Sync-Helper keinen Token fanden.
  const { isGoogleConnected } = await import('@/lib/google/oauth-client')
  const gcalConnected = await isGoogleConnected(user.id)

  // AAR-google-cal-drift: Externe Google-Termine der aktuellen + nächsten
  // Woche als Busy-Slots laden, damit SV im Kalender-Tab seine private
  // Belegung sieht. Fail-silent — leerer Array bei nicht-verbunden.
  let externalBusy: { start: string; end: string }[] = []
  if (gcalConnected) {
    const now = new Date()
    const fromIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
    const toIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 21).toISOString()
    try {
      const { getSvBusySlots } = await import('@/lib/google-calendar/busy-slots')
      externalBusy = await getSvBusySlots(user.id, fromIso, toIso)
    } catch (err) {
      console.warn('[gutachter/kalender] Busy-Slots:', err instanceof Error ? err.message : err)
    }
  }

  // CMM-25: Kalender zeigt nur Termine, deren Auftrag bereits durch die
  // Sicherungsabtretung bestätigt wurde. Reine Dispatcher-Slot-Blocks
  // (vor SA) bleiben extern (Google/CalDAV) — im Claimondo-Portal
  // werden sie erst nach SA-Unterschrift sichtbar.
  const { data: faelle } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select('id, fall_nummer, sv_termin, status, schadens_ort, schadens_adresse, lead_id, gutachter_termin_status')
    .eq('sv_id', sv.id)
    .eq('sa_unterschrieben', true)
    .not('status', 'in', '("abgeschlossen","storniert")')
    .order('sv_termin', { ascending: true })

  // KFZ-192: gutachter_termine mit final_verbindlich_ab laden (für Ablehnen/Gegenvorschlag)
  const fallIds = (faelle ?? []).map(f => f.id).filter(Boolean)
  const { data: termine } = fallIds.length > 0
    ? await supabase
        .from('gutachter_termine')
        .select('id, fall_id, status, final_verbindlich_ab')
        .in('fall_id', fallIds)
        .in('status', ['reserviert', 'bestaetigt'])
    : { data: [] }

  // AAR-864: verlegt-Slots als „Privater Termin"-Blocker im Kalender. Diese
  // tauchen NICHT in v_faelle_mit_aktuellem_termin auf (View priorisiert
  // verlegung_pending), sollen aber im Kalender weiter Slot-blockierend
  // sichtbar sein damit der SV nicht versehentlich neu drauf bucht.
  const fenster = new Date()
  const von = new Date(fenster.getFullYear(), fenster.getMonth(), fenster.getDate() - 14).toISOString()
  const bis = new Date(fenster.getFullYear(), fenster.getMonth(), fenster.getDate() + 35).toISOString()
  const { data: verlegteRows } = await supabase
    .from('gutachter_termine')
    .select('id, start_zeit, end_zeit')
    .eq('sv_id', sv.id)
    .eq('status', 'verlegt')
    .gte('start_zeit', von)
    .lte('start_zeit', bis)
  const verlegteSlots = (verlegteRows ?? []).map((r) => ({
    id: r.id as string,
    start: r.start_zeit as string,
    end: r.end_zeit as string,
  }))

  // Fetch lead names
  const leadIds = [...new Set((faelle ?? []).map(f => f.lead_id).filter(Boolean))]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }

  const leadMap: Record<string, string> = {}
  for (const l of leads ?? []) {
    leadMap[l.id] = `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '—'
  }

  // AAR-229 W5 / F-12: Liste = chronologische Termine (Subset der Fälle mit sv_termin)
  const terminListe = (faelle ?? [])
    .filter(f => f.sv_termin)
    .sort((a, b) => new Date(a.sv_termin!).getTime() - new Date(b.sv_termin!).getTime())

  // 2026-05-06: Map start_zeit → fall_id für Time-Match-Clickability der
  // externalBusy-Events. Damit wird ein „Gebucht"-Pill der via Google
  // FreeBusy/CalDAV gelesen wurde, klickbar zum Claimondo-Auftrag, wenn
  // er zeitlich zu einem internen gutachter_termine matched (±2 Minuten
  // Toleranz, da Google-Events teils mit Sekunden-Drift zurückkommen).
  const claimondoTermineByStart = (faelle ?? [])
    .filter((f) => f.sv_termin)
    .map((f) => ({
      fallId: f.id as string,
      startMs: new Date(f.sv_termin as string).getTime(),
    }))

  return (
    <div className="h-full flex flex-col">
      <KalenderRealtimeRefresh svId={sv.id} />
      {/* View-Toggle */}
      <div className="px-4 py-2 bg-white border-b border-claimondo-border shrink-0">
        <PageHeader
          title="Kalender"
          actions={
            <div className="flex gap-1 bg-claimondo-bg rounded-lg p-0.5">
              <Link
                href="/gutachter/kalender?view=kalender"
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'kalender' ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo'
                }`}
              >Kalender</Link>
              <Link
                href="/gutachter/kalender?view=liste"
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'liste' ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo'
                }`}
              >Liste</Link>
            </div>
          }
        />
      </div>

      {view === 'kalender' ? (
        <SVKalenderClient
          faelle={faelle ?? []}
          leadMap={leadMap}
          svId={sv.id}
          gcalConnected={gcalConnected}
          standortLat={sv.standort_lat ? Number(sv.standort_lat) : null}
          standortLng={sv.standort_lng ? Number(sv.standort_lng) : null}
          termine={(termine ?? []).map(t => ({
            id: t.id as string,
            fall_id: t.fall_id as string,
            status: t.status as string,
            final_verbindlich_ab: t.final_verbindlich_ab as string | null,
          }))}
          externalBusy={externalBusy}
          verlegteSlots={verlegteSlots}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {terminListe.length === 0 ? (
            // 2026-05-07 EmptyState-Iter-2: Kalender > Liste-View ist die
            // echte Termine-Empty-State (legacy /gutachter/termine wird hier
            // hin redirected). Wrapper-Component, weil diese Page eine
            // Server-Component ist und LucideIcon nicht über die RSC-Boundary
            // gereicht werden kann.
            <KalenderListeEmpty />
          ) : terminListe.map(fall => {
            const t = new Date(fall.sv_termin!)
            const name = fall.lead_id && leadMap[fall.lead_id] ? leadMap[fall.lead_id] : '—'
            return (
              <Link key={fall.id} href={`/gutachter/fall/${fall.id}`}
                className="block bg-white rounded-xl border border-claimondo-border p-4 hover:bg-claimondo-bg transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-claimondo-navy">
                      {t.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} — {t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                    </p>
                    <p className="text-xs text-claimondo-ondo mt-0.5">{name} · {fall.schadens_ort ?? '—'}</p>
                  </div>
                  <span className="text-[10px] text-[var(--brand-secondary)]">{fall.fall_nummer ?? fall.id.slice(0, 8)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
