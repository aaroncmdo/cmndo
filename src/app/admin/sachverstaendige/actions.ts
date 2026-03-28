'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createSachverstaendiger(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const email = (formData.get('email') as string)?.trim()
  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null
  const paket = (formData.get('paket') as string) || 'starter-10'
  const gebietPlzRaw = (formData.get('gebiet_plz') as string)?.trim() || ''
  const maxFaelle = parseInt(formData.get('max_faelle_monat') as string) || 10

  if (!email) throw new Error('E-Mail ist erforderlich')

  const gebietPlz = gebietPlzRaw
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(Boolean)

  // Create auth user via admin API (requires service role key)
  const admin = createAdminClient()
  const tempPassword = crypto.randomUUID().slice(0, 12)

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authErr) throw new Error(`User erstellen fehlgeschlagen: ${authErr.message}`)

  // Create profile
  const { error: profileErr } = await admin
    .from('profiles')
    .insert({
      id: authUser.user.id,
      email,
      rolle: 'sachverstaendiger',
      vorname,
      nachname,
      telefon,
    })

  if (profileErr) throw new Error(`Profil erstellen fehlgeschlagen: ${profileErr.message}`)

  // Create sachverstaendige entry
  const { error: svErr } = await admin
    .from('sachverstaendige')
    .insert({
      profile_id: authUser.user.id,
      paket,
      gebiet_plz: gebietPlz,
      max_faelle_monat: maxFaelle,
    })

  if (svErr) throw new Error(`SV-Eintrag fehlgeschlagen: ${svErr.message}`)

  revalidatePath('/admin/sachverstaendige')

  return { id: authUser.user.id, tempPassword }
}
