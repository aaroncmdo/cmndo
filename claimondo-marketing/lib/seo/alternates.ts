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

/** og:locale erwartet Unterstrich-Notation (de_DE), hreflang den Bindestrich (de-DE). */
const LOCALE_TO_OG: Record<Locale, string> = {
  de: 'de_DE',
  en: 'en_US',
  ar: 'ar_AR',
  tr: 'tr_TR',
  pl: 'pl_PL',
  ru: 'ru_RU',
}

/**
 * `url` + `locale` fuer den openGraph-Block einer UEBERSETZTEN Seite —
 * das Gegenstueck zu `localeAlternates` auf der Open-Graph-Seite.
 *
 * Warum das noetig ist: Beide Felder waren in den Pages hartkodiert
 * (`url: \`${SITE_URL}/kfz-gutachter/x\``, `locale: 'de_DE'`), waehrend der
 * Canonical daneben ueber localeAlternates korrekt die Locale-URL trug. Jede
 * fremdsprachige Seite behauptete damit zwei sich widersprechende Dinge:
 *
 *   canonical  https://claimondo.de/tr/kfz-gutachter/trier   „ich bin tuerkisch"
 *   og:url     https://claimondo.de/kfz-gutachter/trier      „ich bin die deutsche Seite"
 *
 * Ahrefs meldete dafuer 1.005 Seiten („Open Graph URL not matching canonical",
 * Site-Audit 24.08.2026) — das entspricht 5 Sprachen mal rund 200 Seiten.
 * Widerspruechliche Kanonisierungssignale sind ein bekannter Ausloeser fuer
 * „Gecrawlt, zurzeit nicht indexiert", und genau dieser Status betraf zu 71 %
 * fremdsprachige URLs.
 *
 * ⚠ Nur fuer Seiten mit `localeAlternates`. Der untranslated Cluster
 * (haftpflicht/sachverstaendige/versicherer [slug], rein deutscher Body)
 * canonicalisiert bewusst auf die de-Version — dort ist die praefixfreie
 * og:url richtig und darf NICHT umgestellt werden.
 *
 * @example
 * openGraph: { type: 'website', siteName: 'Claimondo', ...(await localeOpenGraph('/vorteile')), title, description, images }
 */
export async function localeOpenGraph(
  path: string,
): Promise<{ url: string; locale: string }> {
  const locale = await getLocale()
  return {
    url: localeUrl(locale, path),
    locale: LOCALE_TO_OG[locale as Locale] ?? LOCALE_TO_OG[DEFAULT_LOCALE],
  }
}
