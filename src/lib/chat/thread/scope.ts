// Chat-Inbox P2: reine Scope-Logik fuer das ChatThread-Primitive.
// ChatScope beschreibt, WELCHE Nachrichten ein Thread zeigt — zwei Strategien
// (siehe Spec docs/superpowers/specs/2026-06-02-chat-thread-primitive-design.md):
//   - 'fall':            ueber fall_id(s) + Kanal-Set  (Multi/Timeline/Fokus/Makler)
//   - 'kanal-allowlist': ueber EINEN Kanal + Sender-ID-Menge (KundeKbChat-Outlier)
// fall_id bleibt der Key in P2; der claim_id-Cutover ist P3/Track-2.

import type { ChatKanal } from '@/lib/communications/channels'

export type ChatScope =
  | { kind: 'fall'; fallIds: string[]; kanaele: ChatKanal[] }
  | { kind: 'kanal-allowlist'; kanal: ChatKanal; senderAllowlist: string[] }

export type ThreadFilter =
  | { mode: 'fall'; fallIds: string[]; kanaele: ChatKanal[]; serverFilter: string | null }
  | { mode: 'kanal'; kanal: ChatKanal; serverFilter: string }

/** Parameter fuer das initiale nachrichten-Select + den Realtime-postgres_changes-Filter. */
export function buildThreadFilter(scope: ChatScope): ThreadFilter {
  if (scope.kind === 'fall') {
    // Supabase kann kein IN-Filter im Realtime — nur bei genau einem fallId server-filtern,
    // sonst client-seitig via matchesScope (wie ChatTimelineView heute schon).
    const serverFilter = scope.fallIds.length === 1 ? `fall_id=eq.${scope.fallIds[0]}` : null
    return { mode: 'fall', fallIds: scope.fallIds, kanaele: scope.kanaele, serverFilter }
  }
  return { mode: 'kanal', kanal: scope.kanal, serverFilter: `kanal=eq.${scope.kanal}` }
}

/** Eine Realtime-Channel-Namenskonvention. instanceId = useId() (Strict-Mode-Guard). */
export function buildChannelName(scope: ChatScope, instanceId: string, userId: string): string {
  if (scope.kind === 'fall') return `chat:fall:${scope.fallIds.join(',')}:${instanceId}`
  return `chat:kanal:${scope.kanal}:${userId}:${instanceId}`
}

type RowLite = { fall_id: string | null; kanal: string; sender_id: string | null }

/** Client-seitiger Filter (Multi-Fall + Allowlist, die der Server-Filter nicht abdeckt). */
export function matchesScope(row: RowLite, scope: ChatScope): boolean {
  if (scope.kind === 'fall') {
    return row.fall_id != null && scope.fallIds.includes(row.fall_id) && scope.kanaele.includes(row.kanal as ChatKanal)
  }
  return row.kanal === scope.kanal && row.sender_id != null && scope.senderAllowlist.includes(row.sender_id)
}
