import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'

// AAR-462 F4 / AAR-463 F5 Foundation: Liest die User-Sprach-Präferenz aus
// dem Cookie `claimondo_locale`. Fällt auf DEFAULT_LOCALE ('de') zurück
// wenn kein oder ungültiges Cookie vorhanden.
// AAR-459 F1 wird ggf. next-intl-Integration dazu bauen — die Signatur
// bleibt gleich.

export type SupportedLocale = Locale

export { DEFAULT_LOCALE }

const LOCALE_COOKIE = 'claimondo-locale'

export async function getLocaleCookie(): Promise<SupportedLocale> {
  const cookieStore = await cookies()
  const value = cookieStore.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}
