import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, isLocale } from './locales'

// AAR-459 F1: next-intl Server-Config.
// - Liest das Cookie `claimondo-locale` (gesetzt via setLocaleAction).
// - Kein URL-Prefix (bewusst), Sprache wird per Cookie geführt.
// - Fallback auf DEFAULT_LOCALE ('de') wenn Cookie fehlt oder ungültig ist.
const LOCALE_COOKIE = 'claimondo-locale'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE

  const messages = (await import(`./messages/${locale}.json`)).default

  return {
    locale,
    messages,
  }
})
