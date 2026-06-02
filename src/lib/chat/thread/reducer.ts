// Chat-Inbox P2: reiner Message-Reducer fuer den useChatThread-Engine.
// Kapselt die kniffligen Faelle EINMAL (Dedup, optimistic add/rollback, id-swap),
// damit kein Renderer das mehr selbst macht. Pure -> vitest-getestet.

export type ChatMessage = {
  id: string
  fall_id: string | null
  kanal: string
  sender_id: string | null
  sender_rolle?: string | null
  nachricht: string | null
  created_at: string
  gelesen: boolean | null
  empfaenger_id?: string | null
  richtung?: string | null
  is_system?: boolean | null
  hat_anhang?: boolean | null
  anhang_url?: string | null
  /** Optimistisch hinzugefuegt, Server-Bestaetigung steht aus. */
  pending?: boolean
}

export type ChatAction =
  | { type: 'loaded'; rows: ChatMessage[] }
  | { type: 'realtimeInsert'; row: ChatMessage }
  | { type: 'optimisticAdd'; message: ChatMessage }
  | { type: 'sendResolved'; tempId: string; realId: string }
  | { type: 'sendFailed'; tempId: string }

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0

export function chatReducer(state: ChatMessage[], action: ChatAction): ChatMessage[] {
  switch (action.type) {
    case 'loaded':
      return [...action.rows].sort(byTime)
    case 'realtimeInsert':
      if (state.some((m) => m.id === action.row.id)) return state
      return [...state, action.row].sort(byTime)
    case 'optimisticAdd':
      return [...state, action.message]
    case 'sendResolved': {
      // Falls das Realtime-Echo die echte id schon geliefert hat: Temp entfernen (kein Duplikat).
      const echoed = state.some((m) => m.id === action.realId)
      return state
        .filter((m) => !(echoed && m.id === action.tempId))
        .map((m) => (m.id === action.tempId ? { ...m, id: action.realId, pending: false } : m))
    }
    case 'sendFailed':
      return state.filter((m) => m.id !== action.tempId)
    default:
      return state
  }
}
