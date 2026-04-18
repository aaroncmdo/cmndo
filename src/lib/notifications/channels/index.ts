// AAR-497 N2: Channel-Registry. Worker wählt per Channel-Key den passenden
// Handler. native_push ist im MVP noch nicht verdrahtet (Folge-Ticket N7 App).

import type { Channel } from '../types'
import { emailHandler } from './email'
import { inAppHandler } from './in-app'
import type { ChannelHandler } from './types'
import { webPushHandler } from './web-push'
import { whatsappHandler } from './whatsapp'

export const CHANNEL_HANDLERS: Partial<Record<Channel, ChannelHandler>> = {
  whatsapp: whatsappHandler,
  email: emailHandler,
  web_push: webPushHandler,
  in_app: inAppHandler,
}

export type { ChannelHandler, ChannelDispatchInput, ChannelDispatchResult } from './types'
