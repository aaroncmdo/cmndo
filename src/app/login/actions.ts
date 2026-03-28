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

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=Kein+Benutzer+gefunden')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  const destination = (profile?.rolle && ROLE_REDIRECT[profile.rolle]) ?? '/admin'
  redirect(destination)
}
