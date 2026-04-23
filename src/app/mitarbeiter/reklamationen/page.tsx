// AAR-68: Mitarbeiter Reklamationen — gefiltert auf KB-Faelle
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterReklamationen() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Faelle des KB ermitteln
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen')
    .eq('kundenbetreuer_id', user.id)

  const fallIds = (faelle ?? []).map(f => f.id)
  const fallMap = new Map((faelle ?? []).map(f => [f.id, f]))

  const { data: reklamationen } = fallIds.length > 0 ? await supabase
    .from('reklamationen')
    .select('id, fall_id, grund, begruendung, status, eingereicht_am, frist_bis, bearbeitet_am')
    .in('fall_id', fallIds)
    .order('eingereicht_am', { ascending: false })
  : { data: [] }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0D1B3E]">Reklamationen</h1>
        <p className="text-sm text-gray-500 mt-1">Reklamationen zu Ihren Fällen.</p>
      </div>

      <div className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Fall</th>
              <th className="text-left px-4 py-2">Grund</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Eingereicht</th>
              <th className="text-left px-4 py-2">Frist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(reklamationen ?? []).map(r => {
              const fall = fallMap.get(r.fall_id as string)
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/faelle/${r.fall_id}`} className="text-[#4573A2] hover:underline font-medium">
                      {fall?.fall_nummer ?? (r.fall_id as string).slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.grund ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.status === 'offen' ? 'bg-amber-100 text-amber-700' :
                      r.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{r.status ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {r.eingereicht_am ? new Date(r.eingereicht_am).toLocaleDateString('de-DE') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {r.frist_bis ? new Date(r.frist_bis).toLocaleDateString('de-DE') : '—'}
                  </td>
                </tr>
              )
            })}
            {(!reklamationen || reklamationen.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">Keine Reklamationen</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
