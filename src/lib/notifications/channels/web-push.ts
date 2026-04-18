// AAR-497 N2: Web-Push-Stub. N4 (AAR-499) implementiert echten Web-Push an
// push_subscriptions.endpoint via web-push-library.

import type { ChannelHandler } from './types'

export const webPushHandler: ChannelHandler = async (input) => {
  console.log('[channel:web_push][stub]', {
    event: input.eventType,
    recipient: input.recipientUserId,
    role: input.recipientRole,
  })
  return { success: true, externalId: `stub-push-${input.event.id}` }
}
