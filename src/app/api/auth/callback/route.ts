import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const ROLE_REDIRECT: Record<string, string> = {
  admin: '/admin',
  sachverstaendiger: '/gutachter',
  kunde: '/kunde',
  kanzlei: '/admin',
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
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

        const dest = ROLE_REDIRECT[profile?.rolle ?? ''] ?? '/admin'
        return NextResponse.redirect(`${origin}${dest}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=OAuth+fehlgeschlagen`)
}
