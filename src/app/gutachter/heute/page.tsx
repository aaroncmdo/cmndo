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
  // AAR-607 B4: Pre-FlowLink-Termine haben nur lead_id (Fall kommt erst nach
  // SA-Unterschrift). fall_id kann leer sein — UI soll dann lead-basierte Daten
  // zeigen und den Termin als „Provisorisch (SA ausstehend)" markieren.
  fall_id: string
  lead_id: string | null
  pre_flowlink: boolean
  start_zeit: string
  end_zeit: string | null
  status: string
  // Kunden-Infos
  kunde_name: string
  kunde_telefon: string | null
  // Fall-Infos (evtl. leer bei pre_flowlink=true)
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
  // AAR-724: Noch nicht vom SV angesehen → roter Punkt auf der Card.
  gesehen_am: string | null
  // Feldmodus-Sprint: erweiterte Kunden-/Termin-Felder für TagesrouteSidebar
  kunde_anrede?: string | null
  kunde_avatar_url?: string | null
  stop_weather?: { description: string; emoji: string; temp: number } | null
  auftrag_typ?: string | null
  hat_vorschaeden?: boolean
  vorschaden_anzahl?: number | null
  vorschaden_letzter_datum?: string | null
  einzusammelnde_dokumente: string[]
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
  // AAR-607 B4: lead_id mitladen — Pre-FlowLink-Termine haben nur lead_id (kein
  // fall_id), sonst sieht der SV den Termin bis zur SA-Unterschrift nicht.
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, lead_id, start_zeit, end_zeit, status, gesehen_am')
    .eq('sv_id', sv.id)
    .in('status', [
      'reserviert',
      'bestaetigt',
      'vorschlag',
      'abgeschlossen',
      // AAR-864: Verlegungs-Slots auch in Tagesansicht zeigen
      'verlegung_pending',
      'verlegt',
    ])
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

  // Lead-Daten nachladen — sowohl für Fall-gebundene als auch für Pre-FlowLink-Termine.
  // AAR-607 B4: Lead-only-Termine haben keinen Fall → Lead muss volle Fahrzeug-,
  // Schadens-, Besichtigungsort-Infos liefern.
  const leadIdsFromFaelle = [...fallMap.values()]
    .map((f) => f.lead_id)
    .filter(Boolean) as string[]
  const leadIdsFromTermine = (termine ?? [])
    .filter((t) => !t.fall_id && t.lead_id)
    .map((t) => t.lead_id as string)
  const leadIds = Array.from(new Set([...leadIdsFromFaelle, ...leadIdsFromTermine]))
  const leadMap = new Map<string, Record<string, unknown>>()
  if (leadIds.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, vorname, nachname, telefon, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadens_fall_typ, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng, schadens_adresse, schadens_plz, schadens_ort')
      .in('id', leadIds)
    for (const l of (leads ?? []) as unknown as Record<string, unknown>[]) {
      leadMap.set(l.id as string, l)
    }
  }

  const heuteTermine: HeuteTerminFull[] = (termine ?? []).map((t) => {
    const fall = fallMap.get(t.fall_id as string)
    const leadIdResolved = (fall?.lead_id as string | null) ?? (t.lead_id as string | null) ?? null
    const lead = leadIdResolved ? leadMap.get(leadIdResolved) : null
    const preFlowlink = !fall && !!t.lead_id
    // Besichtigungsort/Fahrzeug: Fall bevorzugt, sonst aus Lead (pre-flowlink)
    const besichtigungAdresse =
      (fall?.besichtigungsort_adresse as string) ?? (lead?.besichtigungsort_adresse as string) ?? null
    const besichtigungPlaceId =
      (fall?.besichtigungsort_place_id as string) ?? (lead?.besichtigungsort_place_id as string) ?? null
    const besichtigungLat =
      (fall?.besichtigungsort_lat as number | null) ?? (lead?.besichtigungsort_lat as number | null) ?? null
    const besichtigungLng =
      (fall?.besichtigungsort_lng as number | null) ?? (lead?.besichtigungsort_lng as number | null) ?? null
    return {
      id: t.id as string,
      fall_id: (t.fall_id ?? '') as string,
      lead_id: (t.lead_id as string | null) ?? null,
      pre_flowlink: preFlowlink,
      start_zeit: t.start_zeit as string,
      end_zeit: (t.end_zeit as string) ?? null,
      status: t.status as string,
      kunde_name: lead
        ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
        : '—',
      kunde_telefon: (lead?.telefon as string | null) ?? null,
      fall_nummer:
        (fall?.fall_nummer as string) ??
        (preFlowlink ? 'Provisorisch' : ((t.fall_id as string) ?? '').slice(0, 8)),
      kennzeichen: (fall?.kennzeichen as string) ?? (lead?.kennzeichen as string) ?? null,
      fahrzeug:
        [
          fall?.fahrzeug_hersteller ?? lead?.fahrzeug_hersteller,
          fall?.fahrzeug_modell ?? lead?.fahrzeug_modell,
        ]
          .filter(Boolean)
          .join(' ') || null,
      schadentyp: (fall?.szenario as string) ?? (lead?.schadens_fall_typ as string) ?? null,
      besichtigungsort_adresse: besichtigungAdresse,
      besichtigungsort_place_id: besichtigungPlaceId,
      besichtigungsort_lat: besichtigungLat != null ? Number(besichtigungLat) : null,
      besichtigungsort_lng: besichtigungLng != null ? Number(besichtigungLng) : null,
      schadens_adresse: (fall?.schadens_adresse as string) ?? (lead?.schadens_adresse as string) ?? null,
      schadens_plz: (fall?.schadens_plz as string) ?? (lead?.schadens_plz as string) ?? null,
      schadens_ort: (fall?.schadens_ort as string) ?? (lead?.schadens_ort as string) ?? null,
      sv_briefing_text: (fall?.sv_briefing_text as string) ?? null,
      gesehen_am: (t.gesehen_am as string | null) ?? null,
      einzusammelnde_dokumente: [],
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
