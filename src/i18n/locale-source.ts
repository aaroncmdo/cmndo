// Portal-i18n Welle 1 (F-01): Reine, request-kontextfreie Helfer zur
// Klassifikation der Locale-Quelle je Route + Token-Extraktion + Normalisierung.
//
// KEINE next/headers- / server-only-Imports — damit unit-testbar und sowohl
// in Server- als auch Client-Kontexten importierbar. Die DB-Auflösung lebt in
// resolve-locale.ts (server-only), die Orchestrierung in request.ts.

import { isLocale, type Locale } from './locales'

export type LocaleSource = 'cookie' | 'profile' | 'token'

export type TokenKind = 'flow' | 'upload-dokumente' | 'upload-zb1' | 're-termin' | 'ablehnen'

// Magic-Link-Routen mit Token-Segment im Pfad: [prefix, kind].
// Reihenfolge egal — Prefixe sind disjunkt.
const TOKEN_PREFIXES: ReadonlyArray<readonly [string, TokenKind]> = [
  ['/flow/', 'flow'],
  ['/upload/dokumente/', 'upload-dokumente'],
  ['/upload/zb1/', 'upload-zb1'],
  ['/kunde/re-termin/', 're-termin'],
  ['/ablehnen/', 'ablehnen'],
]

// Token-/anonyme Routen OHNE traceable Token-Segment an fester Position.
// Sie sind anonym (kein profiles.sprache), daher als 'token' klassifiziert,
// damit request.ts KEIN getUser() auslöst — die Auflösung fällt auf Cookie
// zurück, weil extractTokenFromPath() hier null liefert.
const TOKEN_EXACT_PREFIXES = ['/kunde-termin', '/kunde/termin', '/sv'] as const

/**
 * Extrahiert Token + Strecken-Art aus einem Magic-Link-Pfad.
 * Liefert null wenn kein Token-Segment vorhanden ist.
 */
export function extractTokenFromPath(
  pathname: string | null | undefined,
): { kind: TokenKind; token: string } | null {
  if (!pathname) return null
  for (const [prefix, kind] of TOKEN_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const token = pathname.slice(prefix.length).split('/')[0]
      if (token) return { kind, token }
    }
  }
  return null
}

/**
 * Klassifiziert, aus welcher Quelle die Locale für diese Route kommt:
 *  - 'token'   → Magic-Link/anonym (Token-Trace oder Cookie-Fallback)
 *  - 'profile' → authentifiziertes Kunde-Portal (profiles.sprache)
 *  - 'cookie'  → Marketing/login/sonstiges (claimondo-locale, heutiges Verhalten)
 *
 * Token-Klassifikation hat Vorrang vor /kunde, damit /kunde/re-termin &
 * /kunde/termin NICHT als 'profile' (→ DB-Read auf anonymer Route) gelten.
 */
export function classifyLocaleSource(pathname: string | null | undefined): LocaleSource {
  if (!pathname) return 'cookie'
  if (extractTokenFromPath(pathname)) return 'token'
  if (TOKEN_EXACT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'token'
  if (pathname === '/kunde' || pathname.startsWith('/kunde/')) return 'profile'
  return 'cookie'
}

// leads.sprache / flow_links.sprache sind ISO-Codes (Welle-0-Befund 2026-05-29:
// reale Werte nur 'de'). Die Alias-Map ist nur ein Sicherheitsnetz, falls je
// Klartext-Werte auftauchen — unbekannt → null (Fallback), nie raten.
const LOCALE_ALIASES: Record<string, Locale> = {
  deutsch: 'de',
  german: 'de',
  englisch: 'en',
  english: 'en',
  tuerkisch: 'tr',
  'türkisch': 'tr',
  turkish: 'tr',
  arabisch: 'ar',
  arabic: 'ar',
  russisch: 'ru',
  russian: 'ru',
  polnisch: 'pl',
  polish: 'pl',
}

/**
 * Mappt einen DB-/Cookie-Wert sicher auf eine bekannte Locale oder null.
 * null → der Caller fällt auf die nächste Quelle (Cookie → DEFAULT_LOCALE) zurück.
 */
export function normalizeToLocale(value: string | null | undefined): Locale | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  if (isLocale(v)) return v
  return LOCALE_ALIASES[v] ?? null
}
