// AAR-95: Google Calendar Event-Erstellung mit Meet-Link + Auto-Invite
import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'

export interface CreateVideoEventInput {
  kbUserId: string
  kbEmail: string
  kundeEmail: string
  kundeName: string
  fallNummer: string
  startISO: string
  dauerMinuten: number
  beschreibung?: string
}

export interface CreateVideoEventResult {
  eventId: string
  calendarId: string
  meetLink: string
  htmlLink: string
}

export async function createVideoEvent(input: CreateVideoEventInput): Promise<CreateVideoEventResult> {
  const auth = await getGoogleOAuthClientForUser(input.kbUserId)
  if (!auth) {
    throw new Error('KB ist nicht mit Google verbunden. Bitte unter /admin/einstellungen/google verbinden.')
  }
  const calendar = google.calendar({ version: 'v3', auth })

  const startDate = new Date(input.startISO)
  const endDate = new Date(startDate.getTime() + input.dauerMinuten * 60 * 1000)

  const response = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Beratungstermin Fall ${input.fallNummer}`,
      description: input.beschreibung || `Videotermin mit ${input.kundeName} zur Besprechung des Falls ${input.fallNummer}.`,
      start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Berlin' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Berlin' },
      attendees: [
        { email: input.kbEmail, responseStatus: 'accepted' },
        { email: input.kundeEmail, responseStatus: 'needsAction' },
      ],
      conferenceData: {
        createRequest: {
          requestId: `claimondo-${input.fallNummer}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    },
  })

  const event = response.data
  if (!event.id) throw new Error('Google Calendar Event ohne ID')
  if (!event.hangoutLink) throw new Error('Meet-Link wurde nicht generiert')

  return {
    eventId: event.id,
    calendarId: 'primary',
    meetLink: event.hangoutLink,
    htmlLink: event.htmlLink ?? '',
  }
}

export async function cancelVideoEvent(kbUserId: string, eventId: string, calendarId = 'primary'): Promise<void> {
  const auth = await getGoogleOAuthClientForUser(kbUserId)
  if (!auth) throw new Error('KB nicht mit Google verbunden')
  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: 'all',
  })
}
