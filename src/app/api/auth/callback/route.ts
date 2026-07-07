import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { roleToPath } from '@/lib/auth/role-redirect'
import { safeContinue } from '@/lib/auth/safe-continue'
import { externalOrigin } from '@/lib/external-url'

// AAR-718: Das frühere lokale ROLE_REDIRECT-Mapping enthielt falsche Ziele
// (Kanzlei → /admin statt /kanzlei/dashboard) und fehlende Rollen (dispatch,
// kundenbetreuer, makler). Jetzt nutzt der OAuth-Callback dieselbe zentrale
// roleToPath-Funktion wie der Email-Login + die 2FA-Page.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // externalOrigin statt request.url-origin: hinter dem nginx/PM2-Proxy
  // ist der request.url-Origin die interne Bind-Adresse (0.0.0.0:3000 Prod /
  // 0.0.0.0:3001 Staging) — ein Redirect dorthin schickt den Kunden auf eine
  // unerreichbare Adresse. Betraf den Magic-Link-Login aus der Kunden-Welcome-Mail.
  const appOrigin = externalOrigin(request)
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
            : `${appOrigin}${cont}`
          : `${appOrigin}${dest}`
        return NextResponse.redirect(target)
      }
    }
  }

  return NextResponse.redirect(`${appOrigin}/login?error=OAuth+fehlgeschlagen`)
}
