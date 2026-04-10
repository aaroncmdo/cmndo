import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import HeuteRouteClient from './HeuteRouteClient'

// KFZ-158 Phase 1: Tagesroute — zeigt alle Termine des heutigen Tages
// als optimierte Route auf einer Vollbild-Karte.

export const dynamic = 'force-dynamic'

export type HeuteTermin = {
  id: string
  fall_id: string
  fall_nummer: string
  start_zeit: string
  end_zeit: string
  status: string
  kunde_name: string
  kunde_telefon: string | null
  schadens_adresse: string | null
  schadens_plz: string | null
  schadens_ort: string | null
  kennzeichen: string | null
  fahrzeug: string | null
  szenario: string | null
}

export default async function HeutePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string; standort_lat: number | null; standort_lng: number | null }>(
    supabase, user.id, 'id, standort_lat, standort_lng',
  )
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  // Termine heute + morgen laden (gutachter_termine + faelle Join)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowEnd = new Date(todayStart)
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 2)

  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, end_zeit, status')
    .eq('sv_id', sv.id)
    .in('status', ['reserviert', 'bestaetigt', 'vorschlag'])
    .gte('start_zeit', todayStart.toISOString())
    .lt('start_zeit', tomorrowEnd.toISOString())
    .order('start_zeit', { ascending: true })

  // Fall-Daten nachladen
  const fallIds = (termine ?? []).map(t => t.fall_id).filter(Boolean) as string[]
  const fallMap = new Map<string, Record<string, unknown>>()
  if (fallIds.length) {
    const { data: faelle } = await supabase
      .from('faelle')
      .select('id, fall_nummer, schadens_adresse, schadens_plz, schadens_ort, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, szenario, lead_id')
      .in('id', fallIds)
    for (const f of faelle ?? []) fallMap.set(f.id as string, f)
  }

  // Lead-Namen nachladen
  const leadIds = [...fallMap.values()].map(f => f.lead_id).filter(Boolean) as string[]
  const leadMap = new Map<string, { vorname: string | null; nachname: string | null; telefon: string | null }>()
  if (leadIds.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, vorname, nachname, telefon')
      .in('id', leadIds)
    for (const l of leads ?? []) leadMap.set(l.id, l)
  }

  const heuteTermine: HeuteTermin[] = (termine ?? []).map(t => {
    const fall = fallMap.get(t.fall_id as string)
    const lead = fall?.lead_id ? leadMap.get(fall.lead_id as string) : null
    return {
      id: t.id as string,
      fall_id: (t.fall_id ?? '') as string,
      fall_nummer: (fall?.fall_nummer as string) ?? (t.fall_id as string).slice(0, 8),
      start_zeit: t.start_zeit as string,
      end_zeit: t.end_zeit as string,
      status: t.status as string,
      kunde_name: lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—' : '—',
      kunde_telefon: lead?.telefon ?? null,
      schadens_adresse: (fall?.schadens_adresse as string) ?? null,
      schadens_plz: (fall?.schadens_plz as string) ?? null,
      schadens_ort: (fall?.schadens_ort as string) ?? null,
      kennzeichen: (fall?.kennzeichen as string) ?? null,
      fahrzeug: [fall?.fahrzeug_hersteller, fall?.fahrzeug_modell].filter(Boolean).join(' ') || null,
      szenario: (fall?.szenario as string) ?? null,
    }
  })

  return (
    <HeuteRouteClient
      termine={heuteTermine}
      svLat={sv.standort_lat ? Number(sv.standort_lat) : null}
      svLng={sv.standort_lng ? Number(sv.standort_lng) : null}
    />
  )
}
