import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

// 2026-05-09: Domain-Split — claimondo.de = Marketing, app.claimondo.de = App.
// Marketing-Pages auf app.* werden 301 auf claimondo.de redirected (kein
// Duplicate-Content für Google). App-Pages auf claimondo.de werden 301 auf
// app.* redirected (saubere UX, klare Trennung).
const APP_PREFIXES = [
  '/admin', '/dispatch', '/gutachter/', '/kunde', '/faelle', '/flow',
  '/upload', '/sv', '/kunde-termin', '/ablehnen',
  '/passwort-vergessen', '/passwort-zuruecksetzen', '/passwort-aendern',
]

const MARKETING_PREFIXES = [
  '/vorteile', '/wie-es-funktioniert', '/faq', '/kfz-gutachter',
  '/gutachter-finden', '/gutachter-partner', '/ueber-uns',
  '/impressum', '/datenschutz', '/agb', '/nutzungsbedingungen',
]

function matchesAnyPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))
}

// Subdomain-Routing: gutachter.claimondo.de → /gutachter-partner/*
// Muss als Early-Return VOR updateSession laufen, damit der Rewrite
// nicht durch den Auth-Guard als unprotected Route durchfällt.
// VPS-Merge 2026-05-09: proxy.ts (updateSession) + middleware.ts (subdomain)
// in eine Datei konsolidiert — Next.js 16 erlaubt nur einen Middleware-Einstieg.
export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname

  // Subdomain gutachter.claimondo.de — Partner-Recruiting
  if (hostname === 'gutachter.claimondo.de') {
    const url = request.nextUrl.clone()
    if (!pathname.startsWith('/gutachter-partner')) {
      url.pathname = `/gutachter-partner${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // App-Subdomain (app.claimondo.de): alle Responses mit X-Robots-Tag noindex versehen
  // und /robots.txt explizit als Disallow: / ausliefern. Verhindert Indexierung der
  // App-Subdomain selbst wenn Google sie über Links findet.
  if (hostname === 'app.claimondo.de') {
    if (pathname === '/robots.txt') {
      return new NextResponse(
        'User-agent: *\nDisallow: /\nAllow: /login\nAllow: /passwort-vergessen\n',
        { status: 200, headers: { 'content-type': 'text/plain' } },
      )
    }
    // /login + /passwort-vergessen bleiben crawlbar (kein noindex)
    const isPublicAppPath = pathname === '/login' || pathname.startsWith('/passwort-')
    const response = await updateSession(request)
    if (!isPublicAppPath) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    }
    return response
  }

  // 301-Redirects zwischen Hauptdomain und App-Subdomain
  const isAppRoute = matchesAnyPrefix(pathname, APP_PREFIXES)
  const isMarketingRoute = pathname === '/' || matchesAnyPrefix(pathname, MARKETING_PREFIXES)

  if (hostname === 'app.claimondo.de' && isMarketingRoute) {
    // Marketing-Page auf App-Subdomain → 301 zu Hauptdomain
    const url = new URL(request.url)
    url.hostname = 'claimondo.de'
    url.protocol = 'https:'
    url.port = ''
    return NextResponse.redirect(url, 301)
  }

  if ((hostname === 'claimondo.de' || hostname === 'www.claimondo.de') && isAppRoute) {
    // App-Page auf Hauptdomain → 301 zur App-Subdomain
    const url = new URL(request.url)
    url.hostname = 'app.claimondo.de'
    url.protocol = 'https:'
    url.port = ''
    return NextResponse.redirect(url, 301)
  }

  // www.claimondo.de → claimondo.de (kanonische Form, vermeidet Duplicate-Content)
  if (hostname === 'www.claimondo.de') {
    const url = new URL(request.url)
    url.hostname = 'claimondo.de'
    url.protocol = 'https:'
    url.port = ''
    return NextResponse.redirect(url, 301)
  }

  return await updateSession(request)
}

export const config = {
  // Matcher aus proxy.ts übernommen (vollständiger Exclusion-Katalog):
  // .glb → Mapbox 3D-Modell; .js/.json → sw.js + manifest.json;
  // .obj/.mtl → Three.js OBJLoader; Rest → Standard Next.js-Artefakte.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|obj|mtl|hdr|ktx2|woff|woff2|mp4|webm|js|json|txt|xml)$).*)',
  ],
}
