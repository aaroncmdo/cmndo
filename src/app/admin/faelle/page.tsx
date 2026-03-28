import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'Ersterfassung',
  'sv-zugewiesen': 'SV zugewiesen',
  'sv-termin': 'SV Termin',
  'gutachten-eingegangen': 'Gutachten eingeg.',
  filmcheck: 'Filmcheck',
  'kanzlei-uebergeben': 'Kanzlei übergeben',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

const STATUS_COLOR: Record<string, string> = {
  ersterfassung: 'bg-zinc-800 text-zinc-300',
  'sv-zugewiesen': 'bg-blue-950 text-blue-300',
  'sv-termin': 'bg-blue-900 text-blue-200',
  'gutachten-eingegangen': 'bg-violet-950 text-violet-300',
  filmcheck: 'bg-yellow-950 text-yellow-300',
  'kanzlei-uebergeben': 'bg-green-950 text-green-300',
  anschlussschreiben: 'bg-green-900 text-green-200',
  regulierung: 'bg-emerald-950 text-emerald-300',
  abgeschlossen: 'bg-emerald-900 text-emerald-200',
  storniert: 'bg-red-950 text-red-300',
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

export default async function AdminFaellePage() {
  const supabase = await createClient()

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_datum, schadens_ort, filmcheck_ok, created_at, lead_id')
    .order('created_at', { ascending: false })

  // Fetch lead names separately to avoid join complexity
  const leadIds = (faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]
  const { data: leads } = leadIds.length
    ? await supabase.from('leads').select('id, vorname, nachname, email').in('id', leadIds)
    : { data: [] }

  const leadMap = Object.fromEntries((leads ?? []).map(l => [l.id, l]))

  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Alle Fälle</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{faelle?.length ?? 0} Fälle</p>
        </div>

        {!faelle?.length ? (
          <div className="bg-zinc-900 rounded-2xl p-12 text-center">
            <p className="text-zinc-500">Noch keine Fälle vorhanden.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Fall-Nr.</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Kunde</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Ursache</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Ort</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Filmcheck</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {faelle.map((fall) => {
                    const lead = fall.lead_id ? leadMap[fall.lead_id] : null
                    const name = lead
                      ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || lead.email
                      : '—'
                    return (
                      <tr
                        key={fall.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/faelle/${fall.id}`}
                            className="text-blue-400 hover:text-blue-300 font-mono text-xs"
                          >
                            {fall.fall_nummer ?? fall.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/faelle/${fall.id}`} className="block">
                            <span className="text-white hover:text-blue-300 transition-colors">{name}</span>
                            {lead?.email && (
                              <span className="text-zinc-500 text-xs block">{lead.email}</span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                          {URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">{fall.schadens_ort ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                              STATUS_COLOR[fall.status] ?? 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            {STATUS_LABEL[fall.status] ?? fall.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {fall.filmcheck_ok ? (
                            <span className="text-green-400 text-xs font-medium">✓ OK</span>
                          ) : (
                            <span className="text-zinc-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                          {fall.created_at
                            ? new Date(fall.created_at).toLocaleDateString('de-DE')
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
