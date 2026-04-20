// AAR-68: Mitarbeiter Faelle-Liste — alle dem KB zugewiesenen Faelle
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterFaelle() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, created_at, sa_unterschrieben')
    .eq('kundenbetreuer_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0D1B3E]">Meine Fälle</h1>
        <p className="text-sm text-gray-500 mt-1">Alle Ihnen zugewiesenen Fälle, sortiert nach Erstellung.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Fall</th>
              <th className="text-left px-4 py-2">Fahrzeug</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Erstellt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(faelle ?? []).map(f => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/faelle/${f.id}`} className="text-[#4573A2] hover:underline font-medium">
                    {f.fall_nummer ?? f.id.slice(0, 8)}
                  </Link>
                  {f.kennzeichen && <p className="text-xs text-gray-400">{f.kennzeichen}</p>}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {[f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{f.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(f.created_at).toLocaleDateString('de-DE')}
                </td>
              </tr>
            ))}
            {(!faelle || faelle.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400 text-sm">Keine Fälle zugewiesen</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
