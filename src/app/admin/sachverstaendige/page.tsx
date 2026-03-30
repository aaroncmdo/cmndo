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

const TYP_LABEL: Record<string, string> = {
  'kfz-gutachter': 'KFZ-SV',
  'dat-gutachter': 'DAT',
  'akademie': 'Akademie',
  'gutachterbuero': 'Büro',
}

const TYP_COLOR: Record<string, string> = {
  'kfz-gutachter': 'bg-blue-950 text-blue-300',
  'dat-gutachter': 'bg-orange-950 text-orange-300',
  'akademie': 'bg-green-950 text-green-300',
  'gutachterbuero': 'bg-violet-950 text-violet-300',
}

export default async function SachverstaendigePage() {
  const supabase = await createClient()

  const { data: svList } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, gebiet_plz, paket, offene_faelle, max_faelle_monat, partner_seit, ist_aktiv, gutachter_typ, qualifikationen, onboarding_abgeschlossen, anzahlung_status, standort_adresse, paket_faelle_genutzt, paket_faelle_gesamt, guthaben, profiles(vorname, nachname, email)')
    .order('created_at', { ascending: false })

  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Sachverständige</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{svList?.length ?? 0} Sachverständige</p>
          </div>
          <Link
            href="/admin/sachverstaendige/onboarding"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            + Neuer Gutachter
          </Link>
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
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Typ</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Qualifikationen</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Paket</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Standort</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Auslastung</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Anzahlung</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Onboarding</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {svList.map((sv) => {
                    const profileRaw = sv.profiles as unknown
                    const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
                    const p = profile as { vorname: string | null; nachname: string | null; email: string | null } | null
                    const name = p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() : ''
                    const typ = (sv as Record<string, unknown>).gutachter_typ as string ?? 'kfz-gutachter'
                    const quals = ((sv as Record<string, unknown>).qualifikationen as string[] | null) ?? []
                    const genutzt = (sv as Record<string, unknown>).paket_faelle_genutzt as number ?? sv.offene_faelle ?? 0
                    const gesamt = (sv as Record<string, unknown>).paket_faelle_gesamt as number ?? sv.max_faelle_monat ?? 10
                    const auslastung = gesamt > 0 ? Math.round((genutzt / gesamt) * 100) : 0
                    const anzahlungStatus = (sv as Record<string, unknown>).anzahlung_status as string ?? 'offen'
                    const onboardingDone = (sv as Record<string, unknown>).onboarding_abgeschlossen as boolean ?? false
                    const standort = (sv as Record<string, unknown>).standort_adresse as string | null

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
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYP_COLOR[typ] ?? 'bg-zinc-800 text-zinc-300'}`}>
                            {TYP_LABEL[typ] ?? typ}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-48">
                            {quals.slice(0, 3).map(q => (
                              <span key={q} className="bg-zinc-800 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded">{q}</span>
                            ))}
                            {quals.length > 3 && <span className="text-zinc-600 text-[10px]">+{quals.length - 3}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAKET_COLOR[sv.paket] ?? 'bg-zinc-800 text-zinc-300'}`}>
                            {PAKET_LABEL[sv.paket] ?? sv.paket}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs max-w-32 truncate">
                          {standort ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs tabular-nums ${auslastung > 80 ? 'text-red-400' : auslastung > 50 ? 'text-amber-400' : 'text-zinc-300'}`}>
                              {genutzt}/{gesamt}
                            </span>
                            <span className="text-zinc-600 text-[10px]">{auslastung}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${
                            anzahlungStatus === 'bezahlt' ? 'text-green-400' :
                            anzahlungStatus === 'teilweise' ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {anzahlungStatus === 'bezahlt' ? 'Bezahlt' : anzahlungStatus === 'teilweise' ? 'Teilweise' : 'Offen'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {onboardingDone ? (
                            <span className="text-green-400 text-xs font-medium">Fertig</span>
                          ) : (
                            <span className="text-amber-400 text-xs font-medium">Offen</span>
                          )}
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
