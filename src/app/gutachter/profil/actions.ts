'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateProfil(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ vorname, nachname, telefon })
    .eq('id', user.id)

  if (profileErr) throw new Error(profileErr.message)

  // Update sachverstaendige fields
  const gebiet_plz = (formData.get('gebiet_plz') as string)?.trim() || null
  const verfuegbar = formData.get('verfuegbar') === 'on'

  const { error: svErr } = await supabase
    .from('sachverstaendige')
    .update({
      gebiet_plz,
      ist_aktiv: verfuegbar,
    })
    .eq('profile_id', user.id)

  if (svErr) throw new Error(svErr.message)

  revalidatePath('/gutachter/profil')
}
