import type { Locale } from './locales'

// Lädt die Messages einer bestimmten Locale DIREKT — umgeht die cookie-basierte
// getRequestConfig in request.ts, die ihren locale-Parameter bewusst ignoriert
// und immer das `claimondo-locale`-Cookie liest. Der scoped Flow-Provider
// (flow/[token]/page.tsx) braucht aber die Empfänger-Locale aus flow_links.sprache,
// die vom Cookie abweicht — getMessages({locale}) würde hier trotzdem die
// Cookie-Messages liefern. Der relative `./messages/`-Pfad ist statisch
// analysierbar (gleiches Muster wie request.ts).
export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  return (await import(`./messages/${locale}.json`)).default
}
