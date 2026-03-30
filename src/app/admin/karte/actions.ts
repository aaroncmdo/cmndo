'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateGutachterProfil(
  svId: string,
  field: string,
  value: unknown,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  // Fields that live on the profiles table (via profile_id)
  const profileFields = ['telefon', 'email', 'vorname', 'nachname']

  if (profileFields.includes(field)) {
    // Get profile_id from sachverstaendige
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', svId)
      .single()

    if (!sv?.profile_id) throw new Error('Gutachter-Profil nicht gefunden')

    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', sv.profile_id)

    if (error) throw new Error(error.message)
  } else {
    // Fields on sachverstaendige table
    const { error } = await supabase
      .from('sachverstaendige')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', svId)

    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/karte')
}
