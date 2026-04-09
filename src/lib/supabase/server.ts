import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// BUG-83 Befund 7: Marker-Cookie-Name + Default-Lifetime fuer
// "Angemeldet bleiben". Wird auch von middleware.ts gelesen.
export const REMEMBER_COOKIE_NAME = 'cm_remember'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// Service role client — bypasses RLS, use in server actions for admin writes
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function createClient(options: { remember?: boolean } = {}) {
  const cookieStore = await cookies()

  // BUG-83 Befund 7: Wenn `remember` nicht explizit uebergeben wurde, lesen
  // wir den Marker-Cookie. Dadurch erbt jeder createClient()-Aufruf (z.B.
  // im Layout, in Server-Components, in beliebigen Server-Actions) die
  // urspruenglich beim Login gewaehlte Persistenz und middleware
  // ueberschreibt sie nicht versehentlich.
  const remember = options.remember !== undefined
    ? options.remember
    : cookieStore.get(REMEMBER_COOKIE_NAME)?.value !== '0'

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: remember
        ? { maxAge: ONE_YEAR_SECONDS, path: '/', sameSite: 'lax' }
        : { maxAge: undefined, path: '/', sameSite: 'lax' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options: opts }) => {
              // Wenn remember=false, alle Auth-Cookies als Session-Cookies
              // schreiben (kein maxAge → Browser loescht beim Schliessen).
              const finalOpts = remember
                ? opts
                : { ...opts, maxAge: undefined, expires: undefined }
              cookieStore.set(name, value, finalOpts)
            })
          } catch {
            // Server Component kann keine Cookies setzen – ignorieren
          }
        },
      },
    }
  )
}
