// Chat-Inbox P2: Send-Strategien. Duenne Adapter, die die 3 bestehenden Sender
// auf {ok, messageId?} normalisieren. Werden vom useChatThread-Engine via Prop
// injiziert (der Consumer waehlt die passende Strategie).

import { sendChatMessage } from '@/lib/communications/send-chat'
import { sendKundeChatMessage } from '@/app/kunde/_components/kb-chat-actions'
import { maklerSendMessage } from '@/lib/actions/makler-send-message'
import { normalizeLegacyResult, type ChatSender } from './send-normalize'

/** Standard-Chat (Fallakte/Inbox/Timeline/Fokus). */
export const standardSender: ChatSender = async (input) =>
  normalizeLegacyResult(
    await sendChatMessage({
      fallId: input.fallId ?? '',
      kanal: input.kanal,
      nachricht: input.nachricht,
      empfaengerId: input.empfaengerId ?? null,
    }),
  )

/** Kunde-Chat (Admin-Client, empfaenger-gekeyt). */
export const kundeSender: ChatSender = async (input) => {
  const r = await sendKundeChatMessage({
    nachricht: input.nachricht,
    kanal: input.kanal as 'chat_kb_kunde' | 'gruppenchat',
    empfaengerId: input.empfaengerId ?? '',
    fallId: input.fallId ?? null,
  })
  return r.ok ? { ok: true, messageId: r.messageId } : { ok: false, error: r.error }
}

/** Makler-Chat (Consent-gegated, postet gruppenchat). */
export const maklerSender: ChatSender = async (input) =>
  normalizeLegacyResult(await maklerSendMessage({ fallId: input.fallId ?? '', inhalt: input.nachricht }))
