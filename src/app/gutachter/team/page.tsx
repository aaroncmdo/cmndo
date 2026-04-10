import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import { Building2Icon, GraduationCapIcon, MailIcon } from 'lucide-react'

// KFZ-152 Phase 2+3: Team-Verwaltung fuer Buero-Inhaber und Akademie-Verwalter.
// Zeigt alle Sub-SVs der eigenen Org mit Status, Paket, Werbebudget, Faellen.
// Phase-1 MVP: nur Listing, keine Edit/Sperren-Aktionen (Folge-Auftrag).

export const dynamic = 'force-dynamic'

type SubSv = {
  id: string
  paket: string
  rolle_in_organisation: string | null
  ist_aktiv: boolean
  portal_zugang_freigeschaltet: boolean
  max_faelle_monat: number
  paket_faelle_genutzt: number | null
  werbebudget_guthaben_netto: number | null
  vorname: string | null
  nachname: string | null
  email: string | null
}

export default async function TeamPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    organisation_id: string | null
    rolle_in_organisation: string | null
    ist_parent_account: boolean
  }>(supabase, user.id, 'id, organisation_id, rolle_in_organisation, ist_parent_account')

  if (!sv?.organisation_id) {
    redirect('/gutachter?error=Du+gehoerst+keiner+Organisation')
  }

  // Org-Stammdaten + Berechtigungs-Check
  const { data: org } = await supabase
    .from('organisationen')
    .select('id, name, typ, hauptansprechpartner_user_id')
    .eq('id', sv.organisation_id)
    .single()

  if (!org) redirect('/gutachter?error=Organisation+nicht+gefunden')

  const isVerwalter = org.hauptansprechpartner_user_id === user.id || sv.ist_parent_account
  if (!isVerwalter) {
    redirect('/gutachter?error=Nur+Inhaber+oder+Verwalter+haben+Zugriff')
  }

  // Sub-SVs der Org laden
  const { data: subRows } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, paket, rolle_in_organisation, ist_aktiv, portal_zugang_freigeschaltet, max_faelle_monat, paket_faelle_genutzt, werbebudget_guthaben_netto')
    .eq('organisation_id', sv.organisation_id)
    .neq('id', sv.id) // Verwalter selbst raus

  // Profile-Lookup
  const profileIds = (subRows ?? []).map(s => s.profile_id).filter(Boolean) as string[]
  const profileMap = new Map<string, { vorname: string | null; nachname: string | null; email: string | null }>()
  if (profileIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, vorname, nachname, email')
      .in('id', profileIds)
    for (const p of profs ?? []) profileMap.set(p.id, p)
  }

  const subSvs: SubSv[] = (subRows ?? []).map(s => ({
    id: s.id,
    paket: s.paket ?? 'standard',
    rolle_in_organisation: s.rolle_in_organisation,
    ist_aktiv: !!s.ist_aktiv,
    portal_zugang_freigeschaltet: !!s.portal_zugang_freigeschaltet,
    max_faelle_monat: s.max_faelle_monat ?? 0,
    paket_faelle_genutzt: s.paket_faelle_genutzt,
    werbebudget_guthaben_netto: s.werbebudget_guthaben_netto != null ? Number(s.werbebudget_guthaben_netto) : null,
    vorname: s.profile_id ? profileMap.get(s.profile_id)?.vorname ?? null : null,
    nachname: s.profile_id ? profileMap.get(s.profile_id)?.nachname ?? null : null,
    email: s.profile_id ? profileMap.get(s.profile_id)?.email ?? null : null,
  }))

  const Icon = org.typ === 'akademie' ? GraduationCapIcon : Building2Icon
  const orgLabel = org.typ === 'akademie' ? 'Akademie' : 'Büro'

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-3">
            <Icon className="w-6 h-6 text-[#4573A2]" /> {org.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Team-Verwaltung — {orgLabel} mit {subSvs.length} Mitgliedern
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {subSvs.length === 0 ? (
          <div className="p-12 text-center">
            <MailIcon className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Noch keine Mitglieder in deiner Organisation.</p>
            <p className="text-[11px] text-gray-400 mt-2">
              Mitglieder werden vom Admin über das Anlege-UI hinzugefügt.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Paket</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Fälle Monat</th>
                <th className="text-right px-4 py-3">Werbebudget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subSvs.map(s => {
                const name = [s.vorname, s.nachname].filter(Boolean).join(' ') || '—'
                const status = !s.ist_aktiv ? { label: 'Inaktiv', cls: 'bg-gray-100 text-gray-500' }
                  : !s.portal_zugang_freigeschaltet ? { label: 'Wartet auf Onboarding', cls: 'bg-yellow-50 text-yellow-700' }
                  : { label: 'Aktiv', cls: 'bg-emerald-50 text-emerald-700' }
                return (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900">{name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{s.paket}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {s.paket_faelle_genutzt ?? 0} / {s.max_faelle_monat}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {s.werbebudget_guthaben_netto != null
                        ? s.werbebudget_guthaben_netto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-gray-400 mt-3 text-center">
        Edit-Aktionen (Mitglied einladen / sperren) folgen im Folge-Auftrag.
        Aktuell werden Mitglieder vom Admin im /admin/sachverstaendige-Bereich verwaltet.
      </p>
    </div>
  )
}
