'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

// AAR-463 F5 / AAR-459 F1 Foundation: Server-Action für Locale-Wechsel.
// Schreibt den Wert in das Cookie `claimondo_locale`. AAR-459 F1 wird
// diese Action durch ein next-intl-kompatibles Pendant ersetzen oder
// erweitern — die Signatur bleibt gleich.

const LOCALE_COOKIE = 'claimondo_locale'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function setLocaleAction(
  newLocale: string,
): Promise<{ success: boolean; locale: Locale; error?: string }> {
  if (!isLocale(newLocale)) {
    return {
      success: false,
      locale: DEFAULT_LOCALE,
      error: `Unbekannte Sprache: ${newLocale}`,
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, newLocale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  })

  // Landing + alle Server-Components neu rendern damit die Sprach-UI greift.
  revalidatePath('/', 'layout')

  return { success: true, locale: newLocale }
}
