'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length]
  }
  return password
}

export async function createMitarbeiter(formData: FormData): Promise<{ email: string; password: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  // Verify caller is admin
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  if (callerProfile?.rolle !== 'admin') {
    throw new Error('Nur Admins koennen Mitarbeiter erstellen')
  }

  const email = (formData.get('email') as string).trim().toLowerCase()
  const vorname = (formData.get('vorname') as string).trim()
  const nachname = (formData.get('nachname') as string).trim()
  const rolle = formData.get('rolle') as string

  if (!email || !vorname || !nachname || !rolle) {
    throw new Error('Alle Felder sind erforderlich')
  }

  const password = generatePassword()

  // Create auth user with admin client
  const admin = createAdminClient()
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { vorname, nachname },
  })

  if (createError) {
    throw new Error(`Benutzer erstellen fehlgeschlagen: ${createError.message}`)
  }

  // Create profile
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: newUser.user.id,
      email,
      vorname,
      nachname,
      rolle,
      force_password_change: true,
      auth_provider: 'email',
    })

  if (profileError) {
    throw new Error(`Profil erstellen fehlgeschlagen: ${profileError.message}`)
  }

  // Send invitation email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  await sendEmail({
    to: email,
    subject: 'Einladung zu Claimondo',
    heading: 'Willkommen bei Claimondo!',
    lines: [
      `Hallo ${vorname},`,
      `Sie wurden als <strong style="color:#fff">${rolle}</strong> zu Claimondo eingeladen.`,
      `Ihre Zugangsdaten:`,
      `E-Mail: <strong style="color:#fff">${email}</strong>`,
      `Einmalpasswort: <strong style="color:#fff">${password}</strong>`,
      `Bitte aendern Sie Ihr Passwort beim ersten Login.`,
    ],
    ctaLabel: 'Jetzt einloggen',
    ctaUrl: `${appUrl}/login`,
  })

  return { email, password }
}
