import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import { isLocale } from './locales'

// i18n-SEO: next-intl Server-Config.
// Die Locale kommt jetzt aus dem [locale]-URL-Segment (requestLocale) statt aus
// dem Cookie — so bekommen Crawler (die keinen Cookie setzen) unter /en /tr ...
// die korrekte Sprache. Fallback auf defaultLocale ('de'). Die
// Cookie-Negotiation (de-Default + Switcher-Praeferenz) uebernimmt die
// next-intl-Middleware (siehe middleware.ts / routing.ts:localeCookie).
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = isLocale(requested) ? requested : routing.defaultLocale
  const messages = (await import(`./messages/${locale}.json`)).default

  return {
    locale,
    messages,
  }
})
