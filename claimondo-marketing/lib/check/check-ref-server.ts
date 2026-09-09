import { cookies } from 'next/headers'
import { CHECK_REF_COOKIE, parseCheckRef } from './check-ref'

// SERVER-ONLY (nutzt next/headers cookies()) — Muster wie getConsentedOppref in oaiq-capi.ts, nur ohne
// Consent-Gate: das Cookie ist technisch erforderlich fuer den vom Nutzer gewuenschten Dienst (seine
// eigene Foto-Schaetzung an seine eigene Anfrage haengen), kein Tracking. Liefert null bei fehlendem
// Cookie, ungueltigem Wert oder ausserhalb eines Request-Kontexts — alles normale Zustaende.

export async function leseCheckRef(): Promise<string | null> {
  try {
    const store = await cookies()
    return parseCheckRef(store.get(CHECK_REF_COOKIE)?.value)
  } catch {
    return null
  }
}
