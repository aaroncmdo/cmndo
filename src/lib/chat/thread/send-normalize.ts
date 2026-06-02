// Chat-Inbox P2: reine Send-Typen + Result-Normalisierung. KEINE Server-Action-
// Imports -> vitest-safe. Die Adapter (mit Server-Action-Imports) liegen in
// send-strategies.ts und importieren von hier.

import type { ChatKanal } from '@/lib/communications/channels'

export type ChatSendInput = {
  fallId?: string | null
  kanal: ChatKanal
  nachricht: string
  empfaengerId?: string | null
}
export type ChatSendResult = { ok: boolean; error?: string; messageId?: string }
export type ChatSender = (input: ChatSendInput) => Promise<ChatSendResult>

/** Normalisiert die alten {success}-Shapes (sendChatMessage/maklerSendMessage) auf {ok}. */
export function normalizeLegacyResult(r: {
  success: boolean
  error?: string
  messageId?: string
}): ChatSendResult {
  return r.success ? { ok: true, messageId: r.messageId } : { ok: false, error: r.error }
}
