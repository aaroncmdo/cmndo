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

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') throw new Error('Nur Admins')
  return supabase
}

export async function createMitarbeiter(formData: FormData): Promise<{ email: string; password: string }> {
  await requireAdmin()
  const email = (formData.get('email') as string).trim().toLowerCase()
  const vorname = (formData.get('vorname') as string).trim()
  const nachname = (formData.get('nachname') as string).trim()
  const rolle = formData.get('rolle') as string
  const kategorie = (formData.get('kategorie') as string | null) || null
  const kapazitaet = parseInt(formData.get('kapazitaet_max') as string) || 100
  if (!email || !vorname || !nachname || !rolle) throw new Error('Alle Felder sind erforderlich')

  const password = generatePassword()
  const admin = createAdminClient()
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { vorname, nachname },
  })
  if (createError) throw new Error(`Benutzer erstellen fehlgeschlagen: ${createError.message}`)

  const { error: profileError } = await admin.from('profiles').upsert({
    id: newUser.user.id, email, vorname, nachname, rolle,
    force_password_change: true, auth_provider: 'email',
    kategorie, kapazitaet_max: kapazitaet, aktiv: true,
    eingestellt_am: new Date().toISOString().split('T')[0],
  })
  if (profileError) throw new Error(`Profil erstellen fehlgeschlagen: ${profileError.message}`)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  await sendEmail({
    to: email, subject: 'Einladung zu Claimondo', heading: 'Willkommen bei Claimondo!',
    lines: [
      `Hallo ${vorname},`,
      `Sie wurden als <strong style="color:#fff">${rolle}</strong> zu Claimondo eingeladen.`,
      `E-Mail: <strong style="color:#fff">${email}</strong>`,
      `Einmalpasswort: <strong style="color:#fff">${password}</strong>`,
    ],
    ctaLabel: 'Jetzt einloggen', ctaUrl: `${appUrl}/login`,
  })
  return { email, password }
}

export async function updateMitarbeiter(formData: FormData) {
  const supabase = await requireAdmin()
  const id = formData.get('id') as string
  const updates: Record<string, unknown> = {}
  for (const key of ['vorname', 'nachname', 'telefon', 'position', 'gehaltsstufe', 'kategorie']) {
    const val = formData.get(key) as string | null
    if (val !== null) updates[key] = val || null
  }
  const gehalt = formData.get('gehalt_brutto') as string | null
  if (gehalt) updates.gehalt_brutto = parseFloat(gehalt) || null
  const kap = formData.get('kapazitaet_max') as string | null
  if (kap) updates.kapazitaet_max = parseInt(kap) || 100
  const eingestellt = formData.get('eingestellt_am') as string | null
  if (eingestellt) updates.eingestellt_am = eingestellt
  const aktiv = formData.get('aktiv') as string | null
  if (aktiv !== null) updates.aktiv = aktiv === 'true'

  const { error } = await supabase.from('profiles').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function createIncentive(formData: FormData) {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('incentives').insert({
    titel: formData.get('titel') as string,
    beschreibung: (formData.get('beschreibung') as string) || null,
    kategorie: formData.get('kategorie') as string,
    typ: formData.get('typ') as string,
    bedingung: formData.get('bedingung') as string,
    wert: parseFloat(formData.get('wert') as string) || 0,
    aktiv: true,
    gueltig_ab: (formData.get('gueltig_ab') as string) || null,
    gueltig_bis: (formData.get('gueltig_bis') as string) || null,
  })
  if (error) throw new Error(error.message)
}

export async function toggleIncentive(id: string, aktiv: boolean) {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('incentives').update({ aktiv }).eq('id', id)
  if (error) throw new Error(error.message)
}
