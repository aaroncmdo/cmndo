import { NextResponse, type NextRequest } from 'next/server'
import { routing } from './i18n/routing'

// Host-Routing (Subdomains, de-only) + deterministisches as-needed Locale-Routing
// fuer claimondo.de/www.
//
// Bewusst OHNE next-intl/middleware: dessen as-needed-Handling der prefix-freien
// Default-Pfade funktioniert in diesem Next-16/Turbopack/standalone-Stack nicht
// (unpraefixierte de-Pfade -> 404; mit localeDetection -> 307-Loop, weil Next die
// Middleware auf dem internen Rewrite erneut ausfuehrt und next-intl /de/x ->
// /x zurueck-redirectet). Diese Variante ist deterministisch + loop-frei.
//
// Die aktive Locale erreicht RSC ueber (1) setRequestLocale(locale) im
// [locale]-Layout (RSC-Cache, primaer) und (2) den X-NEXT-INTL-LOCALE-Header
// (wie next-intl ihn setzt, als Fallback); request.ts liest sie via requestLocale.

const HEADER_LOCALE = 'X-NEXT-INTL-LOCALE'
const LOCALE_COOKIE = 'claimondo-locale'
const MAIN_HOST = 'claimondo.de'
const DEFAULT_LOCALE = routing.defaultLocale
const LOCALE_SET = new Set<string>(routing.locales)
const ONE_YEAR = 60 * 60 * 24 * 365

const SUBDOMAIN_LANDING: Record<string, string> = {
  'gutachter.claimondo.de': '/gutachter-partner',
  'makler.claimondo.de': '/makler/partner-werden',
  'kfzgutachter.claimondo.de': '/kfzgutachter-lp',
}

function withLocale(req: NextRequest, locale: string): { request: { headers: Headers } } {
  const headers = new Headers(req.headers)
  headers.set(HEADER_LOCALE, locale)
  return { request: { headers } }
}

// Locale-Cookie consent-UNABHAENGIG setzen — funktionaler Cookie (Sprach-
// Praeferenz), kein Tracking, daher nicht vom Consent-Banner gegatet. Wird auf
// jeder Locale-aufgeloesten Seite gesetzt, damit die Sprache beim Seitenwechsel
// (auch ueber prefix-freie Links) mittraegt; der LanguageSwitcher setzt ihn
// zusaetzlich beim Wechsel (next-intl, korrektes Timing fuer Zurueck-auf-de).
function rememberLocale(res: NextResponse, locale: string): NextResponse {
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}

export default function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase()
  const { pathname, search } = req.nextUrl
  const landing = SUBDOMAIN_LANDING[host]

  // Subdomains: de-only Host-Routing (KEINE Locale-Prefixe in der sichtbaren URL).
  if (landing) {
    if (pathname === '/') {
      return NextResponse.rewrite(
        new URL(`/${DEFAULT_LOCALE}${landing}${search}`, req.url),
        withLocale(req, DEFAULT_LOCALE),
      )
    }
    if (pathname === landing) {
      return NextResponse.redirect(new URL(`/${search}`, req.url), 301)
    }
    return NextResponse.redirect(`https://${MAIN_HOST}${pathname}${search}`, 301)
  }

  // claimondo.de / www: as-needed Locale-Routing.
  const seg1 = pathname.split('/')[1] ?? ''

  // Bereits praefixierte Nicht-Default-Locale (/en/.., /tr/..) -> [locale] matcht
  // direkt + Sprache im Cookie merken (damit prefix-freie Folge-Links mittragen,
  // auch bei Direkt-Einstieg/Shared-Link ohne vorherigen Switch).
  if (LOCALE_SET.has(seg1) && seg1 !== DEFAULT_LOCALE) {
    return rememberLocale(NextResponse.next(withLocale(req, seg1)), seg1)
  }

  // Praefixierte Default-Locale (/de/..) -> direkt ausliefern + Cookie=de merken.
  // KEIN /de->/-Redirect (sonst Loop beim Middleware-Re-Run auf dem internen
  // Rewrite). Die prefix-freie /<pfad> ist die kanonische URL (Page-canonical -> Dedupe).
  if (seg1 === DEFAULT_LOCALE) {
    return rememberLocale(NextResponse.next(withLocale(req, DEFAULT_LOCALE)), DEFAULT_LOCALE)
  }

  // Unpraefixiert: Cookie-Sprachpraeferenz mittragen, damit die Sprache beim
  // Seitenwechsel ueber prefix-freie Links erhalten bleibt. Nicht-de-Praeferenz ->
  // 307 auf die praefixierte Locale-URL (loop-frei: /en/.. wird oben direkt serviert).
  // Crawler / Erstbesuch OHNE Cookie -> de (canonical, indexierbar) — der Cookie
  // wird nie serverseitig vorausgesetzt, nur respektiert.
  const cookieLoc = req.cookies.get(LOCALE_COOKIE)?.value
  if (cookieLoc && cookieLoc !== DEFAULT_LOCALE && LOCALE_SET.has(cookieLoc)) {
    return NextResponse.redirect(
      new URL(`/${cookieLoc}${pathname === '/' ? '' : pathname}${search}`, req.url),
      307,
    )
  }

  // de-Cookie oder kein Cookie -> de ausliefern (intern /de/<pfad>) + Cookie=de merken.
  const target = pathname === '/' ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`
  return rememberLocale(
    NextResponse.rewrite(new URL(`${target}${search}`, req.url), withLocale(req, DEFAULT_LOCALE)),
    DEFAULT_LOCALE,
  )
}

export const config = {
  // Alle Pfade ausser Next-Internals, API, OG-Image-Metadata-Route und statischen
  // Files (mit Datei-Endung: sitemap.xml/robots.txt/feed.json/llms.txt/favicon.ico).
  matcher: ['/((?!_next/|api/|opengraph-image|.*\\.[^/]+$).*)'],
}
