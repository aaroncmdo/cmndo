// AAR-497 N2: WhatsApp-Stub. N3 (AAR-498) ersetzt das mit echtem Twilio-Versand
// via Template-Lookup pro event_type. Bis dahin wird nur geloggt + success=true.

import type { ChannelHandler } from './types'

export const whatsappHandler: ChannelHandler = async (input) => {
  console.log('[channel:whatsapp][stub]', {
    event: input.eventType,
    recipient: input.recipientUserId,
    role: input.recipientRole,
  })
  return { success: true, externalId: `stub-wa-${input.event.id}` }
}
