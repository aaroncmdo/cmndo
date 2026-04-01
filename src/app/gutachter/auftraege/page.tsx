import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  'sv-zugewiesen': 'Zugewiesen',
  'sv-termin': 'Termin vereinbart',
  'gutachten-eingegangen': 'Gutachten eingereicht',
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
  sachbeschaedigung: 'Sachbeschädigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
}

export default async function AuftraegePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  const sv = await getGutachterForUser(supabase, user!.id, 'id')

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

  let query = supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_datum, schadens_ort, sv_termin, gutachten_eingegangen_am, created_at, lead_id')
    .eq('sv_id', sv.id)
    .order('created_at', { ascending: false })

  if (filter === 'neu') {
    query = query.in('status', ['sv-zugewiesen', 'sv-termin'])
  } else if (filter === 'offen') {
    query = query.is('gutachten_eingegangen_am', null).not('status', 'in', '("abgeschlossen","storniert")')
  }

  const { data: faelle } = await query

  // Fetch lead names
  const leadIds = (faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]
  const { data: leads } = leadIds.length
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }
  const leadMap = Object.fromEntries((leads ?? []).map(l => [l.id, l]))

  const activeFilter = filter ?? 'alle'

  return (
    <div className="h-full flex flex-col">
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Meine Aufträge</h1>
          <p className="text-gray-500 text-sm mt-0.5">{faelle?.length ?? 0} Aufträge</p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {([
            ['alle', 'Alle'],
            ['neu', 'Neue'],
            ['offen', 'Bericht offen'],
          ] as [string, string][]).map(([key, label]) => (
            <Link
              key={key}
              href={key === 'alle' ? '/gutachter/auftraege' : `/gutachter/auftraege?filter=${key}`}
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

        {!faelle?.length ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <p className="text-gray-500">Keine Aufträge gefunden.</p>
          </div>
        ) : (
          /* Mobile cards + desktop table hybrid */
          <div className="space-y-3 sm:space-y-0">
            {/* Desktop table - hidden on mobile */}
            <div className="hidden sm:block bg-white rounded-2xl overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">Fall-Nr.</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Kunde</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Ursache</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Ort</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">SV-Termin</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faelle.map((fall) => {
                      const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                      const name = lead
                        ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                        : '—'
                      return (
                        <tr
                          key={fall.id}
                          className="border-b border-gray-200/50 hover:bg-gray-100/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/gutachter/auftrag/${fall.id}`}
                              className="text-[#7BA3CC] hover:text-[#7BA3CC] font-mono text-xs"
                            >
                              {fall.fall_nummer ?? fall.id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-800">{name}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fall.schadens_ort ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                            {fall.sv_termin
                              ? new Date(fall.sv_termin).toLocaleDateString('de-DE', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                })
                              : '—'}
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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards - hidden on desktop */}
            <div className="sm:hidden space-y-3">
              {faelle.map((fall) => {
                const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                const name = lead
                  ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                  : '—'
                return (
                  <Link
                    key={fall.id}
                    href={`/gutachter/auftrag/${fall.id}`}
                    className="block bg-white rounded-2xl p-4 border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-[#7BA3CC] font-mono text-xs">
                          {fall.fall_nummer ?? fall.id.slice(0, 8)}
                        </span>
                        <p className="text-gray-900 text-sm font-medium mt-0.5">{name}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          STATUS_COLOR[fall.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {STATUS_LABEL[fall.status] ?? fall.status}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>{URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? '—'}</span>
                      <span>{fall.schadens_ort ?? '—'}</span>
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
