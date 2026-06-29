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
  // Schicht A: die DB-getriebene Worklist. get_updates_action leitet die ECHTE Rolle
  // intern aus auth.uid()->profiles ab (leak-safe). p_rolle ist nur informativ und
  // steuert KEINE Sichtbarkeit -- nicht fuer Security darauf verlassen. Die Funktion
  // liefert Action- UND Info-Zeilen (modus-Spalte, z.B. offene Leads = info) -> hier
  // respektiert statt hart 'action'.
  const { data: rpcRows } = await db.rpc('get_updates_action', { p_rolle: rolle })
  const rpcItems: UpdateItem[] = (rpcRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    typ: r.typ as UpdateItem['typ'],
    modus: r.modus === 'info' ? 'info' : 'action',
    prioritaet: (r.prioritaet as UpdateItem['prioritaet']) ?? 'normal',
    titel: r.titel as string,
    inhalt: (r.inhalt as string | null) ?? null,
    kontextTyp: (r.kontext_typ as string | null) ?? null,
    kontextId: (r.kontext_id as string | null) ?? null,
    routeUrl: null,
    source: r.source as string,
    createdAt: r.created_at as string,
  }))

  // Schicht B: Info-Log aus mitteilungen — Aktivitaet ('update') + Anruf-Historie ('anruf').
  // 'task' (deprecated) bleibt draussen (kommt als Action-Source offene_aufgabe).
  // kategorie -> UI-typ, damit der Typ-Filter "Anrufe" greift. Anrufe = Historie (info).
  const { data: infoRows } = await db
    .from('mitteilungen')
    .select('*')
    .eq('empfaenger_id', userId)
    .in('kategorie', ['update', 'anruf'])
    .order('created_at', { ascending: false })
    .limit(50)
  const mitteilungInfos: UpdateItem[] = (infoRows ?? []).map((r: Record<string, unknown>) => {
    const kategorie = r.kategorie as string
    return {
      id: r.id as string,
      typ: kategorie === 'anruf' ? 'call' : 'event',
      modus: 'info' as const,
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

  // Action zuerst (nach Prioritaet), dann alle Info (RPC-Info wie offene Leads +
  // mitteilungen) chronologisch. splitUpdates re-trennt ohnehin nach modus.
  const actions = rpcItems
    .filter(i => i.modus === 'action')
    .sort((a, b) =>
      (PRIO_RANK[a.prioritaet] ?? 9) - (PRIO_RANK[b.prioritaet] ?? 9) ||
      b.createdAt.localeCompare(a.createdAt),
    )
  const infos = [...rpcItems.filter(i => i.modus === 'info'), ...mitteilungInfos]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return [...actions, ...infos]
}
