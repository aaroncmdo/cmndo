'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type TypFilter = { gutachter: boolean; rueckruf: boolean; kunde: boolean; intern: boolean }

type KalenderTermin = {
  id: string
  typ: 'gutachter' | 'rueckruf' | 'kunde' | 'intern' | 'kb_beratung'
  titel: string
  start: string
  end: string
  farbe: string
  gutachterId?: string
  gutachterName?: string
  fallId?: string
  fallNummer?: string
  link?: string
  status?: string
}

const FARBEN: Record<string, string> = {
  gutachter: '#4573A2',
  rueckruf: '#E89B3C',
  kunde: '#5DAA80',
  intern: '#7B7B8A',
  kb_beratung: '#C9A84C',
}

export async function getKalenderTermine(
  startDate: string,
  endDate: string,
  typFilter: TypFilter,
  gutachterIds: string[],
): Promise<KalenderTermin[]> {
  const supabase = await createClient()
  const results: KalenderTermin[] = []

  // 1. Gutachter-Termine
  if (typFilter.gutachter) {
    let query = supabase
      .from('gutachter_termine')
      .select('id, sv_id, fall_id, start_zeit, end_zeit, status')
      .gte('start_zeit', startDate)
      .lte('start_zeit', endDate)
      .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag'])

    if (gutachterIds.length > 0) {
      query = query.in('sv_id', gutachterIds)
    }

    const { data: gTermine } = await query

    // SV-Namen laden
    const svIds = [...new Set((gTermine ?? []).map(t => t.sv_id).filter(Boolean))]
    const svNameMap: Record<string, string> = {}
    if (svIds.length > 0) {
      const { data: svs } = await supabase.from('sachverstaendige').select('id, profile_id').in('id', svIds)
      const profileIds = (svs ?? []).map(s => s.profile_id).filter(Boolean)
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
        const profileMap: Record<string, string> = {}
        for (const p of profiles ?? []) profileMap[p.id] = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—'
        for (const sv of svs ?? []) svNameMap[sv.id] = profileMap[sv.profile_id] ?? '—'
      }
    }

    // Fall-Nummern laden
    const fallIds = [...new Set((gTermine ?? []).map(t => t.fall_id).filter(Boolean))]
    const fallNrMap: Record<string, string> = {}
    if (fallIds.length > 0) {
      const { data: faelle } = await supabase.from('faelle').select('id, fall_nummer').in('id', fallIds)
      for (const f of faelle ?? []) fallNrMap[f.id] = f.fall_nummer ?? f.id.slice(0, 8)
    }

    for (const t of gTermine ?? []) {
      results.push({
        id: t.id,
        typ: 'gutachter',
        titel: fallNrMap[t.fall_id] ?? 'Gutachter-Termin',
        start: t.start_zeit,
        end: t.end_zeit,
        farbe: FARBEN.gutachter,
        gutachterId: t.sv_id,
        gutachterName: t.sv_id ? svNameMap[t.sv_id] : undefined,
        fallId: t.fall_id,
        fallNummer: fallNrMap[t.fall_id],
        link: t.fall_id ? `/faelle/${t.fall_id}` : undefined,
        status: t.status,
      })
    }
  }

  // 2. Admin-Termine (Rueckruf, Kunde, Intern)
  const adminTypen: string[] = []
  if (typFilter.rueckruf) adminTypen.push('rueckruf')
  if (typFilter.kunde) adminTypen.push('kunde')
  if (typFilter.intern) adminTypen.push('intern')

  if (adminTypen.length > 0) {
    const { data: aTermine } = await supabase
      .from('admin_termine')
      .select('id, typ, titel, start_zeit, end_zeit, fall_id, status')
      .gte('start_zeit', startDate)
      .lte('start_zeit', endDate)
      .in('typ', adminTypen)
      .neq('status', 'abgesagt')

    // Fall-Nummern laden
    const fallIds = [...new Set((aTermine ?? []).map(t => t.fall_id).filter(Boolean))]
    const fallNrMap: Record<string, string> = {}
    if (fallIds.length > 0) {
      const { data: faelle } = await supabase.from('faelle').select('id, fall_nummer').in('id', fallIds)
      for (const f of faelle ?? []) fallNrMap[f.id] = f.fall_nummer ?? f.id.slice(0, 8)
    }

    for (const t of aTermine ?? []) {
      results.push({
        id: t.id,
        typ: t.typ as 'rueckruf' | 'kunde' | 'intern',
        titel: t.titel,
        start: t.start_zeit,
        end: t.end_zeit,
        farbe: FARBEN[t.typ] ?? FARBEN.intern,
        fallId: t.fall_id,
        fallNummer: t.fall_id ? fallNrMap[t.fall_id] : undefined,
        link: t.fall_id ? `/faelle/${t.fall_id}` : undefined,
        status: t.status,
      })
    }
  }

  // 3. KB-Beratungstermine
  {
    const { data: kbTermine } = await supabase
      .from('gutachter_termine')
      .select('id, fall_id, kb_id, start_zeit, end_zeit, status, kanal')
      .eq('typ', 'kb_beratung')
      .gte('start_zeit', startDate)
      .lte('start_zeit', endDate)
      .in('status', ['bestaetigt', 'reserviert'])
      .is('cancelled_at', null)

    const kbFallIds = [...new Set((kbTermine ?? []).map(t => t.fall_id).filter(Boolean))]
    const kbFallNrMap: Record<string, string> = {}
    if (kbFallIds.length > 0) {
      const { data: kbFaelle } = await supabase.from('faelle').select('id, fall_nummer').in('id', kbFallIds)
      for (const f of kbFaelle ?? []) kbFallNrMap[f.id] = f.fall_nummer ?? f.id.slice(0, 8)
    }

    for (const t of kbTermine ?? []) {
      const kanalLabel = t.kanal === 'video' ? '📹' : '📞'
      results.push({
        id: t.id,
        typ: 'kb_beratung',
        titel: `${kanalLabel} ${kbFallNrMap[t.fall_id] ?? 'KB-Beratung'}`,
        start: t.start_zeit,
        end: t.end_zeit,
        farbe: FARBEN.kb_beratung,
        fallId: t.fall_id,
        fallNummer: kbFallNrMap[t.fall_id],
        link: t.fall_id ? `/faelle/${t.fall_id}` : undefined,
        status: t.status,
      })
    }
  }

  results.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  return results
}

export async function getActiveGutachter(): Promise<Array<{
  id: string
  name: string
  typ: string
  avatar_url?: string
}>> {
  const supabase = await createClient()
  const { data: svs } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, gutachter_typ, status')
    .eq('status', 'aktiv')

  if (!svs?.length) return []

  const profileIds = svs.map(s => s.profile_id).filter(Boolean)
  const { data: profiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname, avatar_url').in('id', profileIds)
    : { data: [] }

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  return svs.map(sv => {
    const p = sv.profile_id ? profileMap[sv.profile_id] : null
    return {
      id: sv.id,
      name: p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—' : '—',
      typ: sv.gutachter_typ ?? 'kfz-gutachter',
      avatar_url: p?.avatar_url ?? undefined,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}
