// AAR-316 W2+W3: Banner-Texte für nicht-deutsche Kunden.
// Kein i18n-Framework — nur ein kurzer Hinweis-Banner mit Google-Translate-Link
// pro Sprache. Die Flow-/Portal-Texte bleiben auf Deutsch; Google Translate
// übersetzt die Seite "live". Für legal-kritische Texte (SA-Vertrag) ist das
// ein bewusster Kompromiss — eine professionelle Übersetzung ist Scope für
// ein separates Ticket.
//
// Die Banner-Texte sind manuell übersetzt (nicht Google-Translate) damit der
// Kunde in seiner Sprache begrüßt wird und den Translate-Link versteht.

export type SpracheCode = 'de' | 'tr' | 'ar' | 'ru' | 'pl' | 'en' | 'other'

export type SprachBannerTexts = {
  /** Kurzer Titel „Diese Seite ist auf Deutsch" */
  title: string
  /** CTA-Link-Text „In {language} übersetzen" */
  translateCta: string
  /** Sprachname für Anzeige im Label */
  languageLabel: string
  /** RTL = right-to-left (Arabisch) — Layout-Hint */
  rtl?: boolean
}

export const SPRACH_BANNER: Record<Exclude<SpracheCode, 'de'>, SprachBannerTexts> = {
  tr: {
    title: 'Bu sayfa Almanca',
    translateCta: 'Türkçe çevir',
    languageLabel: 'Türkçe',
  },
  ar: {
    title: 'هذه الصفحة باللغة الألمانية',
    translateCta: 'ترجم إلى العربية',
    languageLabel: 'العربية',
    rtl: true,
  },
  ru: {
    title: 'Эта страница на немецком языке',
    translateCta: 'Перевести на русский',
    languageLabel: 'Русский',
  },
  pl: {
    title: 'Ta strona jest w języku niemieckim',
    translateCta: 'Przetłumacz na polski',
    languageLabel: 'Polski',
  },
  en: {
    title: 'This page is in German',
    translateCta: 'Translate to English',
    languageLabel: 'English',
  },
  other: {
    title: 'This page is in German',
    translateCta: 'Translate this page',
    languageLabel: 'Translation',
  },
}

/**
 * Baut den Google-Translate-Proxy-Link für eine URL.
 * Format: `https://<host-mit-strichen>.translate.goog/<pfad>?_x_tr_sl=de&_x_tr_tl=<lang>&_x_tr_hl=<lang>`
 *
 * Beispiel: https://claimondo.de/flow/abc
 *   → https://claimondo-de.translate.goog/flow/abc?_x_tr_sl=de&_x_tr_tl=tr&_x_tr_hl=tr
 */
export function googleTranslateUrl(originalUrl: string, targetLang: string): string {
  try {
    const url = new URL(originalUrl)
    const hostWithDashes = url.hostname.replace(/\./g, '-')
    const translateHost = `${hostWithDashes}.translate.goog`
    const params = new URLSearchParams(url.search)
    params.set('_x_tr_sl', 'de')
    params.set('_x_tr_tl', targetLang)
    params.set('_x_tr_hl', targetLang)
    return `${url.protocol}//${translateHost}${url.pathname}?${params.toString()}${url.hash}`
  } catch {
    // Fallback: klassischer translate.google.com-Link
    return `https://translate.google.com/translate?sl=de&tl=${encodeURIComponent(
      targetLang,
    )}&u=${encodeURIComponent(originalUrl)}`
  }
}
