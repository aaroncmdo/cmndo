import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

// Komposition: Host-Routing (Subdomains, de-only) × next-intl Locale-Routing
// (claimondo.de/www, as-needed).
//
// Subdomain-Schema (analog dem urspruenglichen Stream "Subdomains -> :3006"):
//   "/"            -> rewrite auf den Landing-Pfad (URL bleibt "/", eine kanonische URL)
//   <landing-pfad> -> 301 auf "/" (haelt die kanonische Form)
//   jeder andere   -> 301 auf claimondo.de/<pfad> (Nav/Legal/Cross-Links)
// Rewrite triggert die Middleware NICHT erneut -> kein Loop.
//
// gutachter./makler./kfzgutachter. sind de-only Single-LPs (KEINE Locale-URLs).
// Da sie die next-intl-Middleware umgehen, muss der Rewrite intern de-praefixiert
// sein (/de/<landing>), damit Next das [locale]-Segment fuellt — sonst wuerde
// "<landing>" als Locale interpretiert und vom [locale]-Layout ge-notFound().

const MAIN_HOST = 'claimondo.de'

const SUBDOMAIN_LANDING: Record<string, string> = {
  'gutachter.claimondo.de': '/gutachter-partner',
  'makler.claimondo.de': '/makler/partner-werden',
  'kfzgutachter.claimondo.de': '/kfzgutachter-lp',
}

const intlMiddleware = createMiddleware(routing)

// Interner Pfad mit Default-Locale-Prefix (das, was next-intl fuer eine
// prefix-freie de-URL intern erzeugt) — fuer die de-only Subdomain-Rewrites.
function deInternal(path: string): string {
  return `/${routing.defaultLocale}${path}`
}

export default function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase()
  const landing = SUBDOMAIN_LANDING[host]

  // Subdomains: de-only Host-Routing, KEINE Locale-Prefixe in der sichtbaren URL.
  if (landing) {
    const { pathname, search } = req.nextUrl
    if (pathname === '/') {
      return NextResponse.rewrite(new URL(`${deInternal(landing)}${search}`, req.url))
    }
    if (pathname === landing) {
      return NextResponse.redirect(new URL(`/${search}`, req.url), 301)
    }
    return NextResponse.redirect(`https://${MAIN_HOST}${pathname}${search}`, 301)
  }

  // claimondo.de / www: next-intl Locale-Routing (as-needed).
  return intlMiddleware(req)
}

export const config = {
  // Alle Pfade ausser: Next-Internals (_next/), API (api/), die OG-Image-
  // Metadata-Route (opengraph-image — liegt locale-frei im Root app/ und darf
  // NICHT locale-umgeschrieben werden) und statische Files (mit Datei-Endung,
  // z.B. sitemap.xml / robots.txt / feed.json / llms.txt / favicon.ico).
  matcher: ['/((?!_next/|api/|opengraph-image|.*\\.[^/]+$).*)'],
}
