import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { roleToPath } from '@/lib/auth/role-redirect'
import { safeContinue } from '@/lib/auth/safe-continue'

// AAR-718: Das frühere lokale ROLE_REDIRECT-Mapping enthielt falsche Ziele
// (Kanzlei → /admin statt /kanzlei/dashboard) und fehlende Rollen (dispatch,
// kundenbetreuer, makler). Jetzt nutzt der OAuth-Callback dieselbe zentrale
// roleToPath-Funktion wie der Email-Login + die 2FA-Page.

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // next wird von Magic-Link-Flows (Kunden-Welcome, Passwort-Reset etc.)
  // mitgeschickt damit der Callback nach Session-Exchange direkt dorthin navigiert.
  const next = searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const user = (await supabase.auth.getUser())?.data?.user ?? null
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('rolle')
          .eq('id', user.id)
          .single()

        const dest = roleToPath(profile?.rolle as string | null | undefined)
        // AAR-login-embed: validiertes continue (Login-Widget) bzw. next
        // (Magic-Link) hat Vorrang vor dem Rollen-Default.
        const cont = safeContinue(searchParams.get('continue') ?? next)
        const target = cont
          ? cont.startsWith('http')
            ? cont
            : `${origin}${cont}`
          : `${origin}${dest}`
        return NextResponse.redirect(target)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=OAuth+fehlgeschlagen`)
}
