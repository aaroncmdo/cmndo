import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import FaelleKanban from './FaelleKanban'
import KanbanUploadsRealtime from './KanbanUploadsRealtime'

// CMM-Strecke: Primary-Read wechselt von `faelle` auf `v_claim_listing`
// (claims-SSoT). Felder die noch nicht in der View aggregiert sind (status-
// Pipeline-Felder, deaktiviert-Marker, schadens_fall_typ, mandatsnummer)
// werden in einem Supplement-Read aus `faelle` nachgeholt.
//
// Map-Strategie:
//   - id     = listing.fall_id (Kanban erwartet fall_id als Detail-Link-ID)
//   - status = listing.status  (Sync-Trigger hält claims↔faelle konsistent)
//   - aktuelle_phase = supp.aktuelle_phase  (faelle, bis claims phase-1 ist)
//   - kunde_name = listing.kunde_anzeigename (claim hat den Anzeigenamen)
//
// Skipped Felder aus dem alten SELECT die in FaelleKanban gar nicht
// verbraucht werden: schadens_ursache, schadens_ort (toter Code-Pfad,
// hier nicht mehr selecten).

type ListingRow = {
  claim_id: string
  claim_nummer: string | null
  phase: string | null
  status: string | null
  fall_id: string | null
  fall_nummer: string | null
  sv_id: string | null
  faelle_kundenbetreuer_id: string | null
  claim_kundenbetreuer_id: string | null
  kunde_anzeigename: string | null
  kennzeichen: string | null
  created_at: string | null
}

type FaelleSupplement = {
  id: string
  ist_aktiv: boolean | null
  deaktiviert_grund: string | null
  mandatsnummer: string | null
  schadens_fall_typ: string | null
  aktuelle_phase: string | null
  abgeschlossen_am: string | null
  lead_id: string | null
}

export default async function AdminFaellePage() {
  const supabase = await createClient()

  const user = (await supabase.auth.getUser())?.data?.user ?? null
  const { data: profile } = user
    ? await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    : { data: null }

  let listingQuery = supabase
    .from('v_claim_listing')
    .select(
      'claim_id, claim_nummer, phase, status, fall_id, fall_nummer, sv_id, faelle_kundenbetreuer_id, claim_kundenbetreuer_id, kunde_anzeigename, kennzeichen, created_at',
    )
    .not('status', 'eq', 'storniert')
    .order('created_at', { ascending: false })

  if (profile?.rolle === 'kundenbetreuer' && user) {
    // KB-Filter analog zur RLS: faelle_kundenbetreuer_id ODER claim_kundenbetreuer_id
    listingQuery = listingQuery.or(
      `faelle_kundenbetreuer_id.eq.${user.id},claim_kundenbetreuer_id.eq.${user.id}`,
    )
  }

  const { data: listing } = await listingQuery
  const rows = (listing ?? []) as ListingRow[]

  // AAR-611: Batch-Lookups parallel — schadens_fall_typ + ist_aktiv + Pipeline-
  // Marker leben noch auf faelle; SV-Name + KB-Name via Profile-Joins; Mitteilungen
  // + Unread-Counts via admin-Client (RLS-bypass für die Aggregates).
  const admin = createAdminClient()

  const fallIds = rows.map((r) => r.fall_id).filter(Boolean) as string[]
  const kbIds = [
    ...new Set(
      rows
        .map((r) => r.faelle_kundenbetreuer_id ?? r.claim_kundenbetreuer_id)
        .filter(Boolean) as string[],
    ),
  ]
  const svIds = [...new Set(rows.map((r) => r.sv_id).filter(Boolean) as string[])]

  const emptyRes = { data: [] as never[] }
  const defaultTime = '1970-01-01T00:00:00Z'

  const [
    { data: suppRows },
    { data: kbProfiles },
    { data: svs },
    { data: unreadMsgs },
    { data: readStates },
  ] = await Promise.all([
    fallIds.length > 0
      ? supabase
          .from('faelle')
          .select(
            'id, ist_aktiv, deaktiviert_grund, mandatsnummer, schadens_fall_typ, aktuelle_phase, abgeschlossen_am, lead_id',
          )
          .in('id', fallIds)
      : Promise.resolve(emptyRes),
    kbIds.length > 0
      ? supabase.from('profiles').select('id, vorname, nachname').in('id', kbIds)
      : Promise.resolve(emptyRes),
    svIds.length > 0
      ? supabase
          .from('sachverstaendige')
          .select(
            'id, profiles!sachverstaendige_profile_id_fkey(vorname, nachname)',
          )
          .in('id', svIds)
      : Promise.resolve(emptyRes),
    fallIds.length > 0
      ? admin
          .from('nachrichten')
          .select('fall_id')
          .eq('gelesen', false)
          .eq('sender_rolle', 'kunde')
          .in('fall_id', fallIds)
      : Promise.resolve(emptyRes),
    fallIds.length > 0 && user
      ? admin
          .from('fall_read_state')
          .select('fall_id, last_read_update_at')
          .eq('user_id', user.id)
          .in('fall_id', fallIds)
      : Promise.resolve(emptyRes),
  ])

  const supplements = (suppRows ?? []) as FaelleSupplement[]
  const suppMap = new Map(supplements.map((s) => [s.id, s]))

  // Leads für kunde_name-Fallback (wenn kunde_anzeigename in der View leer ist)
  const leadIds = [
    ...new Set(supplements.map((s) => s.lead_id).filter(Boolean) as string[]),
  ]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] as { id: string; vorname: string | null; nachname: string | null }[] }

  // AAR-770: Pro Fall die jüngste offene Mitteilung des aktuellen Users laden
  // — wird im Kanban-Hover angezeigt damit der KB sofort sieht worum es geht.
  const mitteilungMap: Record<string, { titel: string; inhalt: string | null; prioritaet: string | null }> = {}
  if (fallIds.length > 0 && user) {
    const { data: mitteilungen } = await admin
      .from('mitteilungen')
      .select('kontext_id, titel, inhalt, prioritaet, created_at')
      .eq('empfaenger_id', user.id)
      .eq('kontext_typ', 'fall')
      .eq('gelesen', false)
      .in('kontext_id', fallIds)
      .order('created_at', { ascending: false })
    for (const m of mitteilungen ?? []) {
      const fid = m.kontext_id as string
      if (!mitteilungMap[fid]) {
        mitteilungMap[fid] = {
          titel: m.titel as string,
          inhalt: (m.inhalt as string | null) ?? null,
          prioritaet: (m.prioritaet as string | null) ?? null,
        }
      }
    }
  }

  const leadMap = Object.fromEntries(
    (leads ?? []).map((l) => [
      l.id,
      `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || null,
    ]),
  )
  const kbMap = Object.fromEntries(
    (kbProfiles ?? []).map((p) => [
      p.id,
      `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || null,
    ]),
  )
  const svMap = Object.fromEntries(
    (svs ?? []).map((sv) => {
      const pr = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as
        | { vorname: string | null; nachname: string | null }
        | null
      return [sv.id, pr ? `${pr.vorname ?? ''} ${pr.nachname ?? ''}`.trim() || null : null]
    }),
  )

  const unreadMap: Record<string, number> = {}
  for (const msg of (unreadMsgs ?? []) as { fall_id: string }[]) {
    unreadMap[msg.fall_id] = (unreadMap[msg.fall_id] ?? 0) + 1
  }

  const readStateMap = new Map(
    (readStates ?? []).map((s) => [
      s.fall_id as string,
      s.last_read_update_at as string | null,
    ]),
  )
  const updateCounts = fallIds.length > 0
    ? await Promise.all(
        fallIds.map((fid) =>
          admin
            .rpc('count_unread_updates', {
              p_fall_id: fid,
              p_since: readStateMap.get(fid) ?? defaultTime,
            })
            .then(({ data }) => ({ fid, count: typeof data === 'number' ? data : 0 })),
        ),
      )
    : []
  const updateMap: Record<string, number> = {}
  for (const { fid, count } of updateCounts) updateMap[fid] = count

  // Zusammenbauen — Shape kompatibel zu FaelleKanban (Pflicht-Felder dort:
  // id, fall_nummer, status, mandatsnummer, schadens_fall_typ, kennzeichen,
  // ist_aktiv, deaktiviert_grund, aktuelle_phase, abgeschlossen_am,
  // kunde_name, betreuer_name, sv_name, ungelesene_*, mitteilung).
  const enriched = rows
    .filter((r) => r.fall_id) // Kanban erwartet fall_id; ohne FK-Bridge ausblenden.
    .map((r) => {
      const fid = r.fall_id as string
      const supp = suppMap.get(fid)
      const kbId = r.faelle_kundenbetreuer_id ?? r.claim_kundenbetreuer_id ?? null
      return {
        id: fid,
        fall_nummer: r.fall_nummer ?? r.claim_nummer ?? null,
        status: r.status ?? 'neu',
        // Kanban benutzt schadens_ursache + schadens_ort nicht — bewusst weg.
        schadens_ursache: null as string | null,
        schadens_ort: null as string | null,
        sv_id: r.sv_id,
        kundenbetreuer_id: kbId,
        mandatsnummer: supp?.mandatsnummer ?? null,
        schadens_fall_typ: supp?.schadens_fall_typ ?? null,
        kennzeichen: r.kennzeichen ?? null,
        created_at: r.created_at ?? new Date(0).toISOString(),
        ist_aktiv: supp?.ist_aktiv ?? null,
        deaktiviert_grund: supp?.deaktiviert_grund ?? null,
        aktuelle_phase: supp?.aktuelle_phase ?? r.phase ?? null,
        abgeschlossen_am: supp?.abgeschlossen_am ?? null,
        kunde_name:
          r.kunde_anzeigename ??
          (supp?.lead_id ? leadMap[supp.lead_id] ?? null : null),
        betreuer_name: kbId ? kbMap[kbId] ?? null : null,
        sv_name: r.sv_id ? svMap[r.sv_id] ?? null : null,
        ungelesene_nachrichten: unreadMap[fid] ?? 0,
        ungelesene_updates: updateMap[fid] ?? 0,
        mitteilung: mitteilungMap[fid] ?? null,
      }
    })

  const renderedFallIds = enriched.map((e) => e.id)

  return (
    <>
      {/* CMM-33: Live-Aktualisierung der KB-Upload-Badge ohne manuellen Reload */}
      <KanbanUploadsRealtime fallIds={renderedFallIds} />
      <FaelleKanban faelle={enriched} />
    </>
  )
}
