'use server'

// AAR-CMM Stufe 2+3: Spontane Disposition aus dem Dispatch-Kalender.
// Erstellt minimalen Lead, reserviert Termin beim gewählten SV, sendet
// optional FlowLink an den Kunden. Service-Typ default 'nur_gutachter' —
// Aaron-Vorgabe: Spontandisposition läuft nicht über Komplettservice.
//
// Stufe 3: listSvsByDistance — sortiert SVs nach Haversine-Distanz zum
// Besichtigungsort + markiert Busy-Slots aus gutachter_termine.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { reserveSvTerminForLead } from '@/app/dispatch/leads/[id]/_actions/sv-termin'
import { sendFlowLinkMultiChannel } from '@/app/dispatch/leads/[id]/_actions/flowlink'
import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'
import { checkSvReachability } from '@/lib/dispatch/reachability'

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// mapboxEtaMatrix lebt jetzt in @/lib/mapbox/matrix — wird auch von
// findBestSV genutzt.

export type SpontanInput = {
  vorname: string
  nachname: string
  telefon: string
  email: string | null
  besichtigungsortAdresse: string
  besichtigungsortLat: number | null
  besichtigungsortLng: number | null
  svId: string
  startIso: string
  durationMin: number
  flowlinkKanal: 'whatsapp' | 'sms' | 'email' | 'kein'
}

export async function createSpontanTermin(
  input: SpontanInput,
): Promise<{ ok: boolean; leadId?: string; terminId?: string; flowlinkSent?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  if (!input.vorname.trim() || !input.nachname.trim()) {
    return { ok: false, error: 'Vor- und Nachname sind Pflicht' }
  }
  if (!input.telefon.trim()) return { ok: false, error: 'Telefonnummer ist Pflicht' }
  if (!input.svId) return { ok: false, error: 'Sachverständiger fehlt' }
  if (!input.startIso) return { ok: false, error: 'Startzeit fehlt' }

  // 1. Minimal-Lead anlegen
  const { data: leadRow, error: leadErr } = await supabase
    .from('leads')
    .insert({
      vorname: input.vorname.trim(),
      nachname: input.nachname.trim(),
      telefon: input.telefon.trim(),
      email: input.email?.trim() || null,
      besichtigungsort_adresse: input.besichtigungsortAdresse.trim() || null,
      besichtigungsort_lat: input.besichtigungsortLat,
      besichtigungsort_lng: input.besichtigungsortLng,
      service_typ: 'nur_gutachter',
      status: 'qualifizierung',
      source_channel: 'dispatch_spontan',
      zugewiesen_an: user.id,
    })
    .select('id')
    .single()

  if (leadErr || !leadRow) {
    return { ok: false, error: leadErr?.message ?? 'Lead-Anlage fehlgeschlagen' }
  }
  const leadId = leadRow.id as string

  // 2. Termin reservieren (nutzt bestehende Action mit Konfliktcheck +
  //    Baseline-Fahrtzeit + In-App-Mitteilung an SV)
  const reserve = await reserveSvTerminForLead(leadId, input.svId, input.startIso, input.durationMin)
  if (!reserve.success) {
    // Lead nicht löschen — Dispatcher kann mit anderem SV nochmal versuchen.
    return { ok: false, leadId, error: reserve.error ?? 'Termin-Reservierung fehlgeschlagen' }
  }

  // 3. FlowLink optional senden (Onboarding-Link an Kunden)
  let flowlinkSent = false
  if (input.flowlinkKanal !== 'kein') {
    const flow = await sendFlowLinkMultiChannel(leadId, input.flowlinkKanal)
    flowlinkSent = !!flow.success
  }

  revalidatePath('/dispatch/kalender')
  revalidatePath('/dispatch/leads')
  return { ok: true, leadId, terminId: reserve.terminId, flowlinkSent }
}

// ─── Stufe 3: SV-Vorschläge nach Distanz zum Besichtigungsort ──────────────

export type SvDistanceVorschlag = {
  svId: string
  name: string
  standort: string | null
  distanzKm: number
  etaMinuten: number | null
  belegt: boolean
  /** AAR-CMM: SV ist im Slot frei, kann ihn aber wegen Vor-/Nachtermin nicht erreichen. */
  unerreichbar: boolean
  unerreichbarGrund: string | null
  paketUmkreisKm: number
}

export async function listSvsByDistance(
  besichtigungsortLat: number,
  besichtigungsortLng: number,
  startIso: string,
  durationMin: number,
): Promise<{ ok: boolean; vorschlaege?: SvDistanceVorschlag[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: svRows } = await supabase
    .from('sachverstaendige')
    .select(
      'id, standort_adresse, standort_lat, standort_lng, paket_umkreis_km, ' +
        'profiles!sachverstaendige_profile_id_fkey(vorname, nachname)',
    )
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true)
    .is('gesperrt_seit', null)
    .is('geloescht_am', null)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)

  if (!svRows || svRows.length === 0) return { ok: true, vorschlaege: [] }

  // Termin-Konflikte für den geplanten Slot (alle SVs in einem Query)
  const startDate = new Date(startIso)
  if (Number.isNaN(startDate.getTime())) return { ok: false, error: 'Ungültige Startzeit' }
  const endDate = new Date(startDate.getTime() + durationMin * 60_000)

  const { data: konflikte } = await supabase
    .from('gutachter_termine')
    .select('sv_id')
    .not('status', 'in', '("storniert","abgelehnt","abgesagt","no_show")')
    .lt('start_zeit', endDate.toISOString())
    .gt('end_zeit', startDate.toISOString())

  const blockierteSvs = new Set((konflikte ?? []).map((k) => k.sv_id as string))

  const svParsed = (svRows as unknown as Array<{
    id: string
    standort_adresse: string | null
    standort_lat: number
    standort_lng: number
    paket_umkreis_km: number | null
    profiles: { vorname: string | null; nachname: string | null } | Array<{ vorname: string | null; nachname: string | null }> | null
  }>).map((sv) => {
    const profileRaw = sv.profiles
    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) ?? null
    const name = profile
      ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() || 'Unbenannt'
      : 'Unbenannt'
    return {
      svId: sv.id,
      name,
      standort: sv.standort_adresse ?? null,
      lat: sv.standort_lat,
      lng: sv.standort_lng,
      paketUmkreisKm: Number(sv.paket_umkreis_km) || 40,
    }
  })

  // Mapbox-Matrix für echte Fahrtzeit (vom SV-Standort → Besichtigungsort).
  // Origin = Besichtigungsort, Destinations = SV-Standorte (Mapbox-Matrix
  // mit sources=0 liefert Origin→Destination — die Fahrtzeit ist symmetrisch
  // genug für ETA-Anzeige; bei Einbahnstraßen-Sonderfällen leichte Abweichung
  // akzeptabel).
  const etas = await mapboxEtaMatrix(
    { lat: besichtigungsortLat, lng: besichtigungsortLng },
    svParsed.map((sv) => ({ lat: sv.lat, lng: sv.lng })),
  )

  // Reachability-Check parallel für alle SVs die im Slot nicht direkt belegt
  // sind. Belegte SVs überspringen wir (Konflikt steht ohnehin schon).
  const reachChecks = await Promise.all(
    svParsed.map(async (sv) => {
      if (blockierteSvs.has(sv.svId)) return { reachable: true, grund: undefined }
      return checkSvReachability(supabase, {
        svId: sv.svId,
        candidateLat: besichtigungsortLat,
        candidateLng: besichtigungsortLng,
        candidateStartIso: startDate.toISOString(),
        candidateEndIso: endDate.toISOString(),
      })
    }),
  )

  const list: SvDistanceVorschlag[] = svParsed.map((sv, i) => ({
    svId: sv.svId,
    name: sv.name,
    standort: sv.standort,
    distanzKm: haversine(sv.lat, sv.lng, besichtigungsortLat, besichtigungsortLng),
    etaMinuten: etas[i],
    belegt: blockierteSvs.has(sv.svId),
    unerreichbar: !reachChecks[i].reachable,
    unerreichbarGrund: reachChecks[i].grund ?? null,
    paketUmkreisKm: sv.paketUmkreisKm,
  }))

  // Primär nach ETA sortieren (wenn vorhanden), Fallback Distanz.
  list.sort((a, b) => {
    if (a.etaMinuten != null && b.etaMinuten != null) return a.etaMinuten - b.etaMinuten
    if (a.etaMinuten != null) return -1
    if (b.etaMinuten != null) return 1
    return a.distanzKm - b.distanzKm
  })
  return { ok: true, vorschlaege: list }
}
