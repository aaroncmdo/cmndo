// Portal-i18n: Geteilter, React-freier Resolver fuer die i18n-Key-Hinweise aus
// `getKundenJetztZuTun`. Beide Consumer (KundeJetztZuTunCard = Server, via
// getTranslations; FallKarte-Footer = Client, via useTranslations) nutzen ihn,
// damit die `t.has(key) ? t(key) : <de-Fallback>`-Aufloesung nur EINMAL existiert.
//
// `t` ist absichtlich strukturell getypt (Aufruf + `.has`), damit sowohl der
// next-intl Server- (getTranslations) als auch der Client-Translator
// (useTranslations) ohne Cast passen.

import type { KundeAktion } from './jetzt-zu-tun'

// Strukturelle Translator-Form. next-intl typt den Key als Literal-Union der
// bekannten Keys; ein solcher Funktionstyp ist (Kontravarianz) NICHT auf
// `(key: string) => string` zuweisbar. Daher casten die Consumer ihren `t`
// beim Aufruf auf `JetztZuTunTranslator` — analog zum etablierten
// `t(... as Parameters<typeof t>[0])`-Muster (MultiSlotUploadClient).
export type JetztZuTunTranslator = {
  (key: string, values?: Record<string, string | number>): string
  has: (key: string) => boolean
}

export type AktionTexte = {
  titel: string
  beschreibung: string
  ctaLabel: string | null
}

/**
 * Loest titel/beschreibung/cta-Label einer KundeAktion gegen den `jetztZuTun`-
 * Namespace auf. Faellt pro Feld auf den de-Klartext aus der Lib zurueck, wenn
 * der Key fehlt (oder die Lib gar keinen i18n-Hint geliefert hat → interne
 * Nicht-i18n-Pfade).
 */
export function resolveAktionTexte(aktion: KundeAktion, t: JetztZuTunTranslator): AktionTexte {
  const i = aktion.i18n
  const params = i?.params

  const titel =
    i?.titelKey && t.has(i.titelKey) ? t(i.titelKey, params) : aktion.titel

  const beschreibung =
    i?.beschreibungKey && t.has(i.beschreibungKey)
      ? t(i.beschreibungKey, params)
      : aktion.beschreibung

  const ctaLabel = aktion.cta?.label
    ? i?.ctaLabelKey && t.has(i.ctaLabelKey)
      ? t(i.ctaLabelKey, params)
      : aktion.cta.label
    : null

  return { titel, beschreibung, ctaLabel }
}
