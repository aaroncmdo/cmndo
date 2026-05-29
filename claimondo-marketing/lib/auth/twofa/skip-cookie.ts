'use server'

// AAR-2fa-loop-fix: Wenn ein User auf /login/2fa landet aber gar keine 2FA
// aktiviert hat (twofa_aktiviert=false oder NULL), würde ein Server-Component-
// `redirect()` zu einem Loop führen, weil die Middleware das fehlende
// `claimondo_2fa_verified`-Cookie sieht und sofort wieder zu /login/2fa
// schickt. Server-Components können selbst keine Cookies setzen — daher
// rendert die Page bei !zweiFaAktiv einen Client der diese Server-Action
// aufruft. Action setzt das Cookie zuverlässig + Client navigiert.

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function markTwoFaSkipForInactive(): Promise<{
  ok: boolean
  error?: string
}> {
  // Auth-Check: nur eingeloggte User dürfen das Cookie setzen
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // Defensive Re-Check: das Cookie soll WIRKLICH nur gesetzt werden wenn
  // der User keine 2FA aktiviert hat. Sonst könnte ein Angreifer mit
  // Sub-Resource-Zugriff die 2FA umgehen.
  const { data: profile } = await supabase
    .from('profiles')
    .select('twofa_aktiviert, twofa_email_aktiviert')
    .eq('id', user.id)
    .single()

  const zweiFaAktiv =
    profile?.twofa_aktiviert === true || profile?.twofa_email_aktiviert === true
  if (zweiFaAktiv) {
    return { ok: false, error: '2FA ist aktiv — Skip nicht erlaubt' }
  }

  const cookieStore = await cookies()
  cookieStore.set('claimondo_2fa_verified', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // 3 Tage Persistenz — überlebt Browser-Close-Race auf Mobile,
    // wird beim nächsten Login durch die Login-Action explizit gelöscht
    // damit „2FA pro Anmeldung" weiter gilt.
    maxAge: 3 * 24 * 60 * 60,
  })

  return { ok: true }
}
