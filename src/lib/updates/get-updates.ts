import type { SupabaseClient } from '@supabase/supabase-js'
import type { UpdateItem } from './types'

// #updates-rebuild Phase 0: Read-API. Merged die DB-getriebene Action-Worklist
// (RPC get_updates_action, auth.uid()-scoped) + den Info-Log (mitteilungen) zum
// einheitlichen Item[]. Action zuerst (nach Prioritaet), Info danach (chronologisch).
// `db` MUSS der authentifizierte Client des Users sein (auth.uid() in der RPC).

const PRIO_RANK: Record<string, number> = { dringend: 0, hoch: 1, normal: 2 }

export async function getUpdates(
  db: SupabaseClient,
  userId: string,
  rolle: string,
): Promise<UpdateItem[]> {
  // Schicht A: abgeleitete Action-Items
  const { data: actionRows } = await db.rpc('get_updates_action', { p_rolle: rolle })
  const actions: UpdateItem[] = (actionRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    typ: r.typ as UpdateItem['typ'],
    modus: 'action',
    prioritaet: (r.prioritaet as UpdateItem['prioritaet']) ?? 'normal',
    titel: r.titel as string,
    inhalt: (r.inhalt as string | null) ?? null,
    kontextTyp: (r.kontext_typ as string | null) ?? null,
    kontextId: (r.kontext_id as string | null) ?? null,
    routeUrl: null,
    source: r.source as string,
    createdAt: r.created_at as string,
  }))

  // Schicht B: Info-Log — Aktivitaet (kategorie 'update') + Anruf-Historie (kategorie 'anruf').
  // 'task' (deprecated) bleibt draussen: Tasks kommen als Action-Source offene_aufgabe,
  // sonst doppelt. kategorie -> UI-typ gemappt, damit der Typ-Filter "Anrufe" greift.
  // Anrufe sind Historie (modus=info), keine Action: sie loesen sich nicht "auf".
  const { data: infoRows } = await db
    .from('mitteilungen')
    .select('*')
    .eq('empfaenger_id', userId)
    .in('kategorie', ['update', 'anruf'])
    .order('created_at', { ascending: false })
    .limit(50)
  const infos: UpdateItem[] = (infoRows ?? []).map((r: Record<string, unknown>) => {
    const kategorie = r.kategorie as string
    return {
      id: r.id as string,
      typ: kategorie === 'anruf' ? 'call' : 'event',
      modus: 'info',
      prioritaet: (r.prioritaet as UpdateItem['prioritaet']) ?? 'normal',
      titel: r.titel as string,
      inhalt: (r.inhalt as string | null) ?? null,
      kontextTyp: (r.kontext_typ as string | null) ?? null,
      kontextId: (r.kontext_id as string | null) ?? null,
      routeUrl: (r.route_url as string | null) ?? null,
      source: kategorie === 'anruf' ? 'anruf' : 'info',
      createdAt: r.created_at as string,
    }
  })

  actions.sort((a, b) =>
    (PRIO_RANK[a.prioritaet] ?? 9) - (PRIO_RANK[b.prioritaet] ?? 9) ||
    b.createdAt.localeCompare(a.createdAt),
  )
  return [...actions, ...infos]
}
