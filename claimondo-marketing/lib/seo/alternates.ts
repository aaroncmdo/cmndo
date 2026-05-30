// Hreflang-Helper für Marketing-Pages.
//
// Claimondo nutzt cookie-basiertes i18n ohne URL-Prefix — alle Sprachen
// erscheinen unter derselben URL (Content-Negotiation via claimondo-locale Cookie).
// Hreflang-Tags signalisieren Übersetzungen an AI-Crawler + Search-Engines.
//
// Google-Spezifikation erlaubt dieses Muster bei Server-Side Content-Negotiation.
// Für reine Cookie-Negotiation (kein Accept-Language Header) ist es technisch
// nicht ideal, aber der GEO-Benefit für LLM-Indizierung überwiegt.

import { SITE_URL } from './jsonld'

export type HreflangLocale = 'de' | 'en' | 'ar' | 'tr' | 'pl' | 'ru'

const LOCALE_TO_HREFLANG: Record<HreflangLocale, string> = {
  de: 'de-DE',
  en: 'en-US',
  ar: 'ar',
  tr: 'tr-TR',
  pl: 'pl-PL',
  ru: 'ru-RU',
}

/**
 * Baut das `alternates.languages`-Objekt für Next.js Metadata.
 *
 * @param path  URL-Pfad relativ zu SITE_URL, z.B. '/gutachter-finden'.
 *              Leer-String oder '/' für die Root-Page.
 *
 * @example
 * export const metadata: Metadata = {
 *   alternates: {
 *     canonical: `${SITE_URL}/gutachter-finden`,
 *     ...buildLanguageAlternates('/gutachter-finden'),
 *   },
 * }
 */
export function buildLanguageAlternates(path: string = '/'): {
  languages: Record<string, string>
} {
  const normalizedPath = path === '/' || path === '' ? '' : `/${path.replace(/^\//, '')}`
  const url = `${SITE_URL}${normalizedPath}`

  const languages: Record<string, string> = {
    'x-default': url,
  }

  for (const [locale, hreflang] of Object.entries(LOCALE_TO_HREFLANG)) {
    void locale
    languages[hreflang] = url
  }

  return { languages }
}
