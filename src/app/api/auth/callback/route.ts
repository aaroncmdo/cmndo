import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { roleToPath } from '@/lib/auth/role-redirect'

// AAR-718: Das frühere lokale ROLE_REDIRECT-Mapping enthielt falsche Ziele
// (Kanzlei → /admin statt /kanzlei/dashboard) und fehlende Rollen (dispatch,
// kundenbetreuer, makler). Jetzt nutzt der OAuth-Callback dieselbe zentrale
// roleToPath-Funktion wie der Email-Login + die 2FA-Page.

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const user = (await supabase.auth.getUser())?.data?.user ?? null
      if (user) {
        // Update auth_provider to google and disable force_password_change
        await supabase
          .from('profiles')
          .update({ auth_provider: 'google', force_password_change: false })
          .eq('id', user.id)

        // Get role for redirect
        const { data: profile } = await supabase
          .from('profiles')
          .select('rolle')
          .eq('id', user.id)
          .single()

        const dest = roleToPath(profile?.rolle as string | null | undefined)
        return NextResponse.redirect(`${origin}${dest}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=OAuth+fehlgeschlagen`)
}
