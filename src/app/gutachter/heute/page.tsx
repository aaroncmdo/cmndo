// AAR-381: Heute-Tab als vertikaler Tageskalender.
// Ersetzt den alten HeuteRouteClient (Map+GPS+Ankommen-Modal) — diese
// Live-Features ziehen in den Fokus-Modus (AAR-382). Hier: reine Planungs-
// Ansicht + Einstieg.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import HeuteClient from './HeuteClient'
import type { TagesroutePflichtStat } from './TagesrouteSidebar'

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
  // 2026-05-06: Profilbild für Termin-Card-Polish
  kunde_avatar_url: string | null
  // 2026-05-06: Stop-Wetter für Termin-Card (Open-Weather-Map)
  stop_weather: { temp: number; emoji: string; description: string } | null
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
  // Auftrag-Kontext (CMM-32f) für Vor-Ort-Vorbereitung
  auftrag_typ: string | null
  einzusammelnde_dokumente: Array<{ slot_id: string; label: string }>
  hat_vorschaeden: boolean | null
  vorschaden_anzahl: number | null
  vorschaden_letzter_datum: string | null
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
        'id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, szenario, lead_id, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng, schadens_adresse, schadens_plz, schadens_ort, sv_briefing_text, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum',
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
      .select('id, vorname, nachname, telefon, kunde_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadens_fall_typ, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng, schadens_adresse, schadens_plz, schadens_ort')
      .in('id', leadIds)
    for (const l of (leads ?? []) as unknown as Record<string, unknown>[]) {
      leadMap.set(l.id as string, l)
    }
  }

  // 2026-05-06: Kunden-Avatare laden (lead.kunde_id → profiles.avatar_url)
  const kundeIds = Array.from(
    new Set(
      [...leadMap.values()]
        .map((l) => l.kunde_id as string | null)
        .filter((x): x is string => !!x),
    ),
  )
  const avatarMap = new Map<string, string | null>()
  if (kundeIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', kundeIds)
    for (const p of (profiles ?? []) as Array<{ id: string; avatar_url: string | null }>) {
      avatarMap.set(p.id, p.avatar_url ?? null)
    }
  }

  // 2026-05-06: Wetter pro besichtigungsort. Parallel-Fetch über alle
  // Termine mit gültigen Koordinaten. Cache lebt im Lib-Modul (5 min TTL),
  // doppelte Coords kollidieren auf den Cache-Key.
  const { getWeatherSnapshot, weatherEmoji } = await import('@/lib/weather/get-weather')
  const weatherEntries = await Promise.all(
    (termine ?? []).map(async (t) => {
      const fall = t.fall_id ? fallMap.get(t.fall_id as string) : null
      const lead = t.lead_id ? leadMap.get(t.lead_id as string) : null
      const lat =
        (fall?.besichtigungsort_lat as number | null) ??
        (lead?.besichtigungsort_lat as number | null) ??
        null
      const lng =
        (fall?.besichtigungsort_lng as number | null) ??
        (lead?.besichtigungsort_lng as number | null) ??
        null
      if (lat == null || lng == null) return [t.id as string, null] as const
      const snap = await getWeatherSnapshot(Number(lat), Number(lng))
      if (!snap) return [t.id as string, null] as const
      return [
        t.id as string,
        {
          temp: snap.temp,
          emoji: weatherEmoji(snap.weather_id),
          description: snap.description,
        },
      ] as const
    }),
  )
  const weatherMap = new Map<string, { temp: number; emoji: string; description: string } | null>(
    weatherEntries,
  )

  // Aufträge pro Fall (CMM-32f) — für Auftrag-Typ-Anzeige
  const auftragMap = new Map<string, { typ: string; status: string }>()
  if (fallIds.length) {
    const { data: auftraege } = await supabase
      .from('auftraege')
      .select('fall_id, typ, status, reihenfolge')
      .in('fall_id', fallIds)
      .eq('sv_id', sv.id)
      .order('reihenfolge', { ascending: false })
    for (const a of (auftraege ?? []) as Array<{ fall_id: string; typ: string; status: string }>) {
      if (!auftragMap.has(a.fall_id)) auftragMap.set(a.fall_id, { typ: a.typ, status: a.status })
    }
  }

  // Pflichtdokumente pro Fall (offen + Pflicht) mit Katalog-Labels —
  // damit der SV vor Ort sieht was er einsammeln muss.
  const pflichtListMap = new Map<string, Array<{ slot_id: string; label: string }>>()
  if (fallIds.length) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const [{ data: pflichtRows }, { data: katalogRows }] = await Promise.all([
      admin
        .from('pflichtdokumente')
        .select('fall_id, dokument_typ, status, pflicht')
        .in('fall_id', fallIds)
        .eq('pflicht', true),
      admin
        .from('dokument_katalog')
        .select('slot_id, label'),
    ])
    const labelMap = new Map<string, string>()
    for (const k of (katalogRows ?? []) as Array<{ slot_id: string; label: string }>) {
      labelMap.set(k.slot_id, k.label)
    }
    for (const p of (pflichtRows ?? []) as Array<{
      fall_id: string
      dokument_typ: string
      status: string
      pflicht: boolean
    }>) {
      if (p.status === 'erfuellt' || p.status === 'geprueft') continue
      if (!pflichtListMap.has(p.fall_id)) pflichtListMap.set(p.fall_id, [])
      pflichtListMap.get(p.fall_id)!.push({
        slot_id: p.dokument_typ,
        label: labelMap.get(p.dokument_typ) ?? p.dokument_typ,
      })
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
      kunde_avatar_url: lead?.kunde_id
        ? avatarMap.get(lead.kunde_id as string) ?? null
        : null,
      stop_weather: weatherMap.get(t.id as string) ?? null,
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
      auftrag_typ: auftragMap.get((t.fall_id ?? '') as string)?.typ ?? null,
      einzusammelnde_dokumente:
        pflichtListMap.get((t.fall_id ?? '') as string) ?? [],
      hat_vorschaeden: (fall?.hat_vorschaeden as boolean | null) ?? null,
      vorschaden_anzahl: (fall?.vorschaden_anzahl as number | null) ?? null,
      vorschaden_letzter_datum:
        (fall?.vorschaden_letzter_datum as string | null) ?? null,
    }
  })

  // Pflichtdokumente-Counts pro Fall parallel laden — damit die Sidebar
  // pro Termin „X von Y offen" anzeigen kann. Pre-FlowLink-Termine ohne
  // fall_id werden übersprungen.
  const fallIdsForPflicht = Array.from(
    new Set(heuteTermine.map((t) => t.fall_id).filter((x): x is string => !!x)),
  )
  const pflichtStats: TagesroutePflichtStat[] = await Promise.all(
    fallIdsForPflicht.map(async (fallId) => {
      try {
        const slots = await getPflichtdokumenteForFall(supabase, fallId, 'sv')
        const pflichtSlots = slots.filter((s) => s.pflicht)
        const offen = pflichtSlots.filter((s) => s.status === 'offen').length
        return { fallId, offen, gesamt: pflichtSlots.length }
      } catch {
        return { fallId, offen: 0, gesamt: 0 }
      }
    }),
  )

  return (
    <HeuteClient
      termine={heuteTermine}
      pflichtStats={pflichtStats}
      svStandort={{
        lat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
        lng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
      }}
      hasActiveSession={hasActiveSession}
    />
  )
}
