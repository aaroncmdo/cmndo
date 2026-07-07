import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// BUG-83 Befund 7: gleiche Konstante wie in server.ts.
const REMEMBER_COOKIE_NAME = 'cm_remember'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// Marketing-Login-Persistenz (Bug B, 2026-07-07): Session-Refresh fuer die
// (Locale-)Middleware. claimondo.de hat KEINE Auth-Middleware — middleware.ts
// macht nur Locale-Routing. Auf oeffentlichen Content-Seiten (Wissen/Ratgeber/
// Community-Feed) wurde die Supabase-Session dadurch nie serverseitig refresht;
// RSC kann rotierte Cookies nicht persistieren -> nach Access-Token-Ablauf sah
// SSR-getUser() (z.B. getAuthState im Kommentar-Formular / Feed-Composer) keine
// Session mehr, der Nutzer wirkte ausgeloggt und der Community-Nutzername
// "verloren".
//
// refreshSession() ist REIN ADDITIV: es setzt nur rotierte Auth-Cookies auf die
// bereits gebaute Response, NUR wenn ein Auth-Cookie anliegt (anon/Crawler/Cron
// = Fast-Path, kein GoTrue-Hit), und ist komplett try/catch-gewrappt -> das
// Locale-Routing bleibt zu 100% unberuehrt (ein Refresh-Fehler kann die Seite
// NIE brechen). Ersetzt die frueher hier aus der App kopierte, in Marketing aber
// NIE verdrahtete updateSession() (dead code aus dem Marketing-Split).
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  try {
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
    if (!hasAuthCookie) return // anonymer Traffic/Crawler/Cron -> kein Supabase-Client, kein GoTrue-Hit

    const remember = request.cookies.get(REMEMBER_COOKIE_NAME)?.value !== '0'
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
            // Rotierte Cookies direkt auf die (bereits gebaute) Response schreiben.
            cookiesToSet.forEach(({ name, value, options }) => {
              const finalOpts = remember
                ? { ...options, domain: cookieDomain }
                : { ...options, maxAge: undefined, expires: undefined, domain: cookieDomain }
              response.cookies.set(name, value, finalOpts)
            })
          },
        },
      },
    )

    // getUser() triggert bei abgelaufenem Access-Token den Refresh via
    // Refresh-Token; setAll schreibt die rotierten Cookies auf die Response.
    await supabase.auth.getUser()
  } catch {
    // Refresh-Fehler duerfen die Seite NIE brechen — die un-refreshte Response
    // (Locale-Routing) bleibt gueltig.
  }
}
