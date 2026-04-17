// AAR-381: Heute-Tab als vertikaler Tageskalender.
// Ersetzt den alten HeuteRouteClient (Map+GPS+Ankommen-Modal) — diese
// Live-Features ziehen in den Fokus-Modus (AAR-382). Hier: reine Planungs-
// Ansicht + Einstieg.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import HeuteClient from './HeuteClient'

export const dynamic = 'force-dynamic'

export type HeuteTerminFull = {
  id: string
  fall_id: string
  start_zeit: string
  end_zeit: string | null
  status: string
  // Kunden-Infos
  kunde_name: string
  kunde_telefon: string | null
  // Fall-Infos
  fall_nummer: string
  kennzeichen: string | null
  fahrzeug: string | null
  schadentyp: string | null
  // Adresse (Primär: besichtigungsort_*, Fallback: schadens_*)
  besichtigungsort_adresse: string | null
  besichtigungsort_place_id: string | null
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
  schadens_adresse: string | null
  schadens_plz: string | null
  schadens_ort: string | null
  // AAR-377 Kurz-Briefing (2 Zeilen in TerminCard)
  sv_briefing_text: string | null
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function HeutePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    standort_lat: number | null
    standort_lng: number | null
  }>(supabase, user.id, 'id, standort_lat, standort_lng')
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  // Aktive Session für heute (AAR-380)
  const { data: session } = await supabase
    .from('sv_tages_session')
    .select('id, status')
    .eq('sv_id', sv.id)
    .eq('datum', isoDate(todayStart))
    .maybeSingle()

  const hasActiveSession = Boolean(
    session && session.status !== 'idle' && session.status !== 'finished',
  )

  // Heutige Termine
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, end_zeit, status')
    .eq('sv_id', sv.id)
    .in('status', ['reserviert', 'bestaetigt', 'vorschlag', 'abgeschlossen'])
    .gte('start_zeit', todayStart.toISOString())
    .lt('start_zeit', tomorrowStart.toISOString())
    .order('start_zeit', { ascending: true })

  // Fall-Daten nachladen
  const fallIds = (termine ?? [])
    .map((t) => t.fall_id)
    .filter(Boolean) as string[]
  const fallMap = new Map<string, Record<string, unknown>>()
  if (fallIds.length) {
    const { data: faelle } = await supabase
      .from('faelle')
      .select(
        'id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, szenario, lead_id, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng, schadens_adresse, schadens_plz, schadens_ort, sv_briefing_text',
      )
      .in('id', fallIds)
    const faelleRows = (faelle ?? []) as unknown as Record<string, unknown>[]
    for (const f of faelleRows) fallMap.set(f.id as string, f)
  }

  // Lead-Namen nachladen
  const leadIds = [...fallMap.values()]
    .map((f) => f.lead_id)
    .filter(Boolean) as string[]
  const leadMap = new Map<
    string,
    { vorname: string | null; nachname: string | null; telefon: string | null }
  >()
  if (leadIds.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, vorname, nachname, telefon')
      .in('id', leadIds)
    for (const l of leads ?? []) leadMap.set(l.id, l)
  }

  const heuteTermine: HeuteTerminFull[] = (termine ?? []).map((t) => {
    const fall = fallMap.get(t.fall_id as string)
    const lead = fall?.lead_id
      ? leadMap.get(fall.lead_id as string)
      : null
    return {
      id: t.id as string,
      fall_id: (t.fall_id ?? '') as string,
      start_zeit: t.start_zeit as string,
      end_zeit: (t.end_zeit as string) ?? null,
      status: t.status as string,
      kunde_name: lead
        ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
        : '—',
      kunde_telefon: lead?.telefon ?? null,
      fall_nummer:
        (fall?.fall_nummer as string) ??
        ((t.fall_id as string) ?? '').slice(0, 8),
      kennzeichen: (fall?.kennzeichen as string) ?? null,
      fahrzeug:
        [fall?.fahrzeug_hersteller, fall?.fahrzeug_modell]
          .filter(Boolean)
          .join(' ') || null,
      schadentyp: (fall?.szenario as string) ?? null,
      besichtigungsort_adresse:
        (fall?.besichtigungsort_adresse as string) ?? null,
      besichtigungsort_place_id:
        (fall?.besichtigungsort_place_id as string) ?? null,
      besichtigungsort_lat:
        fall?.besichtigungsort_lat != null
          ? Number(fall.besichtigungsort_lat)
          : null,
      besichtigungsort_lng:
        fall?.besichtigungsort_lng != null
          ? Number(fall.besichtigungsort_lng)
          : null,
      schadens_adresse: (fall?.schadens_adresse as string) ?? null,
      schadens_plz: (fall?.schadens_plz as string) ?? null,
      schadens_ort: (fall?.schadens_ort as string) ?? null,
      sv_briefing_text: (fall?.sv_briefing_text as string) ?? null,
    }
  })

  return (
    <HeuteClient
      termine={heuteTermine}
      svStandort={{
        lat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
        lng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
      }}
      hasActiveSession={hasActiveSession}
    />
  )
}
