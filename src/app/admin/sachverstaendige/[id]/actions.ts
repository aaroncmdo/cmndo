'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateSvProfile(svId: string, profileId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null
  const paket = formData.get('paket') as string
  const maxFaelle = parseInt(formData.get('max_faelle_monat') as string) || 10
  const istAktiv = formData.get('ist_aktiv') === 'true'
  const gebietPlzRaw = (formData.get('gebiet_plz') as string)?.trim() || ''
  const notizen = (formData.get('notizen') as string)?.trim() || null

  const gebietPlz = gebietPlzRaw
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(Boolean)

  // Update profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ vorname, nachname, telefon })
    .eq('id', profileId)

  if (profileErr) throw new Error(`Profil-Update fehlgeschlagen: ${profileErr.message}`)

  // Update sachverstaendige
  const { error: svErr } = await supabase
    .from('sachverstaendige')
    .update({
      paket,
      max_faelle_monat: maxFaelle,
      ist_aktiv: istAktiv,
      gebiet_plz: gebietPlz,
      notizen,
    })
    .eq('id', svId)

  if (svErr) throw new Error(`SV-Update fehlgeschlagen: ${svErr.message}`)

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
}
