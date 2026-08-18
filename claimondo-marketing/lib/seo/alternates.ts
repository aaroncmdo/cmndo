// Hreflang + Canonical-Helper fuer Marketing-Pages (next-intl as-needed).
//
// Seit dem Locale-URL-Rollout (i18n-SEO) sind die Sprachen ueber echte,
// crawlbare URLs erreichbar: de ist prefix-frei (/vorteile), en/tr/ar/ru/pl
// praefixiert (/en/vorteile, /tr/vorteile, ...). hreflang-Alternates listen
// pro Seite alle 6 Sprachvarianten + x-default (de) mit der jeweils ECHTEN URL.

import { getLocale } from 'next-intl/server'
import { SITE_URL } from './jsonld'
import { LOCALES, DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

export type HreflangLocale = Locale

const LOCALE_TO_HREFLANG: Record<Locale, string> = {
  de: 'de-DE',
  en: 'en-US',
  ar: 'ar',
  tr: 'tr-TR',
  pl: 'pl-PL',
  ru: 'ru-RU',
}

/**
 * Echte Locale-URL fuer einen Pfad. de (DEFAULT_LOCALE) bleibt prefix-frei,
 * alle anderen Locales bekommen das `/<locale>`-Prefix (as-needed).
 *
 * @param locale  z.B. 'de' | 'en' | 'tr' ...
 * @param path    Pfad relativ zu SITE_URL, z.B. '/vorteile'. '/' oder '' = Root.
 */
export function localeUrl(locale: string, path: string = '/'): string {
  const clean = path === '/' || path === '' ? '' : `/${path.replace(/^\//, '')}`
  return locale === DEFAULT_LOCALE ? `${SITE_URL}${clean || '/'}` : `${SITE_URL}/${locale}${clean || ''}`
}

/**
 * Baut das `alternates.languages`-Objekt (hreflang) fuer Next.js Metadata —
 * pro Locale die echte Prefix-URL + x-default (de). Locale-agnostisch (die
 * Map ist fuer alle Sprachvarianten derselben Seite identisch).
 *
 * @param path  URL-Pfad relativ zu SITE_URL, z.B. '/gutachter-finden'.
 */
export function buildLanguageAlternates(path: string = '/'): {
  languages: Record<string, string>
} {
  const languages: Record<string, string> = {
    'x-default': localeUrl(DEFAULT_LOCALE, path),
  }
  for (const locale of LOCALES) {
    languages[LOCALE_TO_HREFLANG[locale]] = localeUrl(locale, path)
  }
  return { languages }
}

/**
 * Vollstaendige `alternates` fuer eine UEBERSETZTE Seite: self-canonical auf die
 * eigene Locale-URL (damit jede Sprachversion separat indexiert wird) + hreflang.
 *
 * Untranslated Cluster (haftpflicht/sachverstaendige/versicherer [slug] — rein
 * deutscher Body) nutzen das bewusst NICHT, sondern behalten canonical->de
 * (relativer Pfad), damit Google nur die de-Version indexiert.
 *
 * @example
 * export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
 *   const { locale } = await params
 *   return { alternates: buildLocaleAlternates('/vorteile', locale) }
 * }
 */
export function buildLocaleAlternates(
  path: string,
  locale: string,
): { canonical: string; languages: Record<string, string> } {
  return { canonical: localeUrl(locale, path), ...buildLanguageAlternates(path) }
}

/**
 * Async-Convenience fuer generateMetadata: liest die aktive Locale via
 * next-intl getLocale() (funktioniert im dynamischen Render) und liefert
 * buildLocaleAlternates(path, locale). So braucht die Page weder params noch
 * eine Signatur-Aenderung — nur `alternates: await localeAlternates('/pfad')`.
 */
export async function localeAlternates(
  path: string,
): Promise<{ canonical: string; languages: Record<string, string> }> {
  return buildLocaleAlternates(path, await getLocale())
}
