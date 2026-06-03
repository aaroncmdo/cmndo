// AAR-463 F5 / AAR-459 F1 Foundation: zentrale Locale-Definition.
// Wird von LanguageSwitcher + getLocaleCookie + zukünftigen i18n-Helpern genutzt.

export const LOCALES = ['de', 'en', 'tr', 'ar', 'ru', 'pl'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'de'

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}
