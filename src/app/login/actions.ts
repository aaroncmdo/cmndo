'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ROLE_REDIRECT: Record<string, string> = {
  admin: '/admin',
  sachverstaendiger: '/gutachter',
  kunde: '/kunde',
  kanzlei: '/admin',
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    redirect('/login?error=E-Mail+und+Passwort+sind+erforderlich')
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    redirect(`/login?error=${encodeURIComponent(signInError.message)}`)
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect(`/login?error=${encodeURIComponent(userError?.message ?? 'Kein Benutzer gefunden')}`)
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('rolle, force_password_change, auth_provider')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('Profile query failed:', profileError.message, '| User:', user.id)
    redirect(`/login?error=${encodeURIComponent('Profil konnte nicht geladen werden: ' + profileError.message)}`)
  }

  if (!profile?.rolle) {
    redirect('/login?error=Keine+Rolle+im+Profil+hinterlegt')
  }

  // Check if password change is required (only for email auth)
  const authProvider = profile.auth_provider ?? 'email'
  if (profile.force_password_change && authProvider === 'email') {
    redirect('/passwort-aendern')
  }

  const destination = ROLE_REDIRECT[profile.rolle] ?? '/admin'
  redirect(destination)
}
