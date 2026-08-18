import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-Client mit User-Session — RLS greift.
 *
 * Die Cookie-Domain `.claimondo.de` ist der Grund, warum das Staff-Gate auf
 * /auswertung/[token] ohne eigenes Login-System funktioniert: die Sitzung des
 * Claimondo-Portals gilt subdomain-uebergreifend (Design-Spec §5.3).
 * Uebernommen aus claimondo-marketing/lib/supabase/server.ts.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const cookieDomain = process.env.NODE_ENV === 'production' ? '.claimondo.de' : undefined

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { path: '/', sameSite: 'lax', domain: cookieDomain },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, { ...options, domain: cookieDomain })
            })
          } catch {
            // Server Component kann keine Cookies setzen — ignorieren
          }
        },
      },
    },
  )
}
