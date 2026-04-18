// AAR-497 N2: Email-Stub. Later: Gmail-SMTP-Versand über bestehende
// lib/email/google/send.ts — template pro event_type.

import type { ChannelHandler } from './types'

export const emailHandler: ChannelHandler = async (input) => {
  console.log('[channel:email][stub]', {
    event: input.eventType,
    recipient: input.recipientUserId,
    role: input.recipientRole,
  })
  return { success: true, externalId: `stub-email-${input.event.id}` }
}
