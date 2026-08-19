// AAR-381: Heute-Tab als vertikaler Tageskalender.
// Ersetzt den alten HeuteRouteClient (Map+GPS+Ankommen-Modal) — diese
// Live-Features ziehen in den Fokus-Modus (AAR-382). Hier: reine Planungs-
// Ansicht + Einstieg.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { effektiveBezugIds, effektiveFallClaimId } from '@/lib/termine/effektive-bezug-ids'
import { bezugInExpr } from '@/lib/termine/bezug-filter'
import HeuteClient from './HeuteClient'
import type { TagesroutePflichtStat } from './TagesrouteSidebar'
import { listPrivatStopsForDate } from './private-stops-actions'
import { berlinDayRangeUtc } from '@/lib/time/berlin-day'

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
  kunde_anrede: 'herr' | 'frau' | 'divers' | null
  kunde_telefon: string | null
  // 2026-05-06: Profilbild für Termin-Card-Polish
  kunde_avatar_url: string | null
  // 2026-05-06: Stop-Wetter für Termin-Card (Open-Weather-Map)
  stop_weather: { temp: number; emoji: string; description: string } | null
  // Fall-Infos (evtl. leer bei pre_flowlink=true)
  claim_nummer: string
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
  // (kunde_anrede / kunde_avatar_url / stop_weather sind oben schon deklariert,
  // hier nur die fehlenden Feldmodus-Felder ergaenzen)
  auftrag_typ?: string | null
  hat_vorschaeden?: boolean
  vorschaden_anzahl?: number | null
  vorschaden_letzter_datum?: string | null
  einzusammelnde_dokumente: Array<{ slot_id: string; label: string }>
}

// 15.05.2026: `sachverstaendige.isochrone_polygon` ist JSONB ohne Schema-
// Constraint. In Prod existieren zwei Shapes (DB-Audit 15.05.):
//   Legacy:  Array<{lat,lng}>  (1 Row)
//   Aktuell: GeoJSON-Polygon { type, coordinates: [[[lng,lat], …]] }  (9 Rows)
// TagesrouteMap erwartet Array<{lat,lng}>; ohne Normalisierung crasht der
// useEffect mit "isochronePolygon.map is not a function" (React pageerror
// auf /gutachter/heute, gemessen im Mobile-Hygiene-Audit 15.05.).
function normalizeIsochrone(
  raw: unknown,
): Array<{ lat: number; lng: number }> | null {
  if (raw == null) return null
  if (Array.isArray(raw)) {
    return raw as Array<{ lat: number; lng: number }>
  }
  if (typeof raw === 'object' && 'coordinates' in (raw as Record<string, unknown>)) {
    const coords = (raw as { coordinates?: unknown }).coordinates
    if (Array.isArray(coords) && Array.isArray(coords[0])) {
      const ring = coords[0] as unknown[]
      const points = ring.filter(
        (p): p is [number, number] =>
          Array.isArray(p) && p.length >= 2 &&
          typeof p[0] === 'number' && typeof p[1] === 'number',
      )
      if (points.length >= 3) {
        return points.map(([lng, lat]) => ({ lat, lng }))
      }
    }
  }
  return null
}

export default async function HeutePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    standort_lat: number | null
    standort_lng: number | null
    // JSONB ohne Schema-Constraint — siehe normalizeIsochrone() oben.
    isochrone_polygon: unknown
  }>(supabase, user.id, 'id, standort_lat, standort_lng, isochrone_polygon')
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  // Tag-Grenze hart an Europe/Berlin (nicht Server-lokale TZ) — sonst driftet
  // „heute" auf UTC-Servern um den Offset (1-2h) rund um Mitternacht.
  // Siehe lib/time/berlin-day.ts.
  const { startUtc: todayStart, endUtc: tomorrowStart, isoDate: berlinHeute } =
    berlinDayRangeUtc()

  // Aktive Session für heute (AAR-380)
  const { data: session } = await supabase
    .from('sv_tages_session')
    .select('id, status')
    .eq('sv_id', sv.id)
    .eq('datum', berlinHeute)
    .maybeSingle()

  const hasActiveSession = Boolean(
    session && session.status !== 'idle' && session.status !== 'finished',
  )

  // Heutige Termine — KANONISCH via svTermine (gutachter_termine.assignee_id).
  // Identische Quelle wie der SV-Kalender (lib/termine/sv-termine.ts). Der Helper
  // liefert alle hier genutzten Spalten (fall_id/lead_id/bezug_typ/bezug_id/gesehen_am …).
  const { svTermine } = await import('@/lib/termine/sv-termine')
  const termine = await svTermine(supabase, sv.id, {
    statuses: [
      'reserviert',
      'bestaetigt',
      'vorschlag',
      'abgeschlossen',
      // AAR-864: Verlegungs-Slots auch in Tagesansicht zeigen
      'verlegung_pending',
      'verlegt',
    ],
    from: todayStart.toISOString(),
    to: tomorrowStart.toISOString(),
  })

  // Fall-Daten nachladen
  const fallIds = (termine ?? [])
    .map((t) => t.fall_id)
    .filter(Boolean) as string[]
  const fallMap = new Map<string, Record<string, unknown>>()
  if (fallIds.length) {
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
    // CMM-44 SP-B PR2a: szenario liegt ebenfalls auf claims (SSoT) — in den
    // claims-Embed aufgenommen.
    // CMM-44 SP-D PR2a: besichtigungsort_* aus gutachter_termine (aktueller Termin, SSoT).
    // CMM-44 SP-H PR2: sv_briefing_text aus dem faelle-Select entfernt — lebt auf
    // auftraege (aktueller Auftrag). Wird unten aus der bestehenden auftraege-Batch-
    // Abfrage (reihenfolge DESC) in fallMap gemergt.
    // CMM-49: faelle->v_claim_full (claim-anchored SSoT). Fahrzeug via vehicles,
    // schadenort_*/claim_nummer/szenario flach aus der View und zurueck in die
    // claims-Embed-Form gemappt, damit die fallMap-Consumer (fall.claims, claim_id)
    // unveraendert bleiben. id:fall_id + claim_id:id-Aliase erhalten Keys/Shapes.
    const { data: faelleFlat } = await supabase
      .from('v_claim_full')
      .select(
        'id:fall_id, claim_id:id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, schadenort_adresse, schadenort_plz, schadenort_ort, claim_nummer, szenario',
      )
      .in('fall_id', fallIds)
    const faelleRows = (faelleFlat ?? []).map((row) => {
      const x = row as Record<string, unknown>
      return {
        id: x.id,
        claim_id: x.claim_id,
        kennzeichen: x.kennzeichen,
        fahrzeug_hersteller: x.fahrzeug_hersteller,
        fahrzeug_modell: x.fahrzeug_modell,
        lead_id: x.lead_id,
        hat_vorschaeden: x.hat_vorschaeden,
        vorschaden_anzahl: x.vorschaden_anzahl,
        vorschaden_letzter_datum: x.vorschaden_letzter_datum,
        claims: {
          schadenort_adresse: x.schadenort_adresse,
          schadenort_plz: x.schadenort_plz,
          schadenort_ort: x.schadenort_ort,
          claim_nummer: x.claim_nummer,
          szenario: x.szenario,
        },
      }
    }) as unknown as Record<string, unknown>[]
    for (const f of faelleRows) fallMap.set(f.id as string, f)

    // Batch-Fetch besichtigungsort aus gutachter_termine (aktueller Termin pro claim).
    const heuteClaimIds = Array.from(
      new Set(faelleRows.map((f) => f.claim_id as string | null).filter(Boolean) as string[]),
    )
    if (heuteClaimIds.length) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()
      const { data: gtHeute } = await admin
        .from('gutachter_termine')
        // bezug_typ/bezug_id mitladen: der Filter unten findet bezug-native Termine
        // (claim_id NULL), und ohne diese Spalten liesse sich ihr Claim nicht bestimmen.
        .select('claim_id, bezug_typ, bezug_id, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng')
        .or(bezugInExpr('claim', heuteClaimIds))
        .order('start_zeit', { ascending: false })
      const gtHeuteMap = new Map<string, Record<string, unknown>>()
      for (const gt of (gtHeute ?? []) as Array<Record<string, unknown>>) {
        // NICHT gt.claim_id: bezug-native Zeilen haben dort NULL und wuerden hier
        // wieder verworfen — der Filter-Fix allein waere dann wirkungslos.
        const cId = effektiveFallClaimId(gt)
        if (cId && !gtHeuteMap.has(cId)) gtHeuteMap.set(cId, gt)
      }
      for (const [, f] of fallMap.entries()) {
        const cId = f.claim_id as string | null
        if (cId) {
          const gtEntry = gtHeuteMap.get(cId)
          if (gtEntry) {
            f.besichtigungsort_adresse = gtEntry.besichtigungsort_adresse
            f.besichtigungsort_place_id = gtEntry.besichtigungsort_place_id
            f.besichtigungsort_lat = gtEntry.besichtigungsort_lat
            f.besichtigungsort_lng = gtEntry.besichtigungsort_lng
          }
        }
      }
    }
  }

  // Lead-Daten nachladen — sowohl für Fall-gebundene als auch für Pre-FlowLink-Termine.
  // AAR-607 B4: Lead-only-Termine haben keinen Fall → Lead muss volle Fahrzeug-,
  // Schadens-, Besichtigungsort-Infos liefern.
  const leadIdsFromFaelle = [...fallMap.values()]
    .map((f) => f.lead_id)
    .filter(Boolean) as string[]
  // AAR-956/CMM-49: bezug-native Lead-Termine (lead_id NULL, bezug_typ='lead')
  // via effektiveBezugIds mitnehmen — sonst bleibt der Auftrag leer ("—"/Provisorisch).
  const leadIdsFromTermine = (termine ?? [])
    .filter((t) => !t.fall_id)
    .map((t) => effektiveBezugIds(t).leadId)
    .filter((id): id is string => !!id)
  const leadIds = Array.from(new Set([...leadIdsFromFaelle, ...leadIdsFromTermine]))
  const leadMap = new Map<string, Record<string, unknown>>()
  if (leadIds.length) {
    // 2026-05-06: admin-client damit RLS uns nicht aussperrt — die
    // Termine sind bereits per sv_id gefiltert, leads dazu zu laden ist
    // legitim (kein Cross-Tenant-Risiko).
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: leads } = await admin
      .from('leads')
      .select('id, vorname, nachname, anrede, telefon, kunde_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadens_fall_typ, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng')
      .in('id', leadIds)
    for (const l of (leads ?? []) as unknown as Record<string, unknown>[]) {
      leadMap.set(l.id as string, l)
    }
  }

  // 2026-05-06: claim_parties als Fallback-Quelle für Kunde-Daten —
  // bei Claim-getriebenen Aufträgen (CMM-Phase 2+) liegen vorname/
  // nachname/anrede/telefon nicht im lead sondern in
  // claim_parties.rolle='geschaedigter'. Für jeden Fall den
  // geschaedigter-Snapshot laden.
  const claimIds = Array.from(
    new Set(
      [...fallMap.values()]
        .map((f) => f.claim_id as string | null)
        .filter((x): x is string => !!x),
    ),
  )
  const partyMap = new Map<string, { vorname: string | null; nachname: string | null; anrede: string | null; telefon: string | null; user_id: string | null }>()
  if (claimIds.length) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: parties } = await admin
      .from('claim_parties')
      .select(
        // CMM-49 Entity Plan-5 (4b): pure-entity — Person-Felder nur noch aus personen (flat-Spalten gedroppt).
        'claim_id, rolle, user_id, reihenfolge, personen!claim_parties_person_id_fkey(vorname, nachname, anrede, telefon, mobil)',
      )
      .in('claim_id', claimIds)
      .eq('rolle', 'geschaedigter')
      .order('reihenfolge', { ascending: true })
    for (const p of (parties ?? []) as Array<Record<string, unknown>>) {
      const cId = p.claim_id as string
      if (partyMap.has(cId)) continue // erste/primäre geschaedigter-Row gewinnt
      // CMM-49 Entity Plan-5 (4b): person-Felder PURE-entity aus personen (via person_id-FK).
      // Flat-Fallback entfernt — die claim_parties-Person-Spalten sind gedroppt (DB-verifiziert
      // 0 Divergenz vor dem Cutover -> verhaltensidentisch).
      const person = (Array.isArray(p.personen) ? p.personen[0] : p.personen) as
        | Record<string, unknown>
        | null
        | undefined
      const telefonVal = (person?.telefon as string | null) ?? null
      const mobilVal = (person?.mobil as string | null) ?? null
      partyMap.set(cId, {
        vorname: (person?.vorname as string | null) ?? null,
        nachname: (person?.nachname as string | null) ?? null,
        anrede: (person?.anrede as string | null) ?? null,
        telefon: (telefonVal ?? mobilVal) ?? null,
        user_id: (p.user_id as string | null) ?? null,
      })
    }
  }

  // 2026-05-06: Kunden-Avatare laden (lead.kunde_id → profiles.avatar_url).
  // Wichtig: admin-client benutzen, da RLS dem SV nicht erlaubt fremde
  // profiles-Rows zu lesen — wir nehmen nur die avatar_url (nicht-sensitiv,
  // public im avatare-Bucket eh).
  const kundeIds = Array.from(
    new Set(
      [
        ...[...leadMap.values()].map((l) => l.kunde_id as string | null),
        ...[...partyMap.values()].map((p) => p.user_id),
      ].filter((x): x is string => !!x),
    ),
  )
  const avatarMap = new Map<string, string | null>()
  if (kundeIds.length) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: profiles } = await admin
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
      const effLeadId = effektiveBezugIds(t).leadId
      const lead = effLeadId ? leadMap.get(effLeadId) : null
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

  // Aufträge pro Fall (CMM-32f) — für Auftrag-Typ-Anzeige.
  // CMM-44 SP-H PR2: sv_briefing_text kommt aus dem aktuellen Auftrag (höchster
  // reihenfolge-Wert) — in den fallMap-Eintrag mergen, damit die Stop-Erstellung
  // unten weiterhin fall.sv_briefing_text lesen kann.
  const auftragMap = new Map<string, { typ: string; status: string }>()
  if (fallIds.length) {
    const { data: auftraege } = await supabase
      .from('auftraege')
      .select('fall_id, typ, status, reihenfolge, sv_briefing_text')
      .in('fall_id', fallIds)
      .eq('sv_id', sv.id)
      .order('reihenfolge', { ascending: false })
    for (const a of (auftraege ?? []) as Array<{ fall_id: string; typ: string; status: string; sv_briefing_text: string | null }>) {
      if (!auftragMap.has(a.fall_id)) {
        auftragMap.set(a.fall_id, { typ: a.typ, status: a.status })
        const f = fallMap.get(a.fall_id)
        if (f) f.sv_briefing_text = a.sv_briefing_text
      }
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
    // 2026-05-08 Aaron-UI-Audit Bug #4: einheitliche „offen für SV"-
    // Definition mit pflichtStats unten. Status-States hochgeladen +
    // in_pruefung sind aus SV-Sicht erledigt (er hat seinen Teil
    // gemacht / Backend prüft).
    const PFLICHT_DONE_STATES = new Set(['hochgeladen', 'in_pruefung', 'erfuellt', 'geprueft'])
    for (const p of (pflichtRows ?? []) as Array<{
      fall_id: string
      dokument_typ: string
      status: string
      pflicht: boolean
    }>) {
      if (PFLICHT_DONE_STATES.has(p.status)) continue
      if (!pflichtListMap.has(p.fall_id)) pflichtListMap.set(p.fall_id, [])
      pflichtListMap.get(p.fall_id)!.push({
        slot_id: p.dokument_typ,
        label: labelMap.get(p.dokument_typ) ?? p.dokument_typ,
      })
    }
  }

  const heuteTermine: HeuteTerminFull[] = (termine ?? []).map((t) => {
    const fall = fallMap.get(t.fall_id as string)
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus dem claims-Embed (Array/Objekt normalisieren).
    // CMM-44 SP-B PR2a: szenario ebenfalls aus dem claims-Embed.
    const fallClaim = (Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims) as
      | { schadenort_adresse: string | null; schadenort_plz: string | null; schadenort_ort: string | null; claim_nummer: string | null; szenario: string | null }
      | null
      | undefined
    const eff = effektiveBezugIds(t)
    const leadIdResolved = (fall?.lead_id as string | null) ?? eff.leadId ?? null
    const lead = leadIdResolved ? leadMap.get(leadIdResolved) : null
    const preFlowlink = !fall && !!eff.leadId
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
      lead_id: (t.lead_id as string | null) ?? eff.leadId ?? null,
      pre_flowlink: preFlowlink,
      start_zeit: t.start_zeit as string,
      end_zeit: (t.end_zeit as string) ?? null,
      status: t.status as string,
      // 2026-05-06: Kunde-Daten Fallback-Chain: claim_parties >
      // lead — bei Claim-getriebenen Aufträgen ist die Party-Snapshot
      // die Source-of-Truth.
      kunde_name: (() => {
        const party = fall?.claim_id ? partyMap.get(fall.claim_id as string) : null
        const partyName = party
          ? [party.vorname, party.nachname].filter(Boolean).join(' ')
          : ''
        if (partyName) return partyName
        return lead
          ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
          : '—'
      })(),
      kunde_anrede: (() => {
        const party = fall?.claim_id ? partyMap.get(fall.claim_id as string) : null
        const a = (party?.anrede as string | null) ?? (lead?.anrede as string | null) ?? null
        return (a as 'herr' | 'frau' | 'divers' | null) ?? null
      })(),
      kunde_telefon: (() => {
        const party = fall?.claim_id ? partyMap.get(fall.claim_id as string) : null
        return party?.telefon ?? (lead?.telefon as string | null) ?? null
      })(),
      kunde_avatar_url: (() => {
        const party = fall?.claim_id ? partyMap.get(fall.claim_id as string) : null
        const userId = party?.user_id ?? (lead?.kunde_id as string | null) ?? null
        return userId ? avatarMap.get(userId) ?? null : null
      })(),
      stop_weather: weatherMap.get(t.id as string) ?? null,
      claim_nummer:
        (fallClaim?.claim_nummer as string) ??
        (preFlowlink ? 'Provisorisch' : ((t.fall_id as string) ?? '').slice(0, 8)),
      kennzeichen: (fall?.kennzeichen as string) ?? (lead?.kennzeichen as string) ?? null,
      fahrzeug:
        [
          fall?.fahrzeug_hersteller ?? lead?.fahrzeug_hersteller,
          fall?.fahrzeug_modell ?? lead?.fahrzeug_modell,
        ]
          .filter(Boolean)
          .join(' ') || null,
      // CMM-44 SP-B PR2a: szenario aus dem claims-Embed (SSoT).
      schadentyp: (fallClaim?.szenario as string) ?? (lead?.schadens_fall_typ as string) ?? null,
      besichtigungsort_adresse: besichtigungAdresse,
      besichtigungsort_place_id: besichtigungPlaceId,
      besichtigungsort_lat: besichtigungLat != null ? Number(besichtigungLat) : null,
      besichtigungsort_lng: besichtigungLng != null ? Number(besichtigungLng) : null,
      // CMM-44 SP-A2 (Cluster 1): schadenort_* aus dem claims-Embed (SSoT).
      // (leads fuehrt diese Spalten nicht — der fruehere lead-Fallback war No-op.)
      schadens_adresse: (fallClaim?.schadenort_adresse as string | null) ?? null,
      schadens_plz: (fallClaim?.schadenort_plz as string | null) ?? null,
      schadens_ort: (fallClaim?.schadenort_ort as string | null) ?? null,
      sv_briefing_text: (fall?.sv_briefing_text as string) ?? null,
      gesehen_am: (t.gesehen_am as string | null) ?? null,
      einzusammelnde_dokumente: [],
    }
  })

  // Pflichtdokumente-Counts pro Fall parallel laden — damit die Sidebar
  // pro Termin „X von Y offen" anzeigen kann. Pre-FlowLink-Termine ohne
  // fall_id werden übersprungen.
  const fallIdsForPflicht = Array.from(
    new Set(heuteTermine.map((t) => t.fall_id).filter((x): x is string => !!x)),
  )
  // 2026-05-08 Aaron-UI-Audit Bug #4: Top-Counter und Termin-Zeilen-Counter
  // zählten unterschiedlich — Top filterte auf NOT (erfuellt|geprueft), die
  // Termin-Zeile auf status === 'offen' (DB hat aber 'ausstehend' als
  // Default — fast nichts gematched). Beide jetzt auf einheitlicher
  // Definition: „offen für SV" = alles außer (hochgeladen, in_pruefung,
  // erfuellt, geprueft). Das matched die Semantik „muss SV vor Ort
  // einsammeln/anstoßen".
  const PFLICHT_DONE_STATES = new Set(['hochgeladen', 'in_pruefung', 'erfuellt', 'geprueft'])
  const pflichtStats: TagesroutePflichtStat[] = await Promise.all(
    fallIdsForPflicht.map(async (fallId) => {
      try {
        const slots = await getPflichtdokumenteForFall(supabase, fallId, 'sv')
        const pflichtSlots = slots.filter((s) => s.pflicht)
        const offen = pflichtSlots.filter((s) => !PFLICHT_DONE_STATES.has(s.status ?? '')).length
        return { fallId, offen, gesamt: pflichtSlots.length }
      } catch {
        return { fallId, offen: 0, gesamt: 0 }
      }
    }),
  )

  // AAR-872: Privat-Stops (GCal/CalDAV-Termine, die der SV manuell als
  // Tagesroute-Anker addet) initial laden.
  const initialPrivatStops = await listPrivatStopsForDate(berlinHeute)

  return (
    <HeuteClient
      termine={heuteTermine}
      pflichtStats={pflichtStats}
      svStandort={{
        lat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
        lng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
      }}
      isochronePolygon={normalizeIsochrone(sv.isochrone_polygon)}
      hasActiveSession={hasActiveSession}
      initialPrivatStops={initialPrivatStops}
    />
  )
}
