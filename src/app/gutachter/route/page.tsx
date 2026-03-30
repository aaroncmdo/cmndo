import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { MapPinIcon, ClockIcon, NavigationIcon, ExternalLinkIcon } from 'lucide-react'

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschaedigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiss',
  sonstiges: 'Sonstiges',
}

const URSACHE_COLOR: Record<string, string> = {
  wasserschaden: 'bg-blue-950 text-blue-300',
  sachbeschaedigung: 'bg-orange-950 text-orange-300',
  brand: 'bg-red-950 text-red-300',
  einbruch: 'bg-purple-950 text-purple-300',
  sturmschaden: 'bg-cyan-950 text-cyan-300',
  vandalismus: 'bg-pink-950 text-pink-300',
  verschleiss: 'bg-amber-950 text-amber-300',
  sonstiges: 'bg-zinc-800 text-zinc-300',
}

function buildAddress(fall: { schadens_adresse?: string | null; schadens_plz?: string | null; schadens_ort?: string | null }) {
  return [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort]
    .filter(Boolean)
    .join(', ')
}

function buildGoogleMapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function buildRouteUrl(addresses: string[]) {
  if (addresses.length === 0) return '#'
  const encoded = addresses.map((a) => encodeURIComponent(a)).join('/')
  return `https://www.google.com/maps/dir/${encoded}`
}

// Placeholder drive time estimates based on position in list
function estimateDriveMinutes(index: number) {
  const estimates = [15, 20, 12, 25, 18, 22, 10, 30]
  return estimates[index % estimates.length]
}

export default async function TagesroutePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get the SV record
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user!.id)
    .single()

  if (!sv) {
    return (
      <div className="px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-zinc-800">
            <p className="text-zinc-500">Kein Sachverstaendigen-Profil gefunden.</p>
          </div>
        </div>
      </div>
    )
  }

  // Today's date range (UTC start/end of day)
  const today = new Date()
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  // Fetch today's appointments
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, sv_termin, status, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, lead_id')
    .eq('sv_id', sv.id)
    .gte('sv_termin', dayStart.toISOString())
    .lte('sv_termin', dayEnd.toISOString())
    .order('sv_termin', { ascending: true })

  // Fetch lead names
  const leadIds = [...new Set((faelle ?? []).map((f) => f.lead_id).filter(Boolean))] as string[]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }

  const leadMap: Record<string, { vorname: string | null; nachname: string | null }> = {}
  for (const l of leads ?? []) {
    leadMap[l.id] = l
  }

  const todayFormatted = today.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  // Build addresses for route URL
  const addresses = (faelle ?? [])
    .map((f) => buildAddress(f))
    .filter((a) => a.length > 0)

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">Tagesroute</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{todayFormatted}</p>
        </div>

        {/* Route button */}
        {addresses.length > 1 && (
          <a
            href={buildRouteUrl(addresses)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-2xl transition-colors mb-6"
          >
            <NavigationIcon className="w-5 h-5" />
            Gesamte Route in Google Maps
            <ExternalLinkIcon className="w-4 h-4 ml-1 opacity-60" />
          </a>
        )}

        {/* Empty state */}
        {!faelle?.length ? (
          <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-zinc-800">
            <MapPinIcon className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 font-medium">Keine Termine heute</p>
            <p className="text-zinc-600 text-sm mt-1">
              Fuer heute sind keine Vor-Ort-Besichtigungen geplant.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {faelle.map((fall, index) => {
              const lead = fall.lead_id ? leadMap[fall.lead_id] : null
              const name = lead
                ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                : 'Unbekannt'
              const address = buildAddress(fall)
              const time = fall.sv_termin
                ? new Date(fall.sv_termin).toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '--:--'

              return (
                <div key={fall.id}>
                  {/* Drive time indicator between stops */}
                  {index > 0 && (
                    <div className="flex items-center justify-center gap-2 py-2 text-zinc-600">
                      <div className="h-px flex-1 bg-zinc-800" />
                      <div className="flex items-center gap-1.5 text-xs">
                        <ClockIcon className="w-3.5 h-3.5" />
                        <span>~{estimateDriveMinutes(index - 1)} Min</span>
                      </div>
                      <div className="h-px flex-1 bg-zinc-800" />
                    </div>
                  )}

                  {/* Appointment card */}
                  <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Time + Name */}
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-white font-mono text-lg font-semibold tabular-nums">
                            {time}
                          </span>
                          <span className="text-zinc-200 text-sm font-medium truncate">
                            {name}
                          </span>
                        </div>

                        {/* Address */}
                        {address && (
                          <div className="flex items-start gap-2 mb-3">
                            <MapPinIcon className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                            <span className="text-zinc-400 text-sm">{address}</span>
                          </div>
                        )}

                        {/* Badge + links row */}
                        <div className="flex flex-wrap items-center gap-2">
                          {fall.schadens_ursache && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                                URSACHE_COLOR[fall.schadens_ursache] ?? 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              {URSACHE_LABEL[fall.schadens_ursache] ?? fall.schadens_ursache}
                            </span>
                          )}

                          <span className="text-zinc-700 text-xs font-mono">
                            {fall.fall_nummer ?? fall.id.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-4">
                      <Link
                        href={`/gutachter/fall/${fall.id}`}
                        className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium py-2.5 px-4 rounded-xl transition-colors"
                      >
                        Fallakte
                      </Link>
                      {address && (
                        <a
                          href={buildGoogleMapsUrl(address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium py-2.5 px-4 rounded-xl transition-colors"
                        >
                          <NavigationIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">In Maps oeffnen</span>
                          <span className="sm:hidden">Maps</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Summary */}
        {faelle && faelle.length > 0 && (
          <div className="mt-6 bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Termine heute</span>
              <span className="text-white font-semibold">{faelle.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
