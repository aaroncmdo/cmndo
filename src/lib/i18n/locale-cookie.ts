// AAR-462 F4 Stub: Bis AAR-459 F1 (i18n-Foundation) gemerged ist, liefert
// dieser Helper fest 'de' zurück. Sobald F1 das echte Cookie-basierte Locale-
// Lookup bringt, wird diese Datei von F1 überschrieben.
//
// Signatur bewusst so gewählt dass F1 sie 1:1 ersetzen kann:
//   - async (wird später Next.js `cookies()` nutzen)
//   - SupportedLocale Typ-Export für Components

export type SupportedLocale = 'de' | 'en' | 'tr' | 'ar' | 'ru' | 'pl'

export const DEFAULT_LOCALE: SupportedLocale = 'de'

/**
 * Liest die User-Sprach-Präferenz aus dem Cookie.
 * AAR-462 F4 Stub — liefert immer 'de' bis AAR-459 F1 gemerged.
 */
export async function getLocaleCookie(): Promise<SupportedLocale> {
  return DEFAULT_LOCALE
}
