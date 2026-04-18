import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SVKalenderClient from './SVKalenderClient'
import EmptyState from '@/components/shared/EmptyState'

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

  // Fetch all cases assigned to this SV with appointment dates
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, sv_termin, status, schadens_ort, schadens_adresse, lead_id, gutachter_termin_status')
    .eq('sv_id', sv.id)
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

  return (
    <div className="h-full flex flex-col">
      {/* View-Toggle */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-sm font-semibold text-gray-900">Kalender</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <Link
            href="/gutachter/kalender?view=kalender"
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === 'kalender' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >Kalender</Link>
          <Link
            href="/gutachter/kalender?view=liste"
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === 'liste' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >Liste</Link>
        </div>
      </div>

      {view === 'kalender' ? (
        <SVKalenderClient
          faelle={faelle ?? []}
          leadMap={leadMap}
          svId={sv.id}
          gcalConnected={!!sv.gcal_connected}
          standortLat={sv.standort_lat ? Number(sv.standort_lat) : null}
          standortLng={sv.standort_lng ? Number(sv.standort_lng) : null}
          termine={(termine ?? []).map(t => ({
            id: t.id as string,
            fall_id: t.fall_id as string,
            status: t.status as string,
            final_verbindlich_ab: t.final_verbindlich_ab as string | null,
          }))}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {terminListe.length === 0 ? (
            <EmptyState title="Keine Termine vorhanden." />
          ) : terminListe.map(fall => {
            const t = new Date(fall.sv_termin!)
            const name = fall.lead_id && leadMap[fall.lead_id] ? leadMap[fall.lead_id] : '—'
            return (
              <Link key={fall.id} href={`/gutachter/fall/${fall.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} — {t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{name} · {fall.schadens_ort ?? '—'}</p>
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
