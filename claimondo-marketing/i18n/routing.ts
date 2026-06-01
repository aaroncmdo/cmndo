import { defineRouting } from 'next-intl/routing'
import { LOCALES, DEFAULT_LOCALE } from './locales'

// i18n-SEO: next-intl App-Router-Routing — Single Source of Truth fuer Locales
// + Prefix-Strategie. Genutzt von middleware.ts, navigation.ts und den
// hreflang/sitemap-Buildern.
//
// - localePrefix 'as-needed': DEFAULT_LOCALE ('de') bleibt prefix-frei, damit
//   die bestehenden indexierten DE-URLs (/vorteile, /kfz-gutachter/...) sich
//   NICHT aendern (0 Redirects). en/tr/ar/ru/pl bekommen /en /tr ... -Prefixe
//   -> rein additive, crawlbare Sprachversionen.
// - localeCookie: der bestehende 'claimondo-locale'-Cookie bleibt als
//   Sekundaer-Signal (de-Default + Switcher-Praeferenz); die URL ist primaer.
// Diese Config speist createNavigation (LanguageSwitcher: de prefix-frei, Rest
// praefixiert + Cookie beim Wechsel) und die hreflang/sitemap-Builder. Das
// eigentliche Request-Routing (as-needed Rewrite, loop-frei) macht die eigene
// middleware.ts — bewusst NICHT next-intl/middleware (dessen as-needed-Handling
// der prefix-freien de-Pfade funktioniert in diesem Next-16-Stack nicht; Details
// im Kopf von middleware.ts).
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeCookie: { name: 'claimondo-locale' },
})
