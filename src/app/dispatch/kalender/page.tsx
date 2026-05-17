// AAR-CMM: Dispatch-Kalender — Multi-SV-Wochenansicht
// Lädt aktive SVs + gutachter_termine ±1 Woche um den ausgewählten Tag.
// Dispatcher filtert Sichtbarkeit per Multi-Select (URL-Query svs=a,b,c).

import { createClient } from '@/lib/supabase/server'
import KalenderClient, { type KalenderSv, type KalenderTermin } from './KalenderClient'

export const dynamic = 'force-dynamic'

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay() // 0=So..6=Sa
  const diff = day === 0 ? -6 : 1 - day // → Mo
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

export default async function DispatchKalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ woche?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()

  // Wochen-Anker: ?woche=YYYY-MM-DD (Mo der Zielwoche). Default = aktuelle Woche.
  const anchor = sp.woche ? new Date(sp.woche) : new Date()
  const weekStart = startOfWeek(anchor)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  // Aktive SVs (dispatchable-Filter analog applyDispatchableFilter)
  const { data: svRows } = await supabase
    .from('sachverstaendige')
    .select(
      'id, profile_id, standort_adresse, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)',
    )
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true)
    .is('gesperrt_seit', null)
    .is('geloescht_am', null)
    .order('created_at', { ascending: true })

  const svList: KalenderSv[] = ((svRows ?? []) as unknown as Array<{
    id: string
    profile_id: string
    standort_adresse: string | null
    profiles: { vorname: string | null; nachname: string | null } | Array<{ vorname: string | null; nachname: string | null }> | null
  }>).map((sv) => {
    const profileRaw = sv.profiles
    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) ?? null
    const name = profile
      ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() || 'Unbenannt'
      : 'Unbenannt'
    return { id: sv.id, name, standort: sv.standort_adresse ?? null }
  })

  // Termine der Wochenspanne — alle Status außer storniert/abgelehnt
  const { data: terminRows } = await supabase
    .from('gutachter_termine')
    .select(
      'id, sv_id, lead_id, fall_id, start_zeit, end_zeit, status, typ, notiz_intern, ' +
        'leads(vorname, nachname, kennzeichen), faelle(claims:claim_id(claim_nummer), kennzeichen)',
    )
    .gte('start_zeit', weekStart.toISOString())
    .lt('start_zeit', weekEnd.toISOString())
    .not('status', 'in', '("storniert","abgelehnt")')
    .order('start_zeit', { ascending: true })

  type ClaimNrJoin = { claim_nummer: string | null } | Array<{ claim_nummer: string | null }> | null
  const termine: KalenderTermin[] = ((terminRows ?? []) as unknown as Array<{
    id: string
    sv_id: string | null
    lead_id: string | null
    fall_id: string | null
    start_zeit: string
    end_zeit: string
    status: string | null
    typ: string
    notiz_intern: string | null
    leads: { vorname: string | null; nachname: string | null; kennzeichen: string | null } | Array<{ vorname: string | null; nachname: string | null; kennzeichen: string | null }> | null
    faelle: { claims: ClaimNrJoin; kennzeichen: string | null } | Array<{ claims: ClaimNrJoin; kennzeichen: string | null }> | null
  }>).map((t) => {
    const leadRaw = t.leads
    const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) ?? null
    const fallRaw = t.faelle
    const fall = (Array.isArray(fallRaw) ? fallRaw[0] : fallRaw) ?? null
    const claim = (Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims) ?? null
    const kundeName = lead
      ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim()
      : ''
    return {
      id: t.id,
      svId: t.sv_id,
      leadId: t.lead_id,
      fallId: t.fall_id,
      startZeit: t.start_zeit,
      endZeit: t.end_zeit,
      status: t.status,
      typ: t.typ,
      kundeName: kundeName || null,
      kennzeichen: lead?.kennzeichen ?? fall?.kennzeichen ?? null,
      fallNummer: claim?.claim_nummer ?? null,
    }
  })

  return (
    <KalenderClient
      svList={svList}
      termine={termine}
      weekStartIso={weekStart.toISOString()}
    />
  )
}
