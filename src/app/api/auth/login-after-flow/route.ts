// CMM-14: Hard-redirect Login-Endpoint nach SA-Unterschrift.
//
// Server-Action `redirect()` nach Form-Submit triggert in Next.js eine
// Soft-Navigation via RSC-Stream — und genau dieser Stream-Request rennt
// in einer Race-Condition (Service-Worker-Lifecycle, Cookie-Propagation,
// Hydration) die zu einer weißen Seite führt. Erst ein manueller Reload
// behebt es.
//
// Lösung: klassischer HTTP-Endpoint. Browser-Form-Submit auf POST,
// signInWithPassword setzt Cookies via @supabase/ssr, NextResponse
// redirected mit Status 303 zu /passwort-aendern oder /kunde/onboarding.
// Browser macht eine echte Hard-Navigation — kein RSC-Stream, keine Race.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const origin = new URL(request.url).origin

  if (!email || !password) {
    return NextResponse.redirect(`${origin}/login?error=Login-Daten+fehlen`, 303)
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(signInError.message)}`,
      303,
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=Auth-User+nicht+gefunden`, 303)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('force_password_change, auth_provider')
    .eq('id', user.id)
    .maybeSingle()

  const authProvider = (profile?.auth_provider as string | null) ?? 'email'
  if (profile?.force_password_change && authProvider === 'email') {
    return NextResponse.redirect(`${origin}/passwort-aendern`, 303)
  }
  return NextResponse.redirect(`${origin}/kunde/onboarding`, 303)
}
