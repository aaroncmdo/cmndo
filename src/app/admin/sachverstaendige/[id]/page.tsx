import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SvDetailClient from './SvDetailClient'
import { FALL_STATUS_LABELS, FALL_STATUS_COLORS } from '@/lib/statusLabels'
import { getSvStatus } from '@/lib/sv-status'

const STATUS_LABEL = FALL_STATUS_LABELS
const STATUS_COLOR = FALL_STATUS_COLORS

export default async function SvDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, radius_km, paket, max_faelle_monat, offene_faelle, partner_seit, ist_aktiv, notizen, paket_faelle_gesamt, paket_faelle_genutzt, paket_umkreis_km, standort_adresse, standort_plz, standort_lat, standort_lng, standort_place_id, gutachter_typ, guthaben, anzahlung_status, portal_zugang_freigeschaltet, vertrag_unterschrieben, gesperrt_seit, profiles(vorname, nachname, email, telefon)')
    .eq('id', id)
    .single()

  if (!sv) notFound()

  const profileRaw = sv.profiles as unknown
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    vorname: string | null; nachname: string | null; email: string | null; telefon: string | null
  } | null

  // Fälle + Tasks parallel laden
  const [faelleRes, tasksRes] = await Promise.all([
    supabase.from('faelle')
      .select('id, fall_nummer, status, schadens_ursache, schadens_ort, sv_termin, created_at, lead_id, leads(vorname, nachname)')
      .eq('sv_id', id)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('created_at', { ascending: false }),
    supabase.from('tasks')
      .select('id, titel, typ, status, faellig_am, prioritaet, fall_id, faelle(fall_nummer)')
      .eq('zugewiesen_an', sv.profile_id)
      .in('status', ['offen', 'in-bearbeitung'])
      .order('faellig_am', { ascending: true })
      .limit(20),
  ])

  const faelle = faelleRes.data ?? []
  const tasks = tasksRes.data ?? []

  // KFZ-153: Gutachten-Mängel Counts für diesen SV
  const fallIds = faelle.map(f => f.id)
  let mangelCounts = { formal: 0, inhaltlich: 0 }
  if (fallIds.length > 0) {
    const { data: mangel } = await supabase
      .from('regulierungs_klassifizierung')
      .select('kuerzungsgrund')
      .in('fall_id', fallIds)
      .in('kuerzungsgrund', ['gutachten_formaler_mangel', 'gutachten_inhaltlicher_mangel'])
    if (mangel) {
      mangelCounts = {
        formal: mangel.filter(m => m.kuerzungsgrund === 'gutachten_formaler_mangel').length,
        inhaltlich: mangel.filter(m => m.kuerzungsgrund === 'gutachten_inhaltlicher_mangel').length,
      }
    }
  }

  const name = profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : ''
  const maxFaelle = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? 10
  const genutzt = sv.paket_faelle_genutzt ?? sv.offene_faelle ?? 0
  const pct = maxFaelle > 0 ? Math.round((genutzt / maxFaelle) * 100) : 0
  const now = new Date()

  // ARCH-1 POLISH Befund 1: Onboarding-Status-Badge im Detail-Header
  const onboardingStatus = getSvStatus({
    portal_zugang_freigeschaltet: sv.portal_zugang_freigeschaltet,
    vertrag_unterschrieben: sv.vertrag_unterschrieben,
    gesperrt_seit: sv.gesperrt_seit,
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Sticky Header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex-shrink-0 px-4 py-3">
        <div>
          <Link href="/admin/sachverstaendige" className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-1.5 inline-block">
            &larr; Gutachter-Übersicht
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{name || 'Sachverständiger'}</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                {profile?.email && <span>{profile.email}</span>}
                {sv.gutachter_typ && <span className="bg-[#4573A2]/5 text-[#4573A2] px-1.5 py-0.5 rounded text-[10px] font-medium">{sv.gutachter_typ}</span>}
                {sv.paket && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-medium">{sv.paket}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900 tabular-nums">{genutzt}/{maxFaelle}</span>
                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-0.5">
                  <div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-[#4573A2]'}`}
                    style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
              {/* ARCH-1 POLISH Befund 1: Onboarding-Status-Badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium ${onboardingStatus.bg} ${onboardingStatus.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${onboardingStatus.dot}`} />
                {onboardingStatus.label}
              </span>
              {/* KFZ-153: Gutachten-Mängel Warnung */}
              {(mangelCounts.formal > 0 || mangelCounts.inhaltlich > 0) && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600" title={`${mangelCounts.formal}x formaler Mangel, ${mangelCounts.inhaltlich}x inhaltlicher Mangel`}>
                  {mangelCounts.formal + mangelCounts.inhaltlich} Gutachten-Mängel
                </span>
              )}
              {sv.ist_aktiv ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-green-50 text-green-600">Aktiv</span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-red-50 text-red-500">Inaktiv</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Split Layout: Form LEFT + Fälle/Tasks RIGHT ────────────── */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-6xl mx-auto flex">
          {/* LEFT: Edit Form */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 min-w-0">
            {/* Auslastung */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-medium text-gray-500 mb-3">Auslastung & Paket</h2>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{genutzt}</p>
                  <p className="text-[10px] text-gray-500">Aktive Fälle</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{maxFaelle}</p>
                  <p className="text-[10px] text-gray-500">Max. Kapazität</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${pct > 80 ? 'text-red-500' : pct > 50 ? 'text-amber-500' : 'text-[#4573A2]'}`}>{pct}%</p>
                  <p className="text-[10px] text-gray-500">Auslastung</p>
                </div>
              </div>
            </div>

            {/* Edit form mit Google Places */}
            <SvDetailClient
              sv={{
                id: sv.id,
                profileId: sv.profile_id!,
                vorname: profile?.vorname ?? '',
                nachname: profile?.nachname ?? '',
                telefon: profile?.telefon ?? '',
                paket: sv.paket,
                maxFaelleMonat: sv.max_faelle_monat,
                istAktiv: sv.ist_aktiv ?? true,
                notizen: sv.notizen ?? '',
                standortAdresse: sv.standort_adresse ?? '',
                standortPlz: sv.standort_plz ?? '',
                standortLat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
                standortLng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
                standortPlaceId: sv.standort_place_id ?? '',
                paketUmkreisKm: sv.paket_umkreis_km ?? sv.radius_km ?? 15,
              }}
            />
          </div>

          {/* RIGHT: Offene Fälle + Tasks Panel */}
          <div className="w-[340px] flex-shrink-0 border-l border-gray-200 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
            {/* Offene Fälle */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-800">Offene Fälle ({faelle.length})</span>
              </div>
              {faelle.length === 0 ? (
                <p className="py-6 text-center text-gray-400 text-xs">Keine offenen Fälle</p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {faelle.map(fall => {
                    const leadRaw = fall.leads as unknown
                    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as { vorname: string | null; nachname: string | null } | null
                    const kunde = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
                    return (
                      <Link key={fall.id} href={`/admin/faelle/${fall.id}`}
                        className="block px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-800 truncate">{kunde}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_COLOR[fall.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABEL[fall.status] ?? fall.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#4573A2] font-mono">{fall.fall_nummer ?? fall.id.slice(0, 8)}</span>
                          {fall.sv_termin && <span className="text-[10px] text-gray-400">{new Date(fall.sv_termin).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Offene Tasks */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-800">Offene Tasks ({tasks.length})</span>
              </div>
              {tasks.length === 0 ? (
                <p className="py-6 text-center text-gray-400 text-xs">Keine offenen Tasks</p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  {tasks.map(t => {
                    const fr = t.faelle as Record<string, unknown> | null
                    const fallNr = (fr?.fall_nummer as string) ?? '—'
                    const overdue = t.faellig_am && new Date(t.faellig_am) < now
                    return (
                      <Link key={t.id} href={t.fall_id ? `/admin/faelle/${t.fall_id}` : '#'}
                        className={`block px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                        <p className="text-xs text-gray-800 font-medium truncate">{t.titel}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                          <span className="text-gray-400 font-mono">{fallNr}</span>
                          {t.faellig_am && (
                            <span className={overdue ? 'text-red-500 font-semibold' : 'text-gray-400'}>
                              {new Date(t.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                          {t.prioritaet === 'kritisch' && <span className="bg-red-50 text-red-500 px-1 rounded font-semibold">!</span>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
