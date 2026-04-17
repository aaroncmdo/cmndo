// AAR-409: SV-Fälle-Archiv. Single-Screen-Ansicht (keine Tabs mehr — Stellungnahme
// lebt inline in der Fallakte via AAR-400, Tasks werden mit AAR-370 aus der
// SV-Nav entfernt). Filter + Freitext-Suche kommen aus der URL (<FaelleFilterBar>).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarIcon, NavigationIcon, PhoneIcon } from 'lucide-react'
import FaelleFilterBar from './FaelleFilterBar'
import PhoneButton from '@/components/shared/PhoneButton'
import FallStatusBadge from '@/components/shared/FallStatusBadge'
import SchadensUrsacheBadge from '@/components/shared/SchadensUrsacheBadge'

type FilterKey = 'alle' | 'neue' | 'bearbeitung' | 'gutachten' | 'abgeschlossen'

const FILTER_TO_STATUSES: Record<Exclude<FilterKey, 'alle'>, string[]> = {
  neue: ['sv-zugewiesen'],
  bearbeitung: ['sv-termin', 'besichtigung'],
  gutachten: ['gutachten-eingegangen'],
  abgeschlossen: ['abgeschlossen'],
}

function normalizeFilter(raw: string | undefined): FilterKey {
  if (raw === 'neue' || raw === 'bearbeitung' || raw === 'gutachten' || raw === 'abgeschlossen') {
    return raw
  }
  return 'alle'
}

export default async function GutachterFaellePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const { filter, q } = await searchParams
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')

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

  const activeFilter = normalizeFilter(filter)
  const searchTerm = (q ?? '').trim()

  let query = supabase
    .from('faelle')
    .select(
      'id, fall_nummer, status, schadens_ursache, schadens_datum, schadens_ort, sv_termin, gutachten_eingegangen_am, created_at, lead_id',
    )
    .eq('sv_id', sv.id)
    .order('created_at', { ascending: false })

  if (activeFilter !== 'alle') {
    query = query.in('status', FILTER_TO_STATUSES[activeFilter])
  }

  const { data: rawFaelle } = await query

  const admin = createAdminClient()
  const allRaw = rawFaelle ?? []
  const fallIds = allRaw.map((f) => f.id)

  const { data: unreadMsgs } = fallIds.length > 0
    ? await admin
        .from('nachrichten')
        .select('fall_id')
        .eq('gelesen', false)
        .eq('sender_rolle', 'kunde')
        .in('fall_id', fallIds)
    : { data: [] as { fall_id: string }[] }
  const unreadMap: Record<string, number> = {}
  for (const msg of unreadMsgs ?? []) {
    unreadMap[msg.fall_id] = (unreadMap[msg.fall_id] ?? 0) + 1
  }

  const leadIds = allRaw.map((f) => f.lead_id).filter(Boolean) as string[]
  const { data: leads } = leadIds.length
    ? await supabase
        .from('leads')
        .select('id, vorname, nachname, telefon')
        .in('id', leadIds)
    : { data: [] as { id: string; vorname: string | null; nachname: string | null; telefon: string | null }[] }
  const leadMap = Object.fromEntries((leads ?? []).map((l) => [l.id, l]))

  // Freitext-Filter läuft nach dem Hauptquery, da er Felder aus faelle + leads
  // kombiniert (Fall-Nr. + Kunden-Name + Ort).
  const needle = searchTerm.toLowerCase()
  const filteredByText = needle
    ? allRaw.filter((f) => {
        const lead = f.lead_id ? leadMap[f.lead_id] : null
        const name = lead
          ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim().toLowerCase()
          : ''
        return (
          (f.fall_nummer ?? '').toLowerCase().includes(needle) ||
          name.includes(needle) ||
          (f.schadens_ort ?? '').toLowerCase().includes(needle)
        )
      })
    : allRaw

  const faelleWithUnread = filteredByText.map((f) => ({
    ...f,
    ungelesene_nachrichten: unreadMap[f.id] ?? 0,
  }))

  faelleWithUnread.sort(
    (a, b) =>
      b.ungelesene_nachrichten - a.ungelesene_nachrichten ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const faelle = faelleWithUnread

  return (
    <div className="h-full flex flex-col">
      <FaelleFilterBar
        faelleCount={faelle.length}
        initialFilter={activeFilter}
        initialQuery={searchTerm}
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* XL-Karten für anstehende Termine (nächste 7 Tage) */}
        {(() => {
          const now = new Date()
          const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          const xlFaelle = faelle
            .filter((f) => {
              if (!f.sv_termin) return false
              const t = new Date(f.sv_termin)
              return t >= now && t <= in7d
            })
            .sort(
              (a, b) =>
                new Date(a.sv_termin!).getTime() -
                new Date(b.sv_termin!).getTime(),
            )
          if (xlFaelle.length === 0) return null
          return (
            <div className="mb-4 space-y-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" /> Nächste Termine
              </h2>
              {xlFaelle.map((fall) => {
                const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                const name = lead
                  ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                  : '—'
                const termin = new Date(fall.sv_termin!)
                const isHeute = termin.toDateString() === now.toDateString()
                const adresse = fall.schadens_ort ?? '—'
                return (
                  <div
                    key={fall.id}
                    className={`rounded-2xl border-2 p-5 ${isHeute ? 'border-[#4573A2] bg-[#4573A2]/5' : 'border-gray-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-lg font-bold ${isHeute ? 'text-[#1E3A5F]' : 'text-gray-900'}`}
                          >
                            {termin.toLocaleTimeString('de-DE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            Uhr
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${isHeute ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'}`}
                          >
                            {isHeute
                              ? 'HEUTE'
                              : termin.toLocaleDateString('de-DE', {
                                  weekday: 'short',
                                  day: '2-digit',
                                  month: '2-digit',
                                })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 mt-1">{name}</p>
                        <p className="text-xs text-gray-500">{adresse}</p>
                      </div>
                      <Link
                        href={`/gutachter/fall/${fall.id}`}
                        className="text-[10px] text-[#4573A2] hover:underline"
                      >
                        {fall.fall_nummer ?? fall.id.slice(0, 8)}
                      </Link>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-[#1E3A5F] hover:bg-[#4573A2] text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
                      >
                        <NavigationIcon className="w-4 h-4" /> Navigation starten
                      </a>
                      {lead?.telefon && (
                        <PhoneButton
                          nummer={lead.telefon}
                          variant="card"
                          label="Anrufen"
                          className="justify-center !bg-white !border !border-gray-200 hover:!bg-gray-50 !text-gray-700 !rounded-xl !px-4 !py-2.5 text-sm"
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {faelle.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <p className="text-gray-500">
              {searchTerm
                ? `Keine Fälle passen zu "${searchTerm}".`
                : 'Keine Fälle gefunden.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-0">
            {/* Desktop-Tabelle */}
            <div className="hidden sm:block bg-white rounded-2xl overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">
                        Fall-Nr.
                      </th>
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
                        : '—'
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
                            <SchadensUrsacheBadge ursache={fall.schadens_ursache} plain />
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {fall.schadens_ort ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                            {fall.sv_termin
                              ? new Date(fall.sv_termin).toLocaleDateString('de-DE', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <FallStatusBadge status={fall.status} size="md" />
                          </td>
                          <td className="px-4 py-3">
                            {fall.ungelesene_nachrichten > 0 && (
                              <span className="inline-flex items-center gap-0.5 bg-[#4573A2] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {fall.ungelesene_nachrichten}
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

            {/* Mobile-Cards */}
            <div className="sm:hidden space-y-3">
              {faelle.map((fall) => {
                const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                const name = lead
                  ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
                  : '—'
                return (
                  <Link
                    key={fall.id}
                    href={`/gutachter/fall/${fall.id}`}
                    className="block bg-white rounded-2xl p-4 border border-gray-200 hover:border-gray-300 transition-colors relative"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-[#7BA3CC] font-mono text-xs">
                          {fall.fall_nummer ?? fall.id.slice(0, 8)}
                        </span>
                        <p className="text-gray-900 text-sm font-medium mt-0.5">{name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {fall.ungelesene_nachrichten > 0 && (
                          <span className="inline-flex items-center gap-0.5 bg-[#4573A2] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {fall.ungelesene_nachrichten}
                          </span>
                        )}
                        <FallStatusBadge status={fall.status} size="md" />
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <SchadensUrsacheBadge ursache={fall.schadens_ursache} plain />
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
