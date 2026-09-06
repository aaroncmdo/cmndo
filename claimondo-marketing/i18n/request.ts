import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import { isLocale, DEFAULT_LOCALE } from './locales'

// i18n-SEO: next-intl Server-Config.
// Die Locale kommt jetzt aus dem [locale]-URL-Segment (requestLocale) statt aus
// dem Cookie — so bekommen Crawler (die keinen Cookie setzen) unter /en /tr ...
// die korrekte Sprache. Fallback auf defaultLocale ('de'). Die
// Cookie-Negotiation (de-Default + Switcher-Praeferenz) uebernimmt die
// next-intl-Middleware (siehe middleware.ts / routing.ts:localeCookie).

/** Objekt, aber kein Array: Arrays sind Blaetter und werden ersetzt, nicht verschmolzen. */
function istZweig(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Deutsch als Grundschicht, die Zielsprache darueber.
 *
 * ⚠ Bis 06.09.2026 wurde ausschliesslich die Datei der Zielsprache geladen.
 * Fehlte ein Schluessel dort, rendert next-intl den ROHEN SCHLUESSELPFAD —
 * eine Seite zeigte dann woertlich `unfallguide.kopf.h1_plain` statt eines
 * Satzes. Zusammen mit dem zweiten Loch (`check:i18n` liest NUR `src/`, nicht
 * `claimondo-marketing/` — steht so im Kopf von `scripts/i18n/translate.mjs`)
 * konnte eine unvollstaendige Uebersetzung weder beim Uebersetzen noch in der
 * CI auffallen und waere erst dem Besucher aufgefallen.
 *
 * Mit dieser Grundschicht ist der schlechteste Fall wieder das, was er vor der
 * Mehrsprachigkeit war: deutscher Text. Das ist nie schlechter als ein roher
 * Schluessel und macht das Ergaenzen eines Namensraums ungefaehrlich — die
 * Uebersetzung darf der deutschen Fassung nachlaufen.
 *
 * ⚠ Die Kehrseite: eine fehlende Uebersetzung ist jetzt nicht mehr am Bildschirm
 * zu sehen. Wer eine Flaeche ausliefert, misst ihre Vollstaendigkeit deshalb
 * SELBST (Schluesselzahl je Sprache) und verlaesst sich nicht auf den Augenschein.
 */
function mitDeutschAlsBasis(
  deutsch: Record<string, unknown>,
  ziel: Record<string, unknown>,
): Record<string, unknown> {
  const zusammen: Record<string, unknown> = { ...deutsch }
  for (const [schluessel, wert] of Object.entries(ziel)) {
    const basis = zusammen[schluessel]
    zusammen[schluessel] =
      istZweig(basis) && istZweig(wert) ? mitDeutschAlsBasis(basis, wert) : wert
  }
  return zusammen
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = isLocale(requested) ? requested : routing.defaultLocale
  const eigene = (await import(`./messages/${locale}.json`)).default

  if (locale === DEFAULT_LOCALE) {
    return { locale, messages: eigene }
  }

  const deutsch = (await import(`./messages/${DEFAULT_LOCALE}.json`)).default
  return { locale, messages: mitDeutschAlsBasis(deutsch, eigene) }
})
