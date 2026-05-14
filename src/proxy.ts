import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

// 2026-05-12: Domain-Layout
//   claimondo.de            — nur Marketing
//   www.claimondo.de        — 301 → claimondo.de
//   app.claimondo.de        — nur Portal (noindex), nackte Subdomain → /login
//   gutachter.claimondo.de  — Recruiting-Landingpage /gutachter-partner (kanonisch)
//   makler.claimondo.de     — Recruiting-Landingpage /makler/partner-werden (kanonisch)
//
// Frühere Konsolidierung: 2026-05-09 Domain-Split, 2026-05-11 middleware.ts → proxy.ts.

// ─── Hosts ──────────────────────────────────────────────────────────────
const HOST_MARKETING = 'claimondo.de'
const HOST_WWW = 'www.claimondo.de'
const HOST_APP = 'app.claimondo.de'
const HOST_GUTACHTER = 'gutachter.claimondo.de'
const HOST_MAKLER = 'makler.claimondo.de'
// 14.05.2026: Legacy-Subdomain, servierte historisch die gleiche Marketing-
// App wie die Hauptdomain (Duplicate-Content-Risiko). Per Aaron-Entscheidung
// (Indexing-Audit-Doc Option A) wird der gesamte Traffic 301 auf
// claimondo.de redirected — eine Canonical-URL pro Marketing-Pfad.
const HOST_KFZGUTACHTER_LEGACY = 'kfzgutachter.claimondo.de'

// ─── Routen-Klassifizierung ─────────────────────────────────────────────
// Portal-/App-Routen — gehören auf app.claimondo.de.
const APP_PREFIXES = [
  '/admin', '/dispatch', '/gutachter/', '/kunde', '/faelle', '/flow',
  '/upload', '/sv', '/kunde-termin', '/ablehnen', '/makler',
  '/login', '/passwort-vergessen', '/passwort-zuruecksetzen', '/passwort-aendern',
]

// Öffentliche Marketing-/Funnel-Routen — bleiben auf claimondo.de.
// Werden auf app.claimondo.de per 301 zurück auf die Hauptdomain geschickt.
const MARKETING_PREFIXES = [
  '/vorteile', '/wie-es-funktioniert', '/faq', '/kfz-gutachter',
  '/gutachter-finden', '/ueber-uns',
  '/schaden-melden', '/ersteinschaetzung', '/beratung-anfragen', '/sa-volltext',
  '/impressum', '/datenschutz', '/agb', '/nutzungsbedingungen',
  '/schadensreport-2026',
]

// Marketing-Landingpages mit eigener Subdomain.
// claimondo.de/<pfad> → 301 auf <host>/   ·   <host>/ → rewrite intern auf <pfad>.
const SUBDOMAIN_LANDINGPAGES: Record<string, string> = {
  '/gutachter-partner': HOST_GUTACHTER,
  '/makler/partner-werden': HOST_MAKLER,
}
// Umkehrung: Subdomain-Host → Landingpage-Pfad (Prod).
const LANDINGPAGE_FOR_HOST: Record<string, string> = {}
for (const [path, host] of Object.entries(SUBDOMAIN_LANDINGPAGES)) {
  LANDINGPAGE_FOR_HOST[host] = path
}

/**
 * Landingpage-Pfad für einen Marketing-Subdomain-Host — deckt Prod
 * (`makler.claimondo.de`) und Staging (`makler.staging.claimondo.de`) ab.
 * Liefert `undefined`, wenn der Host keine Marketing-Subdomain ist.
 */
function landingPathForHost(hostname: string): string | undefined {
  if (LANDINGPAGE_FOR_HOST[hostname]) return LANDINGPAGE_FOR_HOST[hostname]
  // Staging-Varianten: <name>.staging.claimondo.de → wie <name>.claimondo.de
  const stagingMatch = /^([^.]+)\.staging\.claimondo\.de$/.exec(hostname)
  if (stagingMatch) {
    const prodHost = `${stagingMatch[1]}.claimondo.de`
    return LANDINGPAGE_FOR_HOST[prodHost]
  }
  return undefined
}

function isStagingHost(hostname: string): boolean {
  return hostname.endsWith('.staging.claimondo.de')
}

function matchesAnyPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))
}

/** 301 auf denselben Pfad/Query unter anderem Host; mit `pathname` zusätzlich den Pfad ersetzen. */
function redirectToHost(request: NextRequest, hostname: string, pathname?: string): NextResponse {
  const url = new URL(request.url)
  url.hostname = hostname
  url.protocol = 'https:'
  url.port = ''
  if (pathname !== undefined) {
    url.pathname = pathname
    url.search = ''
  }
  return NextResponse.redirect(url, 301)
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname
  const isApi = pathname.startsWith('/api/')

  // ─── kfzgutachter.claimondo.de — Legacy-Subdomain → 301 auf Hauptdomain ─
  // 14.05.2026 Indexing-Audit (siehe docs/13.05.2026/marketing-rework/
  // INDEXIERUNG-SUBDOMAINS.md). Subdomain servierte exakte Duplikate der
  // 90 Hauptdomain-URLs — SERP-Cannibalization-Risiko. Path bleibt erhalten,
  // damit alte Backlinks/Bookmarks wie `kfzgutachter.claimondo.de/kfz-
  // gutachter/koeln` → `claimondo.de/kfz-gutachter/koeln` resolven.
  if (hostname === HOST_KFZGUTACHTER_LEGACY) {
    return redirectToHost(request, HOST_MARKETING)
  }

  // ─── Marketing-Subdomains (gutachter. / makler. — Prod + Staging) ─────
  const subdomainLandingPath = landingPathForHost(hostname)
  if (subdomainLandingPath) {
    // /api/* unverändert durchreichen (Health-Checks etc. — nicht umschreiben).
    if (isApi) return await updateSession(request)
    // Root → intern die Landingpage rendern, Adresszeile bleibt "/".
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = subdomainLandingPath
      return NextResponse.rewrite(url)
    }
    // Direkter Aufruf des langen Pfads → auf die kanonische "/" umleiten.
    if (pathname === subdomainLandingPath) {
      return NextResponse.redirect(new URL('/', request.url), 301)
    }
    // Staging: keinen Cross-Host-Redirect auf die Prod-Domain — einfach rendern.
    if (isStagingHost(hostname)) return await updateSession(request)
    // Prod: alles andere (Logo, Nav, Legal, Cross-Links) → zurück auf die Hauptdomain.
    return redirectToHost(request, HOST_MARKETING)
  }

  // ─── app.claimondo.de — nur Portal ────────────────────────────────────
  if (hostname === HOST_APP) {
    // Eigene robots.txt: App-Subdomain komplett aus dem Index halten.
    if (pathname === '/robots.txt') {
      return new NextResponse(
        'User-agent: *\nDisallow: /\nAllow: /login\nAllow: /passwort-vergessen\n',
        { status: 200, headers: { 'content-type': 'text/plain' } },
      )
    }
    if (isApi) return await updateSession(request)
    // Nackte App-Subdomain → direkt ins Login.
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Marketing-Landingpage versehentlich auf app.* → auf ihre eigene Subdomain.
    const landingHost = SUBDOMAIN_LANDINGPAGES[pathname]
    if (landingHost) return redirectToHost(request, landingHost, '/')
    // Sonstige Marketing-/Funnel-Routen → zurück auf die Hauptdomain.
    if (matchesAnyPrefix(pathname, MARKETING_PREFIXES)) {
      return redirectToHost(request, HOST_MARKETING)
    }
    // Echte App-Route (oder Unbekanntes): Session-Refresh + noindex (außer Login/Passwort).
    const isPublicAppPath = pathname === '/login' || pathname.startsWith('/passwort-')
    const response = await updateSession(request)
    if (!isPublicAppPath) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    }
    return response
  }

  // ─── www.claimondo.de → claimondo.de (kanonische Form) ────────────────
  if (hostname === HOST_WWW) {
    return redirectToHost(request, HOST_MARKETING)
  }

  // ─── claimondo.de (Hauptdomain, Marketing) ────────────────────────────
  if (hostname === HOST_MARKETING) {
    // Subdomain-Landingpages: alter Pfad → eigene Subdomain.
    // MUSS vor dem APP_PREFIXES-Check stehen — /makler/partner-werden matcht
    // sonst das /makler-App-Prefix und ginge fälschlich auf app.claimondo.de.
    const landingHost = SUBDOMAIN_LANDINGPAGES[pathname]
    if (landingHost) return redirectToHost(request, landingHost, '/')
    // App-/Portal-Routen → app.claimondo.de.
    if (!isApi && matchesAnyPrefix(pathname, APP_PREFIXES)) {
      return redirectToHost(request, HOST_APP)
    }
    return await updateSession(request)
  }

  // ─── localhost / Vercel-Previews / *.staging.claimondo.de ─────────────
  return await updateSession(request)
}

export const config = {
  // Vollständiger Exclusion-Katalog:
  // .glb → Mapbox 3D-Modell; .js/.json → sw.js + manifest.json;
  // .obj/.mtl → Three.js OBJLoader; Rest → Standard Next.js-Artefakte.
  // robots.txt und sitemap.xml MÜSSEN durch den Proxy (app.claimondo.de
  // braucht eine eigene robots.txt). txt/xml deshalb NICHT im Exclusion-Pattern.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|obj|mtl|hdr|ktx2|woff|woff2|mp4|webm|js|json)$).*)',
  ],
}
