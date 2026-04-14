// AAR-109: Kunde-Portal Termin-Übersicht (alle Termine aller Fälle des Kunden)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CarFrontIcon, CalendarIcon, MapPinIcon, ChevronRightIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

type RawTermin = {
  id: string
  start_zeit: string
  status: string | null
  fall_id: string | null
  sv_id: string | null
  faelle: { id: string; fall_nummer: string | null; kennzeichen: string | null; kunde_id: string | null; schadens_adresse: string | null } | { id: string; fall_nummer: string | null; kennzeichen: string | null; kunde_id: string | null; schadens_adresse: string | null }[] | null
  sachverstaendige: { id: string; profile_id: string | null; profiles: { vorname: string | null; avatar_url: string | null } | { vorname: string | null; avatar_url: string | null }[] | null } | { id: string; profile_id: string | null; profiles: unknown }[] | null
}

export default async function KundeTerminePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select(`
      id, start_zeit, status, fall_id, sv_id,
      faelle!inner (id, fall_nummer, kennzeichen, kunde_id, schadens_adresse),
      sachverstaendige (id, profile_id, profiles(vorname, avatar_url))
    `)
    .eq('faelle.kunde_id', user.id)
    .order('start_zeit', { ascending: false })

  const now = new Date()
  const all = (termine ?? []) as unknown as RawTermin[]
  const zukuenftig = all.filter(t => new Date(t.start_zeit) > now)
  const vergangen = all.filter(t => new Date(t.start_zeit) <= now)

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0D1B3E]">Meine Termine</h1>
        <p className="text-sm text-gray-500 mt-1">Alle Begutachtungs-Termine für Ihre Fälle</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Bevorstehend</h2>
        {zukuenftig.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white border border-gray-200 rounded-2xl p-6 text-center">
            Keine bevorstehenden Termine
          </p>
        ) : (
          <div className="space-y-3">
            {zukuenftig.map(t => <TerminCard key={t.id} termin={t} />)}
          </div>
        )}
      </section>

      {vergangen.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Vergangen</h2>
          <div className="space-y-3">
            {vergangen.map(t => <TerminCard key={t.id} termin={t} past />)}
          </div>
        </section>
      )}
    </div>
  )
}

function TerminCard({ termin, past }: { termin: RawTermin; past?: boolean }) {
  const svJoin = termin.sachverstaendige
  const sv = Array.isArray(svJoin) ? svJoin[0] : svJoin
  const profiles = sv?.profiles as { vorname: string | null; avatar_url: string | null } | { vorname: string | null; avatar_url: string | null }[] | null
  const profile = Array.isArray(profiles) ? profiles[0] : profiles

  const fallJoin = termin.faelle
  const fall = Array.isArray(fallJoin) ? fallJoin[0] : fallJoin

  const date = new Date(termin.start_zeit)
  const statusBadge = {
    reserviert: { label: 'Reserviert', cls: 'bg-amber-50 text-amber-700' },
    bestaetigt: { label: 'Bestätigt', cls: 'bg-green-50 text-green-700' },
    abgesagt: { label: 'Abgesagt', cls: 'bg-red-50 text-red-700' },
    durchgefuehrt: { label: 'Durchgeführt', cls: 'bg-blue-50 text-blue-700' },
  }[termin.status ?? ''] ?? { label: termin.status ?? '—', cls: 'bg-gray-100 text-gray-600' }

  return (
    <Link
      href={fall ? `/kunde/faelle/${fall.id}` : '#'}
      className={`block bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#4573A2] hover:shadow-sm transition-all ${past ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-4">
        {profile?.avatar_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={profile.avatar_url} alt={profile.vorname ?? ''} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-[#4573A2] flex items-center justify-center text-white font-bold">
            {profile?.vorname?.charAt(0).toUpperCase() ?? '?'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-[#0D1B3E]">
              Gutachter {profile?.vorname ?? 'Unbekannt'}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-1">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span>
              {date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              {' · '}
              {date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
            </span>
          </div>

          {fall?.schadens_adresse && (
            <div className="flex items-start gap-1.5 text-xs text-gray-500">
              <MapPinIcon className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
              <span>{fall.schadens_adresse}</span>
            </div>
          )}

          {fall && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
              <CarFrontIcon className="w-3 h-3" />
              <span>Fall {fall.fall_nummer ?? fall.id.slice(0, 8)}{fall.kennzeichen ? ` · ${fall.kennzeichen}` : ''}</span>
            </div>
          )}
        </div>

        <ChevronRightIcon className="w-5 h-5 text-gray-300 mt-1 shrink-0" />
      </div>
    </Link>
  )
}
