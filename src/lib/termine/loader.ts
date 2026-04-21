// AAR-638/641/643: Shared Loader für Termin-Listen im Fall-/Lead-Kontext.
//
// Joint drei Termin-Tabellen zu einer normalisierten Liste, damit die
// Consumer (Fallakte, Dispatch-Lead, Kanzlei, Kunde-Portal) alle dieselbe
// Shape sehen.
//
// Quellen:
//   - admin_termine (typ ∈ rueckruf, kunde, intern) — fall_id ODER lead_id
//   - gutachter_termine (SV-Termine + kb_beratung) — fall_id
//
// Nicht hier: termine-Tabelle (Legacy, siehe AAR-642 — entweder Deprecate
// oder explizit gepflegt). Wird nicht automatisch eingebunden bis geklärt.

import type { SupabaseClient } from '@supabase/supabase-js'

export type TerminQuelle = 'admin_termine' | 'gutachter_termine'

export type TerminTyp =
  | 'rueckruf'
  | 'kunde'
  | 'intern'
  | 'gutachter'
  | 'kb_beratung'

export type TerminStatus =
  | 'offen'
  | 'bestaetigt'
  | 'reserviert'
  | 'gegenvorschlag'
  | 'erledigt'
  | 'abgesagt'
  | 'abgelehnt'

export type NormalizedTermin = {
  id: string
  quelle: TerminQuelle
  typ: TerminTyp
  titel: string
  start: string
  end: string | null
  status: TerminStatus
  notizen: string | null
  fallId: string | null
  leadId: string | null
  // Wer „hält" den Termin primär — SV, KB, zugewiesener MA
  verantwortlichName: string | null
  // Kanal für KB-Beratung: video|tel
  kanal: string | null
}

type LoadScope =
  | { fallId: string; leadId?: never }
  | { leadId: string; fallId?: never }
  | { fallId: string; leadId: string }

export async function loadTermine(
  supabase: SupabaseClient,
  scope: LoadScope,
): Promise<NormalizedTermin[]> {
  const out: NormalizedTermin[] = []

  // ── 1. admin_termine ────────────────────────────────────────────────
  {
    let query = supabase
      .from('admin_termine')
      .select('id, typ, titel, start_zeit, end_zeit, status, notizen, fall_id, lead_id, zugewiesen_an')

    if (scope.fallId && scope.leadId) {
      query = query.or(`fall_id.eq.${scope.fallId},lead_id.eq.${scope.leadId}`)
    } else if (scope.fallId) {
      query = query.eq('fall_id', scope.fallId)
    } else {
      query = query.eq('lead_id', scope.leadId)
    }

    const { data } = await query.order('start_zeit', { ascending: false })
    const rows = (data ?? []) as Array<{
      id: string
      typ: TerminTyp
      titel: string
      start_zeit: string
      end_zeit: string | null
      status: TerminStatus
      notizen: string | null
      fall_id: string | null
      lead_id: string | null
      zugewiesen_an: string | null
    }>

    // Zugewiesene Betreuer-Namen laden (1 Roundtrip)
    const zIds = [...new Set(rows.map(r => r.zugewiesen_an).filter(Boolean) as string[])]
    const nameMap: Record<string, string> = {}
    if (zIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, vorname, nachname')
        .in('id', zIds)
      for (const p of profiles ?? []) {
        nameMap[p.id] = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
      }
    }

    for (const r of rows) {
      out.push({
        id: r.id,
        quelle: 'admin_termine',
        typ: r.typ,
        titel: r.titel,
        start: r.start_zeit,
        end: r.end_zeit,
        status: r.status,
        notizen: r.notizen,
        fallId: r.fall_id,
        leadId: r.lead_id,
        verantwortlichName: r.zugewiesen_an ? nameMap[r.zugewiesen_an] ?? null : null,
        kanal: null,
      })
    }
  }

  // ── 2. gutachter_termine (fall_id ODER lead_id) ─────────────────────
  {
    let gtQuery = supabase
      .from('gutachter_termine')
      .select('id, typ, start_zeit, end_zeit, status, fall_id, lead_id, sv_id, kb_id, kanal, notiz_intern')
      .is('cancelled_at', null)

    if (scope.fallId && scope.leadId) {
      gtQuery = gtQuery.or(`fall_id.eq.${scope.fallId},lead_id.eq.${scope.leadId}`)
    } else if (scope.fallId) {
      gtQuery = gtQuery.eq('fall_id', scope.fallId)
    } else {
      gtQuery = gtQuery.eq('lead_id', scope.leadId)
    }

    const { data: gt } = await gtQuery.order('start_zeit', { ascending: false })

    const rows = (gt ?? []) as Array<{
      id: string
      typ: string | null
      start_zeit: string
      end_zeit: string | null
      status: string
      fall_id: string | null
      lead_id: string | null
      sv_id: string | null
      kb_id: string | null
      kanal: string | null
      notiz_intern: string | null
    }>

    // SV-Namen via profiles
    const svIds = [...new Set(rows.map(r => r.sv_id).filter(Boolean) as string[])]
    const svNameMap: Record<string, string> = {}
    if (svIds.length > 0) {
      const { data: svs } = await supabase
        .from('sachverstaendige')
        .select('id, profile_id')
        .in('id', svIds)
      const pIds = (svs ?? []).map(s => s.profile_id).filter(Boolean) as string[]
      if (pIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, vorname, nachname')
          .in('id', pIds)
        const pMap: Record<string, string> = {}
        for (const p of profiles ?? []) pMap[p.id] = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
        for (const sv of svs ?? []) svNameMap[sv.id] = sv.profile_id ? pMap[sv.profile_id] ?? '—' : '—'
      }
    }
    const kbIds = [...new Set(rows.map(r => r.kb_id).filter(Boolean) as string[])]
    const kbNameMap: Record<string, string> = {}
    if (kbIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, vorname, nachname')
        .in('id', kbIds)
      for (const p of profiles ?? []) kbNameMap[p.id] = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
    }

    for (const r of rows) {
      const isKb = r.typ === 'kb_beratung'
      out.push({
        id: r.id,
        quelle: 'gutachter_termine',
        typ: isKb ? 'kb_beratung' : 'gutachter',
        titel: isKb ? 'KB-Beratung' : 'Gutachter-Termin',
        start: r.start_zeit,
        end: r.end_zeit,
        status: r.status as TerminStatus,
        notizen: r.notiz_intern,
        fallId: r.fall_id,
        leadId: r.lead_id,
        verantwortlichName: isKb
          ? r.kb_id ? kbNameMap[r.kb_id] ?? null : null
          : r.sv_id ? svNameMap[r.sv_id] ?? null : null,
        kanal: r.kanal,
      })
    }
  }

  out.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  return out
}
