import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const STATUS_COLOR: Record<string, string> = {
  neu: 'bg-[#4573A2]/5 text-[#4573A2]',
  'in-bearbeitung': 'bg-amber-50 text-amber-600',
  geloest: 'bg-green-50 text-green-600',
  geschlossen: 'bg-gray-100 text-gray-500',
}

const KAT_LABEL: Record<string, string> = {
  'seite-laedt-nicht': 'Seite lädt nicht',
  'upload-fehler': 'Upload-Fehler',
  'anzeige-fehler': 'Anzeige-Fehler',
  'login-problem': 'Login-Problem',
  sonstiges: 'Sonstiges',
}

export default async function SupportPage() {
  const supabase = await createClient()

  const { data: probleme } = await supabase
    .from('technische_probleme')
    .select('id, user_id, kategorie, beschreibung, browser, aktuelle_url, status, antwort, erstellt_am, profiles(vorname, nachname, email)')
    .order('erstellt_am', { ascending: false })

  return (
    <div className="px-4 py-6 overflow-y-auto" style={{ height: '100%' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Support-Tickets</h1>
            <p className="text-gray-500 text-xs">{(probleme ?? []).length} gemeldete Probleme</p>
          </div>
        </div>

        {(probleme ?? []).length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="text-gray-400 text-sm">Keine Probleme gemeldet</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Datum</th>
                  <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Kunde</th>
                  <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Kategorie</th>
                  <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Beschreibung</th>
                  <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Status</th>
                  <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Browser</th>
                </tr>
              </thead>
              <tbody>
                {(probleme ?? []).map(p => {
                  const profileRaw = p.profiles as unknown
                  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { vorname: string | null; nachname: string | null; email: string | null } | null
                  const name = profile ? [profile.vorname, profile.nachname].filter(Boolean).join(' ') || profile.email : '—'
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(p.erstellt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-gray-800 text-xs">{name}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{KAT_LABEL[p.kategorie] ?? p.kategorie}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs max-w-xs truncate">{p.beschreibung}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[p.status] ?? 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-[10px] max-w-32 truncate">{p.browser?.split(' ').pop() ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
