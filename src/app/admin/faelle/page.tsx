import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import FaelleKanban from './FaelleKanban'

export default async function AdminFaellePage() {
  const supabase = await createClient()

  // BUG-104: KB-Filter — KB sieht nur eigene Fälle
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  const { data: profile } = user
    ? await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    : { data: null }

  let query = supabase
    .from('faelle')
    // AAR-572 (V6): aktuelle_phase + abgeschlossen_am für Pipeline-Overlay
    .select('id, fall_nummer, status, schadens_ursache, schadens_ort, sv_id, kundenbetreuer_id, mandatsnummer, schadens_fall_typ, kennzeichen, created_at, kunde_id, lead_id, ist_aktiv, deaktiviert_grund, aktuelle_phase, abgeschlossen_am')
    .not('status', 'eq', 'storniert')
    .order('created_at', { ascending: false })

  if (profile?.rolle === 'kundenbetreuer' && user) {
    query = query.eq('kundenbetreuer_id', user.id)
  }

  const { data: faelle } = await query
  const allFaelle = faelle ?? []

  // AAR-611: Batch-Lookups parallel in Promise.all statt 5× sequenziellem await.
  // Vorher: 5 Roundtrips × ~3-4s EU-Supabase-Latenz = 15-20s Wall-Clock.
  // Jetzt: 1 Roundtrip-Zyklus ≈ 3-4s. Daten-Volumen ist winzig (14 Fälle,
  // 9 Nachrichten, 6 Read-States) — reiner Netzwerk-Overhead.
  const admin = createAdminClient()

  const leadIds = [...new Set(allFaelle.map(f => f.lead_id).filter(Boolean))] as string[]
  const kbIds = [...new Set(allFaelle.map(f => f.kundenbetreuer_id).filter(Boolean))] as string[]
  const svIds = [...new Set(allFaelle.map(f => f.sv_id).filter(Boolean))] as string[]
  const fallIds = allFaelle.map(f => f.id)

  const emptyRes = { data: [] as never[] }
  const [
    { data: leads },
    { data: kbProfiles },
    { data: svs },
    { data: unreadMsgs },
  ] = await Promise.all([
    leadIds.length > 0
      ? supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
      : Promise.resolve(emptyRes),
    kbIds.length > 0
      ? supabase.from('profiles').select('id, vorname, nachname').in('id', kbIds)
      : Promise.resolve(emptyRes),
    svIds.length > 0
      ? supabase.from('sachverstaendige').select('id, profiles(vorname, nachname)').in('id', svIds)
      : Promise.resolve(emptyRes),
    fallIds.length > 0
      ? admin.from('nachrichten').select('fall_id').eq('gelesen', false).eq('sender_rolle', 'kunde').in('fall_id', fallIds)
      : Promise.resolve(emptyRes),
  ])

  const leadMap = Object.fromEntries((leads ?? []).map(l => [l.id, `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || null]))
  const kbMap = Object.fromEntries((kbProfiles ?? []).map(p => [p.id, `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || null]))
  const svMap = Object.fromEntries((svs ?? []).map(sv => {
    const pr = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as { vorname: string | null; nachname: string | null } | null
    return [sv.id, pr ? `${pr.vorname ?? ''} ${pr.nachname ?? ''}`.trim() || null : null]
  }))
  const unreadMap: Record<string, number> = {}
  for (const msg of unreadMsgs ?? []) {
    unreadMap[msg.fall_id] = (unreadMap[msg.fall_id] ?? 0) + 1
  }

  // Zusammenbauen (kein N+1 mehr)
  const enriched = allFaelle.map(f => ({
    id: f.id as string,
    fall_nummer: f.fall_nummer as string | null,
    status: f.status as string,
    schadens_ursache: f.schadens_ursache as string | null,
    schadens_ort: f.schadens_ort as string | null,
    sv_id: f.sv_id as string | null,
    kundenbetreuer_id: f.kundenbetreuer_id as string | null,
    mandatsnummer: (f as Record<string, unknown>).mandatsnummer as string | null,
    schadens_fall_typ: (f as Record<string, unknown>).schadens_fall_typ as string | null,
    kennzeichen: (f as Record<string, unknown>).kennzeichen as string | null,
    created_at: f.created_at as string,
    ist_aktiv: (f as Record<string, unknown>).ist_aktiv as boolean | null,
    deaktiviert_grund: (f as Record<string, unknown>).deaktiviert_grund as string | null,
    aktuelle_phase: (f as Record<string, unknown>).aktuelle_phase as string | null,
    abgeschlossen_am: (f as Record<string, unknown>).abgeschlossen_am as string | null,
    kunde_name: f.lead_id ? (leadMap[f.lead_id] ?? null) : null,
    betreuer_name: f.kundenbetreuer_id ? (kbMap[f.kundenbetreuer_id] ?? null) : null,
    sv_name: f.sv_id ? (svMap[f.sv_id] ?? null) : null,
    ungelesene_nachrichten: unreadMap[f.id] ?? 0,
    ungelesene_updates: 0, // TODO: batch RPC for count_unread_updates
  }))

  return <FaelleKanban faelle={enriched} />
}
