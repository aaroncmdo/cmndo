// AAR-497 N2: In-App-Stub. Produktion: schreibt in mitteilungen (siehe
// lib/mitteilungen/create-mitteilung.ts) — kommt in Folge-Ticket N6. Bis
// dahin loggen + success=true.

import type { ChannelHandler } from './types'

export const inAppHandler: ChannelHandler = async (input) => {
  console.log('[channel:in_app][stub]', {
    event: input.eventType,
    recipient: input.recipientUserId,
    role: input.recipientRole,
  })
  return { success: true, externalId: `stub-inapp-${input.event.id}` }
}
