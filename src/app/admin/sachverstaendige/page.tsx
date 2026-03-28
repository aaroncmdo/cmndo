import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import NeuSvForm from './NeuSvForm'

const PAKET_LABEL: Record<string, string> = {
  'starter-10': 'Starter',
  'standard-25': 'Standard',
  'premium-50': 'Premium',
}

const PAKET_COLOR: Record<string, string> = {
  'starter-10': 'bg-zinc-800 text-zinc-300',
  'standard-25': 'bg-blue-950 text-blue-300',
  'premium-50': 'bg-violet-950 text-violet-300',
}

export default async function SachverstaendigePage() {
  const supabase = await createClient()

  const { data: svList } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, gebiet_plz, paket, offene_faelle, max_faelle_monat, partner_seit, ist_aktiv, profiles(vorname, nachname, email)')
    .order('created_at', { ascending: false })

  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Sachverständige</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{svList?.length ?? 0} Sachverständige</p>
          </div>
        </div>

        <NeuSvForm />

        {!svList?.length ? (
          <div className="bg-zinc-900 rounded-2xl p-12 text-center mt-6">
            <p className="text-zinc-500">Noch keine Sachverständigen angelegt.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 mt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Gebiet (PLZ)</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Paket</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Offene Fälle</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Max / Monat</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Partner seit</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {svList.map((sv) => {
                    // Supabase may return array or object for the join
                    const profileRaw = sv.profiles as unknown
                    const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
                    const p = profile as { vorname: string | null; nachname: string | null; email: string | null } | null
                    const name = p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() : ''
                    const plzDisplay = (sv.gebiet_plz ?? []).slice(0, 3).join(', ')
                    const plzMore = (sv.gebiet_plz ?? []).length > 3
                      ? ` +${(sv.gebiet_plz as string[]).length - 3}`
                      : ''

                    return (
                      <tr
                        key={sv.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link href={`/admin/sachverstaendige/${sv.id}`} className="block">
                            <span className="text-white hover:text-blue-300 transition-colors">
                              {name || '—'}
                            </span>
                            {p?.email && (
                              <span className="text-zinc-500 text-xs block">{p.email}</span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs font-mono">
                          {plzDisplay || '—'}
                          {plzMore && <span className="text-zinc-600">{plzMore}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAKET_COLOR[sv.paket] ?? 'bg-zinc-800 text-zinc-300'}`}>
                            {PAKET_LABEL[sv.paket] ?? sv.paket}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 tabular-nums">{sv.offene_faelle ?? 0}</td>
                        <td className="px-4 py-3 text-zinc-400 tabular-nums">{sv.max_faelle_monat}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                          {sv.partner_seit
                            ? new Date(sv.partner_seit).toLocaleDateString('de-DE')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {sv.ist_aktiv ? (
                            <span className="text-green-400 text-xs font-medium">Aktiv</span>
                          ) : (
                            <span className="text-red-400 text-xs font-medium">Inaktiv</span>
                          )}
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
