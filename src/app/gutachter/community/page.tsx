import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import { TrophyIcon, UsersIcon } from 'lucide-react'

// KFZ-152 Phase 3: Community-Dashboard fuer Mitglieder.
// Zeigt das aktuelle Monats-Leaderboard mit Rang, Faelle, Umsatz, Avg-Dauer.
// Eigener Eintrag wird hervorgehoben.

export const dynamic = 'force-dynamic'

type LeaderboardRow = {
  sv_id: string
  rang: number | null
  faelle_count: number
  umsatz_netto: number
  durchschnitt_bearbeitungsdauer_h: number | null
  vorname: string | null
  nachname: string | null
}

export default async function CommunityDashboardPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    organisation_id: string | null
    rolle_in_organisation: string | null
  }>(supabase, user.id, 'id, organisation_id, rolle_in_organisation')

  if (!sv?.organisation_id || sv.rolle_in_organisation !== 'community_member') {
    redirect('/gutachter?error=Du+bist+kein+Community-Mitglied')
  }

  // Org-Stammdaten
  const { data: org } = await supabase
    .from('organisationen')
    .select('id, name, community_max_faelle_monat, community_leaderboard_aktiv')
    .eq('id', sv.organisation_id)
    .maybeSingle()

  if (!org) {
    return (
      <div className="px-8 py-8 text-center">
        <p className="text-sm text-claimondo-ondo">Community nicht gefunden.</p>
      </div>
    )
  }

  // Aktuelles Leaderboard
  const now = new Date()
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()

  const { data: lbRows } = await supabase
    .from('community_leaderboard')
    .select('sv_id, rang, faelle_count, umsatz_netto, durchschnitt_bearbeitungsdauer_h')
    .eq('organisation_id', sv.organisation_id)
    .eq('zeitraum_monat', monat)
    .eq('zeitraum_jahr', jahr)
    .order('rang', { ascending: true })

  // Profile-Lookup + Anonym-Flag pro SV
  const svIds = (lbRows ?? []).map(r => r.sv_id)
  const profileMap = new Map<string, { vorname: string | null; nachname: string | null }>()
  const anonymMap = new Map<string, boolean>()
  if (svIds.length) {
    const { data: svRows } = await supabase
      .from('sachverstaendige')
      .select('id, profile_id, community_anonym')
      .in('id', svIds)
    const profileIds = (svRows ?? []).map(s => s.profile_id).filter(Boolean) as string[]
    const svToProfile = new Map<string, string>()
    for (const s of svRows ?? []) {
      if (s.profile_id) svToProfile.set(s.id, s.profile_id)
      anonymMap.set(s.id, !!s.community_anonym)
    }
    if (profileIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, vorname, nachname')
        .in('id', profileIds)
      for (const p of profs ?? []) {
        for (const [svId, pid] of svToProfile.entries()) {
          if (pid === p.id) profileMap.set(svId, { vorname: p.vorname, nachname: p.nachname })
        }
      }
    }
  }

  // KFZ-152 Phase 3 Follow-up: Privacy-Filter — andere Mitglieder mit
  // community_anonym=true werden anonymisiert. Eigener Eintrag bleibt sichtbar.
  const leaderboard: LeaderboardRow[] = (lbRows ?? []).map(r => {
    const isMe = r.sv_id === sv.id
    const isAnonym = !isMe && anonymMap.get(r.sv_id) === true
    return {
      sv_id: r.sv_id,
      rang: r.rang,
      faelle_count: r.faelle_count,
      umsatz_netto: Number(r.umsatz_netto ?? 0),
      durchschnitt_bearbeitungsdauer_h: r.durchschnitt_bearbeitungsdauer_h ? Number(r.durchschnitt_bearbeitungsdauer_h) : null,
      vorname: isAnonym ? null : (profileMap.get(r.sv_id)?.vorname ?? null),
      nachname: isAnonym ? null : (profileMap.get(r.sv_id)?.nachname ?? null),
    }
  })

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-claimondo-navy flex items-center gap-3">
            <UsersIcon className="w-6 h-6 text-[var(--brand-secondary)]" /> {org.name}
          </h1>
          <p className="text-sm text-claimondo-ondo mt-1">
            Community-Dashboard · {String(monat).padStart(2, '0')}/{jahr}
            {org.community_max_faelle_monat ? ` · max ${org.community_max_faelle_monat} Fälle/Monat` : ''}
          </p>
        </div>
      </div>

      <div className="bg-white border border-claimondo-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-claimondo-border bg-gradient-to-r from-amber-50 to-white">
          <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
            <TrophyIcon className="w-4 h-4 text-amber-500" /> Leaderboard {String(monat).padStart(2, '0')}/{jahr}
          </h2>
        </div>
        {leaderboard.length === 0 ? (
          <div className="p-12 text-center text-sm text-claimondo-ondo">
            Noch keine Daten für diesen Monat. Das Leaderboard wird täglich um 04:00 aktualisiert.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f8f9fb] text-[10px] uppercase tracking-wide text-claimondo-ondo">
              <tr>
                <th className="text-left px-4 py-3 w-16">Rang</th>
                <th className="text-left px-4 py-3">Mitglied</th>
                <th className="text-right px-4 py-3">Fälle</th>
                <th className="text-right px-4 py-3">Umsatz netto</th>
                <th className="text-right px-4 py-3">⌀ Bearbeitung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-claimondo-border">
              {leaderboard.map(row => {
                const isMe = row.sv_id === sv.id
                const name = [row.vorname, row.nachname].filter(Boolean).join(' ') || 'Anonym'
                return (
                  <tr key={row.sv_id} className={isMe ? 'bg-[var(--brand-secondary)]/5 border-l-4 border-l-[var(--brand-secondary)]' : ''}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                        row.rang === 1 ? 'bg-amber-100 text-amber-700'
                        : row.rang === 2 ? 'bg-[#f8f9fb] text-claimondo-navy'
                        : row.rang === 3 ? 'bg-orange-100 text-orange-700'
                        : 'bg-[#f8f9fb] text-claimondo-ondo'
                      }`}>
                        {row.rang ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`text-sm ${isMe ? 'font-semibold text-[var(--brand-primary)]' : 'text-claimondo-navy'}`}>
                        {name}{isMe && <span className="ml-2 text-[10px] text-[var(--brand-secondary)]">(Du)</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-claimondo-navy">{row.faelle_count}</td>
                    <td className="px-4 py-3 text-right text-claimondo-navy">
                      {row.umsatz_netto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-right text-claimondo-navy text-xs">
                      {row.durchschnitt_bearbeitungsdauer_h != null ? `${row.durchschnitt_bearbeitungsdauer_h} h` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-claimondo-ondo/70 mt-3 text-center">
        Daten werden täglich um 04:00 aktualisiert. Privacy-Toggle (anonymisiert anzeigen) folgt im Profil-Tab.
      </p>
    </div>
  )
}
