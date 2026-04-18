// AAR-497 N2: Channel-Handler-Vertrag. Jeder Channel-Stub (WA/Email/Push/InApp)
// bekommt Event + Empfänger + Payload, sendet und liefert externalId zurück
// (Twilio-SID, Web-Push-Endpoint-Hash, Message-ID, ...). Fehler werfen.

import type { EventType, NotificationEvent, Role } from '../types'

export type ChannelDispatchInput = {
  event: NotificationEvent
  eventType: EventType
  recipientUserId: string
  recipientRole: Role
  payload: Record<string, unknown>
}

export type ChannelDispatchResult = {
  success: boolean
  externalId?: string
  skipReason?: string
  errorMessage?: string
}

export type ChannelHandler = (input: ChannelDispatchInput) => Promise<ChannelDispatchResult>
