import { NextResponse, type NextRequest } from 'next/server'

// Host-Routing für Marketing-Subdomains (Stream: Subdomains -> :3006-Build).
// Schema pro Subdomain (analog docs/.../2026-05-12-marketing-subdomains-...):
//   "/"            -> rewrite auf den Landing-Pfad (URL bleibt "/", eine kanonische URL)
//   <landing-pfad> -> 301 auf "/" (hält die kanonische Form)
//   jeder andere   -> 301 auf claimondo.de/<pfad> (Nav/Legal/Cross-Links)
// Rewrite triggert die Middleware NICHT erneut -> kein Loop.
//
// gutachter. ist AKTIV (Content /gutachter-partner liegt im Build). makler. +
// kfzgutachter. folgen, sobald deren Content migriert ist (dann einkommentieren).

const MAIN_HOST = 'claimondo.de'

const SUBDOMAIN_LANDING: Record<string, string> = {
  'gutachter.claimondo.de': '/gutachter-partner',
  'makler.claimondo.de': '/makler/partner-werden',
  'kfzgutachter.claimondo.de': '/kfzgutachter-lp',
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase()
  const landing = SUBDOMAIN_LANDING[host]
  if (!landing) return NextResponse.next()

  const { pathname, search } = req.nextUrl

  if (pathname === '/') {
    return NextResponse.rewrite(new URL(`${landing}${search}`, req.url))
  }
  if (pathname === landing) {
    return NextResponse.redirect(new URL(`/${search}`, req.url), 301)
  }
  return NextResponse.redirect(`https://${MAIN_HOST}${pathname}${search}`, 301)
}

export const config = {
  // Alle Pfade ausser Next-Internals, API und statischen Files (mit Datei-Endung).
  matcher: ['/((?!_next/|api/|.*\\.[^/]+$).*)'],
}
