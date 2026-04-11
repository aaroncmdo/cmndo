import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarIcon, NavigationIcon, PhoneIcon } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  'sv-zugewiesen': 'Zugewiesen',
  'sv-termin': 'Termin vereinbart',
  besichtigung: 'Besichtigung',
  'gutachten-eingegangen': 'Gutachten erstellt',
  filmcheck: 'Im Filmcheck',
  'kanzlei-uebergeben': 'Bei Kanzlei',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

const STATUS_COLOR: Record<string, string> = {
  'sv-zugewiesen': 'bg-[#4573A2]/5 text-[#7BA3CC]',
  'sv-termin': 'bg-[#0D1B3E] text-[#7BA3CC]',
  besichtigung: 'bg-[#4573A2]/5 text-[#7BA3CC]',
  'gutachten-eingegangen': 'bg-violet-50 text-violet-300',
  filmcheck: 'bg-yellow-50 text-yellow-300',
  'kanzlei-uebergeben': 'bg-green-50 text-green-300',
  anschlussschreiben: 'bg-green-900 text-green-200',
  regulierung: 'bg-emerald-50 text-emerald-300',
  abgeschlossen: 'bg-emerald-900 text-emerald-200',
  storniert: 'bg-red-50 text-red-300',
}

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschaedigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiss',
  sonstiges: 'Sonstiges',
  kfz: 'Kfz-Schaden',
}

type FilterKey = 'alle' | 'neue' | 'bearbeitung' | 'gutachten' | 'abgeschlossen'

const FILTER_TABS: [FilterKey, string][] = [
  ['alle', 'Alle'],
  ['neue', 'Neue'],
  ['bearbeitung', 'In Bearbeitung'],
  ['gutachten', 'Gutachten erstellt'],
  ['abgeschlossen', 'Abgeschlossen'],
]

export default async function GutachterFaellePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Fetch SV profile
  const sv = await getGutachterForUser(supabase, user.id, 'id')

  if (!sv) {
    return (
      <div className="h-full flex flex-col">
        <div className="w-full">
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <p className="text-gray-500">Kein Sachverständigen-Profil gefunden.</p>
          </div>
        </div>
      </div>
    )
  }

  // Build query with filter
  let query = supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_datum, schadens_ort, sv_termin, gutachten_eingegangen_am, created_at, lead_id')
    .eq('sv_id', sv.id)
    .order('created_at', { ascending: false })

  const activeFilter = (filter ?? 'alle') as FilterKey

  if (activeFilter === 'neue') {
    query = query.in('status', ['sv-zugewiesen'])
  } else if (activeFilter === 'bearbeitung') {
    query = query.in('status', ['sv-termin', 'besichtigung'])
  } else if (activeFilter === 'gutachten') {
    query = query.in('status', ['gutachten-eingegangen'])
  } else if (activeFilter === 'abgeschlossen') {
    query = query.in('status', ['abgeschlossen'])
  }

  const { data: rawFaelle } = await query

  // KFZ-195a: Batch-Lookup statt N+1 fuer ungelesene Nachrichten
  const admin = createAdminClient()
  const allRaw = rawFaelle ?? []
  const fallIds = allRaw.map(f => f.id)

  // Batch: alle ungelesenen Nachrichten in einem Query
  const { data: unreadMsgs } = fallIds.length > 0
    ? await admin.from('nachrichten').select('fall_id').eq('gelesen', false).eq('sender_rolle', 'kunde').in('fall_id', fallIds)
    : { data: [] }
  const unreadMap: Record<string, number> = {}
  for (const msg of unreadMsgs ?? []) {
    unreadMap[msg.fall_id] = (unreadMap[msg.fall_id] ?? 0) + 1
  }

  const faelleWithUnread = allRaw.map(f => ({
    ...f,
    ungelesene_nachrichten: unreadMap[f.id] ?? 0,
    ungelesene_updates: 0, // TODO: batch RPC for count_unread_updates
  }))

  // Sortierung: Faelle mit ungelesenen Nachrichten OBEN
  faelleWithUnread.sort((a, b) => b.ungelesene_nachrichten - a.ungelesene_nachrichten || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const faelle = faelleWithUnread

  // Fetch lead names
  const leadIds = (faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]
  const { data: leads } = leadIds.length
    ? await supabase.from('leads').select('id, vorname, nachname, telefon').in('id', leadIds)
    : { data: [] }
  const leadMap = Object.fromEntries((leads ?? []).map(l => [l.id, l]))

  return (
    <div className="h-full flex flex-col">
      {/* Sticky Topbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Meine Fälle</h1>
          <p className="text-gray-500 text-xs">{faelle?.length ?? 0} Fälle</p>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {FILTER_TABS.map(([key, label]) => (
            <Link
              key={key}
              href={key === 'alle' ? '/gutachter/faelle' : `/gutachter/faelle?filter=${key}`}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === key
                  ? 'bg-gray-100 text-gray-900'
                  : 'bg-white text-gray-500 hover:text-gray-800 border border-gray-200'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* KFZ-158: XL-Karten fuer Faelle mit anstehenden Terminen (naechste 7 Tage) */}
        {(() => {
          const now = new Date()
          const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          const xlFaelle = (faelle ?? []).filter(f => {
            if (!f.sv_termin) return false
            const t = new Date(f.sv_termin)
            return t >= now && t <= in7d
          }).sort((a, b) => new Date(a.sv_termin!).getTime() - new Date(b.sv_termin!).getTime())
          if (xlFaelle.length === 0) return null
          return (
            <div className="mb-4 space-y-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" /> Nächste Termine
              </h2>
              {xlFaelle.map(fall => {
                const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                const name = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
                const termin = new Date(fall.sv_termin!)
                const isHeute = termin.toDateString() === now.toDateString()
                const adresse = fall.schadens_ort ?? '—'
                return (
                  <div key={fall.id} className={`rounded-2xl border-2 p-5 ${isHeute ? 'border-[#4573A2] bg-[#4573A2]/5' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-bold ${isHeute ? 'text-[#1E3A5F]' : 'text-gray-900'}`}>
                            {termin.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isHeute ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {isHeute ? 'HEUTE' : termin.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 mt-1">{name}</p>
                        <p className="text-xs text-gray-500">{adresse}</p>
                      </div>
                      <Link href={`/gutachter/fall/${fall.id}`} className="text-[10px] text-[#4573A2] hover:underline">
                        {fall.fall_nummer ?? fall.id.slice(0, 8)}
                      </Link>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-[#1E3A5F] hover:bg-[#4573A2] text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
                      >
                        <NavigationIcon className="w-4 h-4" /> Navigation starten
                      </a>
                      {lead?.telefon && (
                        <a href={`tel:${lead.telefon}`}
                          className="flex items-center justify-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl px-4 py-2.5 text-sm transition-colors"
                        >
                          <PhoneIcon className="w-4 h-4" /> Anrufen
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {!faelle?.length ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <p className="text-gray-500">Keine Fälle gefunden.</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-0">
            {/* Desktop table */}
            <div className="hidden sm:block bg-white rounded-2xl overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Fall-Nr.</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Kunde</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Schadentyp</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Ort</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">SV-Termin</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Chat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faelle.map((fall) => {
                      const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                      const name = lead
                        ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                        : '--'
                      return (
                        <tr
                          key={fall.id}
                          className="border-b border-gray-200/50 hover:bg-gray-100/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/gutachter/fall/${fall.id}`}
                              className="text-[#7BA3CC] hover:text-[#7BA3CC] font-mono text-xs"
                            >
                              {fall.fall_nummer ?? fall.id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-800">{name}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? '--'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fall.schadens_ort ?? '--'}</td>
                          <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                            {fall.sv_termin
                              ? new Date(fall.sv_termin).toLocaleDateString('de-DE', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                })
                              : '--'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                                STATUS_COLOR[fall.status] ?? 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {STATUS_LABEL[fall.status] ?? fall.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {(fall.ungelesene_nachrichten ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 bg-[#4573A2] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {fall.ungelesene_nachrichten}
                              </span>
                            )}
                            {(fall.ungelesene_updates ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 bg-[#DC2626] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                                {fall.ungelesene_updates}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {faelle.map((fall) => {
                const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                const name = lead
                  ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                  : '--'
                return (
                  <Link
                    key={fall.id}
                    href={`/gutachter/fall/${fall.id}`}
                    className="block bg-white rounded-2xl p-4 border border-gray-200 hover:border-gray-300 transition-colors relative"
                  >
                    {/* KFZ-182: NotificationDot wenn Chat UND Updates > 0 */}
                    {(fall.ungelesene_nachrichten ?? 0) > 0 && (fall.ungelesene_updates ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#DC2626] rounded-full border-2 border-white z-10" />
                    )}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-[#7BA3CC] font-mono text-xs">
                          {fall.fall_nummer ?? fall.id.slice(0, 8)}
                        </span>
                        <p className="text-gray-900 text-sm font-medium mt-0.5">{name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {(fall.ungelesene_nachrichten ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 bg-[#4573A2] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {fall.ungelesene_nachrichten}
                          </span>
                        )}
                        {(fall.ungelesene_updates ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 bg-[#DC2626] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {fall.ungelesene_updates}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                            STATUS_COLOR[fall.status] ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {STATUS_LABEL[fall.status] ?? fall.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>{URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? '--'}</span>
                      <span>{fall.schadens_ort ?? '--'}</span>
                      {fall.sv_termin && (
                        <span>
                          Termin: {new Date(fall.sv_termin).toLocaleDateString('de-DE')}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
