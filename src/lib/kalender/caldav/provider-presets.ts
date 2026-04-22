// AAR-717: Provider-Presets für den CalDAV-Connect-Flow.
//
// Scope dieses Tickets: iCloud + Custom. Fastmail/Nextcloud sind für später
// geplant, aber das Schema ist schon ausgelegt (label + serverUrl-Preset +
// Anleitung).

export type CalDavProviderId = 'icloud' | 'custom'

export type CalDavProvider = {
  id: CalDavProviderId
  label: string
  serverUrl: string | null // null = User muss selbst eingeben
  // Hilfetext für den App-Passwort-Hinweis im Modal
  appPasswordHint: {
    kurz: string
    url: string // Support-URL zum Generieren des App-Passworts
  } | null
}

export const CALDAV_PROVIDERS: CalDavProvider[] = [
  {
    id: 'icloud',
    label: 'Apple iCloud',
    serverUrl: 'https://caldav.icloud.com',
    appPasswordHint: {
      kurz:
        'Apple benötigt ein App-spezifisches Passwort — dein normales Apple-ID-Passwort funktioniert nicht.',
      url: 'https://support.apple.com/de-de/102654',
    },
  },
  {
    id: 'custom',
    label: 'Anderer CalDAV-Server',
    serverUrl: null,
    appPasswordHint: null,
  },
]

export function findProvider(id: string): CalDavProvider | undefined {
  return CALDAV_PROVIDERS.find((p) => p.id === id)
}
