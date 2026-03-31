import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  UserPlusIcon,
  MapPinIcon,
  AlertTriangleIcon,
  FolderOpenIcon,
  CheckCircle2Icon,
  WalletIcon,
  GaugeIcon,
  ClockIcon,
  NavigationIcon,
  DropletIcon,
  FlameIcon,
  ShieldAlertIcon,
  WindIcon,
  WrenchIcon,
  PackageIcon,
  ExternalLinkIcon,
  BellIcon,
} from 'lucide-react'
import WeatherWidget from '@/components/WeatherWidget'
import UeberfaelligeTasks from '@/components/UeberfaelligeTasks'
import MeineAufgabenServer from '@/components/MeineAufgabenServer'

// ─── Schadentyp helpers ─────────────────────────────────────────────────────

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschädigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
}

const URSACHE_ICON: Record<string, typeof DropletIcon> = {
  wasserschaden: DropletIcon,
  brand: FlameIcon,
  einbruch: ShieldAlertIcon,
  sturmschaden: WindIcon,
  sachbeschaedigung: WrenchIcon,
  vandalismus: ShieldAlertIcon,
  verschleiss: WrenchIcon,
  sonstiges: PackageIcon,
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function GutachterDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get sachverstaendige record + profile name for this user
  const [{ data: sv }, { data: profile }] = await Promise.all([
    supabase
      .from('sachverstaendige')
      .select('id, offene_faelle, max_faelle_monat, paket_faelle_genutzt, paket_faelle_gesamt, guthaben, standort_lat, standort_lng')
      .eq('profile_id', user!.id)
      .single(),
    supabase
      .from('profiles')
      .select('vorname')
      .eq('id', user!.id)
      .single(),
  ])

  if (!sv) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-800 rounded-2xl p-6">
            <p className="text-yellow-300 text-sm">
              Ihr Sachverständigen-Profil wurde noch nicht angelegt. Bitte kontaktieren Sie den Administrator.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Date boundaries ──────────────────────────────────────────────────────
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // ─── Parallel data fetching ───────────────────────────────────────────────
  const [neueRes, todayRes, actionRes, erledigtRes, mitteilungenRes] = await Promise.all([
    // 1. Neue Kunden: sv-zugewiesen (not yet confirmed)
    supabase
      .from('faelle')
      .select('id, fall_nummer, status, schadens_ursache, schadens_datum, schadens_adresse, schadens_plz, schadens_ort, created_at, lead_id')
      .eq('sv_id', sv.id)
      .eq('status', 'sv-zugewiesen')
      .order('created_at', { ascending: false }),

    // 2. Tagesroute: appointments today
    supabase
      .from('faelle')
      .select('id, fall_nummer, status, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, sv_termin, lead_id')
      .eq('sv_id', sv.id)
      .gte('sv_termin', todayStart)
      .lte('sv_termin', todayEnd)
      .order('sv_termin', { ascending: true }),

    // 3. Handlungsbedarf: past sv-termin but no gutachten submitted
    supabase
      .from('faelle')
      .select('id, fall_nummer, status, schadens_ursache, schadens_ort, sv_termin, gutachten_eingegangen_am, lead_id')
      .eq('sv_id', sv.id)
      .is('gutachten_eingegangen_am', null)
      .not('sv_termin', 'is', null)
      .lt('sv_termin', now.toISOString())
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('sv_termin', { ascending: true }),

    // 4. Erledigt diesen Monat: gutachten-eingegangen this month
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('sv_id', sv.id)
      .gte('gutachten_eingegangen_am', monthStart),

    // 5. Letzte 5 ungelesene Mitteilungen
    supabase
      .from('gutachter_mitteilungen')
      .select('id, typ, titel, nachricht, dringend, link, created_at')
      .eq('sv_id', sv.id)
      .eq('gelesen', false)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const neueFaelle = neueRes.data ?? []
  const todayFaelle = todayRes.data ?? []
  const actionFaelle = actionRes.data ?? []
  const erledigtCount = erledigtRes.count ?? 0
  const mitteilungen = mitteilungenRes.data ?? []

  // ─── Resolve lead names ───────────────────────────────────────────────────
  const allLeadIds = [
    ...new Set(
      [...neueFaelle, ...todayFaelle, ...actionFaelle]
        .map(f => f.lead_id)
        .filter(Boolean) as string[]
    ),
  ]
  const { data: leads } = allLeadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', allLeadIds)
    : { data: [] }
  const leadMap: Record<string, string> = {}
  for (const l of leads ?? []) {
    leadMap[l.id] = `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '—'
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function leadName(leadId: string | null) {
    return leadId ? (leadMap[leadId] ?? '—') : '—'
  }

  function formatAdresse(f: { schadens_adresse?: string | null; schadens_plz?: string | null; schadens_ort?: string | null }) {
    return [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', ') || '—'
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function formatTime(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  // Build Google Maps route URL from today's appointments
  function buildRouteUrl() {
    const stops = todayFaelle
      .map(f => [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', '))
      .filter(Boolean)
    if (stops.length === 0) return null
    const encoded = stops.map(s => encodeURIComponent(s)).join('/')
    return `https://www.google.com/maps/dir/${encoded}`
  }

  const routeUrl = buildRouteUrl()
  const offeneFaelle = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
  const maxFaelle = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
  const guthaben = typeof sv.guthaben === 'number' ? sv.guthaben : 0

  // ─── Greeting based on time of day ────────────────────────────────────────
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'
  const vorname = profile?.vorname ?? ''

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} className="px-3">
      <div className="max-w-5xl mx-auto w-full flex flex-col flex-1 min-h-0 gap-3 py-2">

        {/* ─── Greeting (compact) ──────────────────────────────────────── */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-gray-900">
              {greeting}{vorname ? ` ${vorname}` : ''}
            </h1>
            <span className="text-gray-400 text-xs">
              {now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          </div>
          <WeatherWidget lat={sv.standort_lat ?? null} lng={sv.standort_lng ?? null} />
        </div>

        {/* ─── 2-Column Layout ─────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex gap-4">

          {/* LEFT: Tagesroute + Termine (60%, scrollable) */}
          <div className="flex-[3] min-w-0 overflow-y-auto space-y-3">
            {/* Zusammenfassung */}
            <div className="flex items-center gap-3 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="font-semibold text-gray-900">{todayFaelle.length} Termine heute</span>
              {todayFaelle.length > 0 && <span>·</span>}
              {actionFaelle.length > 0 && <span className="text-red-500 font-medium">{actionFaelle.length} überfällig</span>}
              {routeUrl && (
                <a href={routeUrl} target="_blank" rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-600 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors">
                  <NavigationIcon className="w-3 h-3" /> Alle navigieren
                </a>
              )}
            </div>

            {/* Tagesroute Cards */}
            {todayFaelle.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                <p className="text-gray-400 text-sm">Keine Termine für heute</p>
                {neueFaelle.length > 0 && <p className="text-gray-500 text-xs mt-1">{neueFaelle.length} neue Aufträge warten</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {todayFaelle.map((fall, idx) => {
                  const addr = formatAdresse(fall)
                  return (
                    <div key={fall.id} className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 text-center w-14">
                          <span className="text-[10px] text-gray-400">Stop {idx + 1}</span>
                          <p className="text-green-600 text-sm font-bold tabular-nums">{formatTime(fall.sv_termin)}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link href={`/gutachter/fall/${fall.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">{leadName(fall.lead_id)}</Link>
                          <p className="text-xs text-gray-500 truncate">{addr}</p>
                        </div>
                        <div className="shrink-0 flex gap-1.5">
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-600 text-[10px] font-medium px-2 py-1.5 rounded-lg">
                            <NavigationIcon className="w-3 h-3" /> Nav
                          </a>
                          {(() => { const leadId = fall.lead_id; const phone = leadId ? (leadMap[leadId]?.includes('@') ? null : leads?.find(l => l.id === leadId)) : null; return null })()}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Neue Aufträge */}
            {neueFaelle.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Neue Aufträge ({neueFaelle.length})</p>
                <div className="space-y-1.5">
                  {neueFaelle.map(fall => (
                    <Link key={fall.id} href={`/gutachter/fall/${fall.id}`}
                      className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                      <UserPlusIcon className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{leadName(fall.lead_id)}</p>
                        <p className="text-xs text-gray-400 truncate">{formatAdresse(fall)}</p>
                      </div>
                      <span className="text-[10px] text-gray-400">{formatDate(fall.created_at)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Handlungsbedarf */}
            {actionFaelle.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">Handlungsbedarf ({actionFaelle.length})</p>
                <div className="space-y-1.5">
                  {actionFaelle.map(fall => (
                    <Link key={fall.id} href={`/gutachter/fall/${fall.id}`}
                      className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-100 transition-colors">
                      <AlertTriangleIcon className="w-4 h-4 text-red-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{leadName(fall.lead_id)}</p>
                        <p className="text-xs text-red-500">Termin {formatDate(fall.sv_termin)} — Gutachten fehlt</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Tasks + Stats (40%, sticky) */}
          <div className="flex-[2] min-w-0 overflow-y-auto space-y-3">

            {/* Meine Aufgaben */}
            {/* @ts-expect-error Async Server Component */}
            <MeineAufgabenServer mode="user" rolle="sachverstaendiger" title="Meine offenen Aufgaben" fallLinkPrefix="/gutachter/fall/" />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpenIcon className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Offene Fälle</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">{offeneFaelle}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2Icon className="w-4 h-4 text-emerald-500" />
              <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Erledigt (Monat)</span>
            </div>
            <div className="text-3xl font-bold text-emerald-400 tabular-nums">{erledigtCount}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <WalletIcon className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Guthaben</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">{guthaben.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} <span className="text-lg text-gray-500">EUR</span></div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <GaugeIcon className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Auslastung</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">
              {offeneFaelle}<span className="text-lg text-gray-500">/{maxFaelle}</span>
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  maxFaelle > 0 && offeneFaelle / maxFaelle > 0.8
                    ? 'bg-red-500'
                    : maxFaelle > 0 && offeneFaelle / maxFaelle > 0.5
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, maxFaelle > 0 ? (offeneFaelle / maxFaelle) * 100 : 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ─── Mitteilungen ────────────────────────────────────────────── */}
        {mitteilungen.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BellIcon className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-semibold text-gray-900">Neue Mitteilungen</h2>
              <span className="ml-auto bg-red-50 text-red-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {mitteilungen.length}
              </span>
              <Link
                href="/gutachter/mitteilungen"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Alle anzeigen
              </Link>
            </div>
            <div className="space-y-2">
              {mitteilungen.map(m => (
                <Link
                  key={m.id}
                  href={m.link ?? '/gutachter/mitteilungen'}
                  className="flex items-start gap-3 bg-white border border-gray-300 rounded-2xl p-4 hover:border-gray-300 transition-colors"
                >
                  <div className={`shrink-0 p-2 rounded-xl ${m.dringend ? 'bg-red-50' : 'bg-gray-100'}`}>
                    <BellIcon className={`w-4 h-4 ${m.dringend ? 'text-red-400' : 'text-gray-500'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-900 text-sm font-medium">
                      {m.titel}
                      {m.dringend && <span className="ml-2 text-xs text-red-400 font-semibold">DRINGEND</span>}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{m.nachricht}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ─── Neue Kunden ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <UserPlusIcon className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900">Neue Kunden</h2>
            {neueFaelle.length > 0 && (
              <span className="ml-auto bg-blue-50 text-blue-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {neueFaelle.length}
              </span>
            )}
          </div>

          {neueFaelle.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
              <p className="text-gray-500 text-sm">Keine neuen Zuweisungen vorhanden.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {neueFaelle.map(fall => {
                const UrsacheIcon = URSACHE_ICON[fall.schadens_ursache ?? ''] ?? PackageIcon
                return (
                  <div
                    key={fall.id}
                    className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-gray-900 font-medium truncate">{leadName(fall.lead_id)}</p>
                        <p className="text-gray-500 text-xs mt-0.5 truncate">{formatAdresse(fall)}</p>
                      </div>
                      <div className="shrink-0 ml-2 p-1.5 rounded-lg bg-gray-100">
                        <UrsacheIcon className="w-4 h-4 text-gray-500" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-0.5 rounded-full">
                        {URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? 'Sonstiges'}
                      </span>
                      <span>{formatDate(fall.schadens_datum)}</span>
                    </div>
                    <Link
                      href={`/gutachter/fall/${fall.id}`}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
                    >
                      Fall ansehen
                      <ExternalLinkIcon className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </section>

          </div>
        </div>
      </div>
    </div>
  )
}
