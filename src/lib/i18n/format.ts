// Portal-i18n F-20 (Welle 3): Locale-aware Format-Helfer für kundensichtbare
// Zahlen/Daten. Reine Funktionen auf Basis von Intl.* — Server- UND Client-
// nutzbar. Ersetzen die harten `de-DE`-Hardcodes in den Welle-1-Flächen
// (F-21-Sweep: Kunde-Portal + Magic-Link).

import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

/**
 * Claimondo ist ein deutsches Produkt — Datums-/Zeitanzeige läuft in Berliner
 * Wandzeit, unabhängig von der Anzeige-Locale (sonst verschöben sich Termine
 * je nach Sprache, vgl. Memory google_calendar_timezone).
 */
const APP_TIME_ZONE = 'Europe/Berlin'

// App-Locale → BCP-47-Tag für Intl.*. Bewusst regionale Tags (de-DE statt de),
// damit Tausender-/Dezimaltrenner + Datumsreihenfolge korrekt sind.
const BCP47: Record<Locale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  tr: 'tr-TR',
  ar: 'ar',
  ru: 'ru-RU',
  pl: 'pl-PL',
}

/** Mappt eine App-Locale auf ein BCP-47-Tag (Fallback: DEFAULT_LOCALE). */
export function localeToBcp47(locale: Locale): string {
  return BCP47[locale] ?? BCP47[DEFAULT_LOCALE]
}

/** Date | ISO-String | Epoch-ms → Date; null bei fehlend/ungültig. */
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * EUR-Betrag in der aktiven Locale.
 * `formatCurrency(1234.5, 'de')` → `"1.234,50 €"` (NBSP vor €).
 */
export function formatCurrency(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeToBcp47(locale), {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

/**
 * Datum (ohne Uhrzeit) in der aktiven Locale, Berliner Zeitzone.
 * Ungültig/fehlend → `""` (nie Crash, nie "Invalid Date").
 */
export function formatDate(
  value: Date | string | number | null | undefined,
  locale: Locale,
): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat(localeToBcp47(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  }).format(d)
}

/**
 * Datum + Uhrzeit in der aktiven Locale, Berliner Zeitzone.
 * Ungültig/fehlend → `""`.
 */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale: Locale,
): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat(localeToBcp47(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  }).format(d)
}
