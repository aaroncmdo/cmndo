import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ausstehend', color: 'bg-gray-100 text-gray-600' },
  vertrag_unterzeichnet: { label: 'Vertrag unterschrieben', color: 'bg-blue-50 text-blue-600' },
  anzahlung_offen: { label: 'Anzahlung offen', color: 'bg-amber-50 text-amber-600' },
  bezahlt: { label: 'Bezahlt', color: 'bg-green-50 text-green-600' },
  blockiert: { label: 'Blockiert', color: 'bg-red-50 text-red-600' },
}

export default async function AdminSvOnboardingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const db = createAdminClient()
  const { data: svs } = await db.from('sachverstaendige')
    .select('id, profile_id, paket, onboarding_status, onboarding_anzahlung_betrag, onboarding_anzahlung_faellig_am, portal_zugang_freigeschaltet, vertrag_unterschrieben, stripe_anzahlung_bezahlt_am')
    .order('created_at', { ascending: false })

  // Profile-Namen laden
  const profileIds = (svs ?? []).map(s => s.profile_id).filter(Boolean)
  const { data: profiles } = profileIds.length > 0
    ? await db.from('profiles').select('id, vorname, nachname, email').in('id', profileIds)
    : { data: [] }
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">SV-Onboarding Verwaltung</h1>
        <p className="text-sm text-gray-500 mb-5">Übersicht aller Sachverständigen mit Onboarding-Status</p>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Paket</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Anzahlung</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Portal</th>
              </tr>
            </thead>
            <tbody>
              {(svs ?? []).map(sv => {
                const p = sv.profile_id ? profileMap[sv.profile_id] : null
                const name = p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() : sv.id.slice(0, 8)
                const badge = STATUS_BADGE[sv.onboarding_status] ?? STATUS_BADGE.pending
                const anzahlung = Number(sv.onboarding_anzahlung_betrag ?? 0)

                return (
                  <tr key={sv.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-gray-900 font-medium">{name}</p>
                      <p className="text-gray-400 text-[10px]">{p?.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{sv.paket ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.color}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                      {anzahlung > 0 ? `${anzahlung.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €` : '—'}
                      {sv.stripe_anzahlung_bezahlt_am && <span className="ml-1 text-green-500 text-[9px]">bezahlt</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${sv.portal_zugang_freigeschaltet ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {sv.portal_zugang_freigeschaltet ? 'Freigeschaltet' : 'Gesperrt'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {(!svs || svs.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Keine Sachverständigen vorhanden.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
