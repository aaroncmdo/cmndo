// P1 (Chat-Inbox-Konsolidierung, 01.06.2026): EIN claim-keyed Thread-Reader.
// Ersetzt die 5 dupliziert ausprogrammierten Server-Aggregationen
// (inbox-threads-API + admin/mitarbeiter/gutachter/kunde-Pages).
//
// North-Star-orientiert (docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md):
//   - Schluessel = claim_id (gelesen aus v_claim_full.id). nachrichten.claim_id ist
//     befuellt + RLS schon claim-scoped (can_access_claim, #2108).
//   - fall_id wird als TRANSITIONS-BRIDGE mitgefuehrt, weil die Chat-Komponenten
//     (MultiChannelChat etc.) noch per fall_id oeffnen/realtime-subscriben. Der tiefe
//     fall_id -> claim_id Write/Realtime-Cutover ist CMM Track 2 Paragraph E, NICHT hier.
//   - Metadaten/Scope kommen aus v_claim_full (faelle-frei bis auf die fall_id-Spalte).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getInboxKanaele } from './kanal-routing'
import { getOwnedClaimIds } from '@/lib/claims/owned-claims'

type DbClient = SupabaseClient<Database>

export type ChatThread = {
  claimId: string
  /** Transitions-Bridge: Chat-Komponenten oeffnen noch per fall_id (Track 2 §E flippt das). */
  fallId: string | null
  claimNummer: string | null
  leadId: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
  kanaele: string[]
}

export type GetChatThreadsParams = {
  userId: string
  rolle: string
  /** Nur fuer rolle='kunde' (Lead-Email-Fallback in getOwnedClaimIds). */
  email?: string | null
  /** sachverstaendige.id — wird fuer rolle='sachverstaendiger' bei Bedarf selbst aufgeloest. */
  svId?: string | null
  /** Auch Scope-Claims OHNE Nachricht als leere Threads liefern (sv/kunde/kb-Pages). */
  includeEmpty?: boolean
  limit?: number
}

type ClaimMeta = {
  claimId: string
  fallId: string | null
  claimNummer: string | null
  leadId: string | null
}

type NachrichtRow = {
  claim_id: string | null
  fall_id: string | null
  kanal: string
  sender_id: string | null
  nachricht: string | null
  gelesen: boolean | null
  richtung: string | null
  created_at: string
}

const MSG_SELECT = 'claim_id, fall_id, kanal, sender_id, nachricht, gelesen, richtung, created_at'
// UUID, das garantiert keinem Claim entspricht — fuer "Scope leer, aber Query trotzdem leer halten".
const NO_MATCH = '00000000-0000-0000-0000-000000000000'

/**
 * Liefert die Chat-Threads (claim-keyed) fuer einen Nutzer/eine Rolle.
 *
 * Client-Wahl liegt beim Caller:
 *   - rolle='kunde': `db` MUSS ein Service-Role-Client sein (getOwnedClaimIds braucht
 *     RLS-Bypass fuer den tabellenuebergreifenden Ownership-Lookup).
 *   - sonst: der user-scoped Client (RLS gatet via can_access_claim / admin_nachrichten).
 */
export async function getChatThreads(
  db: DbClient,
  params: GetChatThreadsParams,
): Promise<ChatThread[]> {
  const { userId, rolle, email = null, includeEmpty = false, limit = 500 } = params
  const kanaele = getInboxKanaele(rolle)
  if (kanaele.length === 0) return []

  // 1) Scope aufloesen: welche Claims sieht diese Rolle? (scopeMeta=null => unscoped, admin/dispatch).
  let scopeMeta: ClaimMeta[] | null = null
  if (rolle === 'kunde') {
    const ownedClaimIds = await getOwnedClaimIds(db, userId, email)
    if (ownedClaimIds.length === 0) return []
    scopeMeta = await loadClaimMeta(db, { ids: ownedClaimIds })
  } else if (rolle === 'sachverstaendiger') {
    let svId = params.svId ?? null
    if (!svId) {
      const { data: sv } = await db
        .from('sachverstaendige')
        .select('id')
        .eq('profile_id', userId)
        .maybeSingle()
      svId = (sv?.id as string | undefined) ?? null
    }
    if (!svId) return []
    scopeMeta = await loadClaimMeta(db, { svId })
  } else if (rolle === 'kundenbetreuer') {
    scopeMeta = await loadClaimMeta(db, { kundenbetreuerId: userId })
  }

  // 2) Nachrichten lesen (claim-keyed).
  let q = db
    .from('nachrichten')
    .select(MSG_SELECT)
    .in('kanal', kanaele)
    .not('claim_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (scopeMeta) {
    const ids = scopeMeta.map((m) => m.claimId)
    q = q.in('claim_id', ids.length > 0 ? ids : [NO_MATCH])
  }
  const { data: msgs } = await q
  const rows = (msgs ?? []) as NachrichtRow[]

  // 3) Claim-Metadaten: scoped => bereits geladen; unscoped (admin) => ueber die in den
  //    Nachrichten vorkommenden Claims nachladen.
  let metaById: Map<string, ClaimMeta>
  if (scopeMeta) {
    metaById = new Map(scopeMeta.map((m) => [m.claimId, m]))
  } else {
    const ids = Array.from(new Set(rows.map((r) => r.claim_id).filter(Boolean) as string[]))
    const meta = ids.length ? await loadClaimMeta(db, { ids }) : []
    metaById = new Map(meta.map((m) => [m.claimId, m]))
  }

  // 4) Kundennamen (leads) nachladen.
  const leadIds = Array.from(
    new Set(Array.from(metaById.values()).map((m) => m.leadId).filter(Boolean) as string[]),
  )
  const nameByLead = await loadKundenNamen(db, leadIds)

  // 5) Threads aggregieren.
  const threadMap = new Map<string, ChatThread>()
  const ensure = (claimId: string): ChatThread | null => {
    const existing = threadMap.get(claimId)
    if (existing) return existing
    const meta = metaById.get(claimId)
    if (!meta) return null
    const t: ChatThread = {
      claimId,
      fallId: meta.fallId,
      claimNummer: meta.claimNummer,
      leadId: meta.leadId,
      kundeName: meta.leadId ? (nameByLead.get(meta.leadId) ?? 'Kunde') : 'Unbekannt',
      lastMessage: '',
      lastAt: '',
      unreadCount: 0,
      kanaele: [],
    }
    threadMap.set(claimId, t)
    return t
  }

  // Leere Threads: alle Scope-Claims vorbelegen (z. B. frisch zugewiesener SV-Fall ohne Nachricht).
  if (includeEmpty && scopeMeta) {
    for (const m of scopeMeta) ensure(m.claimId)
  }

  // rows sind created_at DESC -> die erste Nachricht je Claim ist die neueste.
  for (const r of rows) {
    if (!r.claim_id) continue
    const t = ensure(r.claim_id)
    if (!t) continue
    if (!t.lastAt) {
      t.lastAt = r.created_at
      t.lastMessage = (r.nachricht ?? '').slice(0, 80)
    }
    if (!t.kanaele.includes(r.kanal)) t.kanaele.push(r.kanal)
    if (!r.gelesen && r.sender_id !== userId) t.unreadCount++
  }

  return Array.from(threadMap.values()).sort(sortThreads)
}

function sortThreads(a: ChatThread, b: ChatThread): number {
  if ((a.unreadCount > 0) !== (b.unreadCount > 0)) return a.unreadCount > 0 ? -1 : 1
  if (a.lastAt && !b.lastAt) return -1
  if (!a.lastAt && b.lastAt) return 1
  return b.lastAt > a.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0
}

async function loadClaimMeta(
  db: DbClient,
  filter: { ids?: string[]; svId?: string; kundenbetreuerId?: string },
): Promise<ClaimMeta[]> {
  let q = db.from('v_claim_full').select('id, fall_id, claim_nummer, lead_id')
  if (filter.ids) {
    if (filter.ids.length === 0) return []
    q = q.in('id', filter.ids.slice(0, 1000))
  }
  if (filter.svId) q = q.eq('sv_id', filter.svId)
  if (filter.kundenbetreuerId) q = q.eq('kundenbetreuer_id', filter.kundenbetreuerId)
  const { data } = await q
  return (
    (data ?? []) as Array<{
      id: string
      fall_id: string | null
      claim_nummer: string | null
      lead_id: string | null
    }>
  ).map((c) => ({
    claimId: c.id,
    fallId: c.fall_id,
    claimNummer: c.claim_nummer,
    leadId: c.lead_id,
  }))
}

async function loadKundenNamen(db: DbClient, leadIds: string[]): Promise<Map<string, string>> {
  if (leadIds.length === 0) return new Map()
  const { data } = await db
    .from('leads')
    .select('id, vorname, nachname')
    .in('id', leadIds.slice(0, 1000))
  return new Map(
    ((data ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null }>).map(
      (l) => [l.id, [l.vorname, l.nachname].filter(Boolean).join(' ') || 'Kunde'],
    ),
  )
}

// --- Kunde-Gruppierung (fuer das KB-Portal /mitarbeiter/nachrichten) ----------

export type KundeChatGroup = {
  leadId: string
  kundeName: string
  faelle: Array<{ claimId: string; fallId: string | null; claimNummer: string | null }>
  lastMessage: string
  lastAt: string
  unreadCount: number
}

/** Gruppiert claim-Threads zu Kunden (ein Eintrag je lead_id) — KB-Inbox ist kunden-zentriert. */
export function groupThreadsByKunde(threads: ChatThread[]): KundeChatGroup[] {
  const map = new Map<string, KundeChatGroup>()
  for (const t of threads) {
    if (!t.leadId) continue
    let g = map.get(t.leadId)
    if (!g) {
      g = {
        leadId: t.leadId,
        kundeName: t.kundeName,
        faelle: [],
        lastMessage: '',
        lastAt: '',
        unreadCount: 0,
      }
      map.set(t.leadId, g)
    }
    g.faelle.push({ claimId: t.claimId, fallId: t.fallId, claimNummer: t.claimNummer })
    g.unreadCount += t.unreadCount
    if (t.lastAt && (!g.lastAt || t.lastAt > g.lastAt)) {
      g.lastAt = t.lastAt
      g.lastMessage = t.lastMessage
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if ((a.unreadCount > 0) !== (b.unreadCount > 0)) return a.unreadCount > 0 ? -1 : 1
    return (b.lastAt || '') > (a.lastAt || '') ? 1 : (a.lastAt || '') > (b.lastAt || '') ? -1 : 0
  })
}
