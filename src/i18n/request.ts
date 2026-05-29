import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales'
import { classifyLocaleSource } from './locale-source'
import { resolveUserLocale, resolveLocaleFromToken } from './resolve-locale'

// AAR-459 F1 + Portal-i18n W1 (F-04): source-aware next-intl Server-Config.
// - Marketing/login/sonstiges → Cookie `claimondo-locale` (bewusst kein URL-Prefix).
// - Authentifiziertes Kunde-Portal → profiles.sprache (nutzerbasiert).
// - Magic-Link-Routen → Token → leads.sprache.
// Auflösungs-Kaskade: (profile|token) → Cookie → DEFAULT_LOCALE ('de').
// DB-Reads NUR bei source !== 'cookie' (kritischer Pfad — CONTEXT §8 B3).
const LOCALE_COOKIE = 'claimondo-locale'

export default getRequestConfig(async () => {
  const [cookieStore, hdrs] = await Promise.all([cookies(), headers()])

  // x-pathname wird von src/lib/supabase/middleware.ts auf allen Routen gesetzt.
  const pathname = hdrs.get('x-pathname')
  const source = classifyLocaleSource(pathname)

  let resolved: Locale | null = null
  try {
    if (source === 'profile') {
      resolved = await resolveUserLocale()
    } else if (source === 'token' && pathname) {
      resolved = await resolveLocaleFromToken(pathname)
    }
  } catch {
    // Auf dem kritischen Render-Pfad nie crashen — Cookie/Default fängt es ab.
    resolved = null
  }

  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value
  const cookieLocale = isLocale(cookieValue) ? cookieValue : null

  const locale: Locale = resolved ?? cookieLocale ?? DEFAULT_LOCALE
  const messages = (await import(`./messages/${locale}.json`)).default

  return { locale, messages }
})
