import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// BUG-83 Befund 7: gleiche Konstante wie in server.ts.
const REMEMBER_COOKIE_NAME = 'cm_remember'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// 2026-05-12: Hinter nginx-Reverse-Proxy ist request.url der INTERNE
// Listen-Origin (z.B. http://0.0.0.0:3001). Redirects gebaut mit
// externalUrl(request, '/login') landeten deshalb auf '0.0.0.0:3001/login'.
// Wir bauen die externe URL stattdessen aus den X-Forwarded-Headers,
// fallen auf 'host' zurueck, und erst danach auf request.url (lokaler Dev).
function externalUrl(request: NextRequest, path: string): URL {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    return new URL(path, `${forwardedProto ?? 'https'}://${forwardedHost}`)
  }
  const host = request.headers.get('host')
  if (host) {
    const proto = forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return new URL(path, `${proto}://${host}`)
  }
  return new URL(path, request.url)
}

export async function updateSession(request: NextRequest) {
  // AAR-622: Public-Path-Kurzschluss — kein Supabase-Client, kein Auth-Call,
  // kein GoTrue-Hit für Crons (/api/*), Landing-Pages und Login-Flows.
  // Vorher lief getUser() (HTTP-Call zu GoTrue) auf JEDEM Request inkl.
  // der ~15 Cron-Endpoints die alle 5-30 Min feuern → GoTrue-Überlastung.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Collect cookies that need to be set on the response
  const cookiesToUpdate: { name: string; value: string; options: Record<string, unknown> }[] = []

  // BUG-83 Befund 7: User-Wahl "Angemeldet bleiben" wird in cm_remember
  // gespeichert. Bei Refresh-Token-Rotation respektiert die Middleware
  // diese Wahl, sonst wuerden Session-Cookies versehentlich zu langlebigen
  // werden sobald supabase einen Token rotiert.
  const remember = request.cookies.get(REMEMBER_COOKIE_NAME)?.value !== '0'

  // AAR-login-loop: gleiche Domain-Logik wie in server.ts — alle Auth-Cookies
  // auf .claimondo.de setzen damit claimondo.de ↔ app.claimondo.de teilen.
  const cookieDomain = process.env.NODE_ENV === 'production' ? '.claimondo.de' : undefined

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: remember
        ? { maxAge: ONE_YEAR_SECONDS, path: '/', sameSite: 'lax', domain: cookieDomain }
        : { maxAge: undefined, path: '/', sameSite: 'lax', domain: cookieDomain },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // CRITICAL FIX: Do NOT call request.cookies.set() — it corrupts
          // the cookie store in Next.js 16 proxy and causes TypeError.
          // Instead, collect cookies and apply them only to the response.
          cookiesToUpdate.push(...cookiesToSet.map(c => {
            const opts = c.options ?? {}
            // Wenn remember=false, hartes Session-Cookie erzwingen.
            const finalOpts = remember
              ? { ...opts, domain: cookieDomain }
              : { ...opts, maxAge: undefined, expires: undefined, domain: cookieDomain }
            return {
              name: c.name,
              value: c.value,
              options: finalOpts,
            }
          }))
        },
      },
    }
  )

  // AAR-622: getUser() bleibt für geschützte Pfade — getSession() kann bei
  // abgelaufenem Token null zurückgeben ohne GoTrue zu fragen, was jeden
  // eingeloggten User fälschlicherweise auf /login schickt. Der große Gewinn
  // (Crons, public paths) kommt vom Early-Return oben, nicht von hier.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result?.data?.user ?? null
  } catch {
    user = null
  }

  // Build response — public paths sind bereits oben per Early-Return raus.
  // AAR-111: Reihenfolge gefixt — 2FA-Check MUSS vor Admin-Rollen-Check greifen,
  // sonst umgehen Admin-User den 2FA-Flow komplett solange sie unter /admin/* bleiben.
  let response: NextResponse

  if (!user) {
    // Nicht eingeloggt + geschützter Pfad → /login
    response = NextResponse.redirect(externalUrl(request, '/login'))
  } else if (request.nextUrl.pathname !== '/login/2fa') {
    // Eingeloggt + geschützter Pfad (auch /admin/*): ZUERST 2FA-Check (KFZ-184)
    const isGoogleUser = user.app_metadata?.provider === 'google'
    const has2faCookie = request.cookies.get('claimondo_2fa_verified')?.value === '1'
    const hasRememberCookie = !!request.cookies.get('claimondo_remember')?.value

    // /gutachter-Portal hat kein 2FA — SVs werden direkt durchgelassen
    const isGutachterPath = request.nextUrl.pathname.startsWith('/gutachter')
    if (!isGoogleUser && !has2faCookie && !hasRememberCookie && !isGutachterPath) {
      response = NextResponse.redirect(externalUrl(request, '/login/2fa'))
    } else if (request.nextUrl.pathname.startsWith('/admin')) {
      // 2FA OK → Admin-Rollen-Check (KFZ-203: Dispatch-User darf nicht auf /admin/*)
      const rolle = (user.app_metadata?.rolle ?? user.user_metadata?.rolle) as string | undefined
      if (rolle === 'dispatch') {
        response = NextResponse.redirect(externalUrl(request, '/dispatch/dashboard'))
      } else {
        response = NextResponse.next({ request: { headers: requestHeaders } })
      }
    } else {
      // 2FA OK + kein /admin/* → durchlassen
      response = NextResponse.next({ request: { headers: requestHeaders } })
    }
  } else {
    // Public path oder /login/2fa selbst → durchlassen
    response = NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Apply collected cookie updates to response
  for (const cookie of cookiesToUpdate) {
    response.cookies.set(cookie.name, cookie.value, cookie.options)
  }

  return response
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true
  // Marketing-Premium-Rework 13.05.2026: SEO-Crawler-Endpunkte MÜSSEN
  // unauthenticated erreichbar sein, sonst sieht Googlebot/GPTBot/ClaudeBot
  // beim Fetch der Sitemap/robots.txt einen 307 → /login. Die gesamte
  // Indexierung von claimondo.de wäre damit blockiert.
  if (
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname === '/llms.txt' ||
    pathname === '/llms-full.txt' ||
    pathname === '/opengraph-image' ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico'
  ) return true
  // BUG-84 follow-up: /passwort-vergessen + /passwort-zuruecksetzen muessen
  // unauthenticated erreichbar sein, sonst redirected die Middleware den
  // User der gerade auf den Reset-Link in seiner Mail geklickt hat zu /login
  // und der gesamte Reset-Flow ist tot.
  const publicPaths = [
    '/login',
    '/flow',
    '/api',
    '/passwort-aendern',
    '/passwort-vergessen',
    '/passwort-zuruecksetzen',
    '/sv',
    '/kunde/termin',
    // CMM-40: Re-Termin-Slot-Picker via Magic-Link (no-show-timeout-Cron schickt
    // /kunde/re-termin/[token]). Token-Validierung passiert in der Page selbst,
    // kein Login nötig — sonst landet der Empfänger auf /login statt im Picker.
    '/kunde/re-termin',
    // 2026-05-08: Token-basierter Termin-Bestätigungs-Pfad analog zu /sv und /upload —
    // Magic-Link aus Email, kein Login nötig. Token-Validierung in der Action.
    '/kunde-termin',
    // AAR-134: SV-Token-Ablehnung via Email-Link (kein Login nötig)
    '/ablehnen',
    // AAR-339: ZB1-Upload-Link (/upload/zb1/[token]) — Kunde hat noch keinen
    // Account beim OCR-Upload; Token-Validierung läuft in der Action selbst
    '/upload',
    '/agb',
    '/nutzungsbedingungen',
    '/datenschutz',
    '/impressum',
    // 2026-05-08: Webform-Lead-Strecke MUSS für anonyme Besucher offen
    // sein — daraus entsteht der Lead, danach Self-Dispatch + Weiterleitung
    // ins Portal. Ohne diesen Eintrag landet der Besucher auf /login und
    // kann gar keinen Schaden melden.
    '/schaden-melden',
    // 2026-05-11: Neue Marketing-Pages aus PR #748 / #749 / #772 — waren
    // in der Allowlist vergessen, anonyme Besucher landeten auf /login.
    '/ersteinschaetzung',
    '/beratung-anfragen',
    '/makler/partner-werden',
    // Weitere bestehende Marketing-Pages explizit, damit nichts mehr unbeabsichtigt
    // hinter den Auth-Guard rutscht:
    '/vorteile',
    '/wie-es-funktioniert',
    '/faq',
    '/ueber-uns',
    '/kfz-gutachter',
    '/gutachter-finden',
    '/gutachter-partner',
    '/schadensreport-2026',
    '/sa-volltext',
    // 2026-05-18: kfzgutachter-Ads-Landeseite (A/B-Test Variante B, noindex).
    // Reine Paid-Traffic-Seite — anonyme Besucher müssen sie ohne Login sehen.
    '/kfzgutachter-lp',
    // 2026-05-22: claimondo.de Content-Render-Routen (Doc 16) — 2 Cornerstones,
    // 57 Haftpflicht-Spokes, 10 Versicherer-Brief-Decoder. MÜSSEN für anonyme
    // Besucher + AI-/Such-Crawler offen sein, sonst 307 → /login und die gesamte
    // Indexierung der Wissens-Surface ist tot.
    '/kfz-haftpflicht-schaden',
    '/ratgeber',
    '/haftpflicht',
    '/decoder',
    // 2026-05-23: Pillar-C /sachverstaendige (8 SV-Verband-Spokes + Hub) — wie die
    // Doc-16 Content-Routen offen fuer anonyme Besucher + AI-/Such-Crawler,
    // sonst 307 -> /login und die Indexierung der SV-Surface ist tot.
    '/sachverstaendige',
    // 2026-05-23: Stream-B Konversions-Hub (Doc 26 Stream B) — wie die Content-
    // Routen offen fuer anonyme Besucher + Crawler, sonst 307 -> /login.
    '/kosten-kfz-gutachten',
  ]
  return publicPaths.some(path => pathname.startsWith(path))
}
