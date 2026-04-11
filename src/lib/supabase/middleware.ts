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

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    response = NextResponse.redirect(new URL('/login', request.url))
  } else if (user && request.nextUrl.pathname.startsWith('/admin')) {
    // KFZ-203: Dispatch-User darf nicht auf /admin/*
    // Check via app_metadata.rolle (gesetzt via admin.auth.admin.updateUserById bei Rollenzuweisung)
    // Fallback: Layout-Check in /admin/layout.tsx prüft profiles.rolle
    const rolle = (user.app_metadata?.rolle ?? user.user_metadata?.rolle) as string | undefined
    if (rolle === 'dispatch') {
      response = NextResponse.redirect(new URL('/dispatch/dashboard', request.url))
    } else {
      response = NextResponse.next({ request: { headers: requestHeaders } })
    }
  } else if (user && !isPublicPath(request.nextUrl.pathname) && request.nextUrl.pathname !== '/login/2fa') {
    // KFZ-184: 2FA-Check — wenn User eingeloggt aber 2FA pending
    // Google-OAuth-User skippen 2FA (provider check via app_metadata)
    const isGoogleUser = user.app_metadata?.provider === 'google'
    const has2faCookie = request.cookies.get('claimondo_2fa_verified')?.value === '1'
    const hasRememberCookie = !!request.cookies.get('claimondo_remember')?.value

    if (!isGoogleUser && !has2faCookie && !hasRememberCookie) {
      // Prüfe ob User 2FA aktiviert hat (via twofa_aktiviert Default true)
      // Da wir in der Middleware keinen DB-Call machen wollen, setzen wir
      // das 2fa_verified Cookie nach erfolgreichem Verify in /login/2fa.
      // Wenn das Cookie fehlt UND kein remember-token: redirect zu 2FA.
      // Beim allerersten Login nach Deploy: Cookie fehlt → 2FA-Page.
      // HINWEIS: Wenn twofa_aktiviert=false soll die 2FA-Page selbst
      // direkt weiterleiten (passiert im Server Component).
      response = NextResponse.redirect(new URL('/login/2fa', request.url))
    } else {
      response = NextResponse.next({ request: { headers: requestHeaders } })
    }
  } else {
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
    '/agb',
    '/nutzungsbedingungen',
    '/datenschutz',
    '/impressum',
  ]
  return publicPaths.some(path => pathname.startsWith(path))
}
