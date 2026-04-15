import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// BUG-83 Befund 7: gleiche Konstante wie in server.ts.
const REMEMBER_COOKIE_NAME = 'cm_remember'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function updateSession(request: NextRequest) {
  // Collect cookies that need to be set on the response
  const cookiesToUpdate: { name: string; value: string; options: Record<string, unknown> }[] = []

  // BUG-83 Befund 7: User-Wahl "Angemeldet bleiben" wird in cm_remember
  // gespeichert. Bei Refresh-Token-Rotation respektiert die Middleware
  // diese Wahl, sonst wuerden Session-Cookies versehentlich zu langlebigen
  // werden sobald supabase einen Token rotiert.
  const remember = request.cookies.get(REMEMBER_COOKIE_NAME)?.value !== '0'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: remember
        ? { maxAge: ONE_YEAR_SECONDS, path: '/', sameSite: 'lax' }
        : { maxAge: undefined, path: '/', sameSite: 'lax' },
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
              ? opts
              : { ...opts, maxAge: undefined, expires: undefined }
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

  // CRITICAL: getUser() kann bei korrupten Cookies intern crashen.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result?.data?.user ?? null
  } catch {
    user = null
  }

  // KFZ-148 Lueckenfix (BUG-A.1): x-pathname Header injizieren damit Server
  // Components / Layouts den aktuellen Pfad zuverlaessig lesen koennen
  // (statt sich auf non-standard x-next-url / x-invoke-path zu verlassen).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  // Build response
  let response: NextResponse

  // AAR-111: Reihenfolge gefixt — 2FA-Check MUSS vor Admin-Rollen-Check greifen,
  // sonst umgehen Admin-User den 2FA-Flow komplett solange sie unter /admin/* bleiben.

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    // Nicht eingeloggt + nicht public → /login
    response = NextResponse.redirect(new URL('/login', request.url))
  } else if (user && !isPublicPath(request.nextUrl.pathname) && request.nextUrl.pathname !== '/login/2fa') {
    // Eingeloggt + geschützter Pfad (auch /admin/*): ZUERST 2FA-Check (KFZ-184)
    const isGoogleUser = user.app_metadata?.provider === 'google'
    const has2faCookie = request.cookies.get('claimondo_2fa_verified')?.value === '1'
    const hasRememberCookie = !!request.cookies.get('claimondo_remember')?.value

    if (!isGoogleUser && !has2faCookie && !hasRememberCookie) {
      response = NextResponse.redirect(new URL('/login/2fa', request.url))
    } else if (request.nextUrl.pathname.startsWith('/admin')) {
      // 2FA OK → Admin-Rollen-Check (KFZ-203: Dispatch-User darf nicht auf /admin/*)
      const rolle = (user.app_metadata?.rolle ?? user.user_metadata?.rolle) as string | undefined
      if (rolle === 'dispatch') {
        response = NextResponse.redirect(new URL('/dispatch/dashboard', request.url))
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
    // AAR-134: SV-Token-Ablehnung via Email-Link (kein Login nötig)
    '/ablehnen',
    '/agb',
    '/nutzungsbedingungen',
    '/datenschutz',
    '/impressum',
  ]
  return publicPaths.some(path => pathname.startsWith(path))
}
