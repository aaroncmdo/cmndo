// Strategie B (i18n Magic-Link-Flow): löst die Empfänger-Sprache des
// token-only Geschädigten auf eine unserer 6 next-intl-Locales auf.
// Priorität: flow_links.sprache > lead.sprache > 'de'. 'other'/null/
// unbekannte Codes -> 'de' (dort bleibt der Google-Translate-Banner).
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

export function resolveFlowLocale(
  flowSprache: string | null | undefined,
  leadSprache: string | null | undefined,
): Locale {
  if (isLocale(flowSprache)) return flowSprache
  if (isLocale(leadSprache)) return leadSprache
  return DEFAULT_LOCALE
}
