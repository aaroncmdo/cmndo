'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

// Portal-i18n F-12: App-scoped Locale-Wechsel fuer das Kunde-Portal.
// Der Marketing-Split (#2121) hat die Marketing-Variante nach
// claimondo-marketing/ ausgelagert; der Monolith (Kunde-Portal) braucht seine
// eigene. Setzt das `claimondo-locale`-Cookie (von src/i18n/request.ts gelesen)
// UND — bei eingeloggten Nutzern — profiles.sprache (SSoT fuers Portal;
// request.ts loest sie auf den /kunde-Routen via resolveUserLocale auf).
const LOCALE_COOKIE = 'claimondo-locale'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function setLocaleAction(
  newLocale: string,
): Promise<{ success: boolean; locale: Locale; error?: string }> {
  if (!isLocale(newLocale)) {
    return { success: false, locale: DEFAULT_LOCALE, error: `Unbekannte Sprache: ${newLocale}` }
  }

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, newLocale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })

  // F-12: Bei eingeloggten Nutzern zusaetzlich nach profiles.sprache
  // persistieren. Cookie gewinnt fuers UX — ein DB-Fehler darf den
  // Sprachwechsel nicht brechen (try/catch, non-critical).
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ sprache: newLocale }).eq('id', user.id)
    }
  } catch (err) {
    console.warn('[Portal-i18n F-12] profiles.sprache Persistenz fehlgeschlagen:', err)
  }

  // Kunde-Layout + Server-Components neu rendern, damit die Sprach-UI greift.
  revalidatePath('/', 'layout')
  return { success: true, locale: newLocale }
}
