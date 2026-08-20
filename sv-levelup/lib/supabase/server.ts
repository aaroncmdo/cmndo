import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

/**
 * Die Cookie-Domain — abgeleitet vom TATSAECHLICHEN Host, nicht von NODE_ENV.
 *
 * ⚠ Die frühere Fassung setzte `.claimondo.de`, sobald `NODE_ENV` auf
 * `production` stand. Das trifft auch jeden lokalen Standalone-Build: ein
 * Browser auf `localhost` lehnt einen Cookie fuer eine fremde Domain ab, die
 * Anmeldung scheitert dann still und man sucht den Fehler im Code. Gemessen
 * beim Durchlauf am 20.08.
 */
async function ermittleCookieDomain(): Promise<string | undefined> {
  const host = (await headers()).get('host')?.split(':')[0] ?? ''
  return host === 'claimondo.de' || host.endsWith('.claimondo.de') ? '.claimondo.de' : undefined
}

/**
 * Server-Client mit User-Session — RLS greift.
 *
 * ⚠ KORREKTUR (20.08.): Hier stand, das Staff-Gate auf /auswertung brauche
 * kein eigenes Login, weil die Portal-Sitzung subdomain-uebergreifend gelte.
 * Das ist FALSCH. Nachgemessen: `src/lib/supabase/client.ts` setzt seine
 * `cookieOptions` OHNE `domain` — der Cookie der Haupt-App gilt nur fuer
 * `app.claimondo.de` und wird hier nie sichtbar.
 *
 * Die Domain unten wirkt nur in die andere Richtung: eine Anmeldung AUF
 * sv-levelup setzt ihren Cookie auf `.claimondo.de`. Deshalb meldet die
 * Vertriebsansicht selbst an (`/anmelden`), gegen dieselben Konten und
 * dieselbe Datenbank.
 *
 * Ein echtes SSO waere ein Einzeiler in der Haupt-App — und wuerde JEDE
 * laufende Sitzung invalidieren, also alle Nutzer ausloggen. Das ist eine
 * Entscheidung fuer Aaron, nicht fuer ein Nebenprojekt.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const cookieDomain = await ermittleCookieDomain()

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
