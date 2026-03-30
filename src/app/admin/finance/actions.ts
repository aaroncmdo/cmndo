'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function erfasseEinzahlung(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const svId = formData.get('sv_id') as string
  const betrag = parseFloat(formData.get('betrag') as string)
  const typ = formData.get('typ') as string
  const beschreibung = formData.get('beschreibung') as string

  if (!svId) throw new Error('Gutachter auswählen')
  if (isNaN(betrag) || betrag <= 0) throw new Error('Gültigen Betrag eingeben')
  if (!['anzahlung', 'nachzahlung', 'paketwechsel'].includes(typ)) throw new Error('Ungültiger Typ')

  // Create einzahlung record
  const { error: insertErr } = await supabase.from('gutachter_einzahlungen').insert({
    sv_id: svId,
    betrag,
    typ,
    beschreibung: beschreibung || null,
  })

  if (insertErr) throw new Error(insertErr.message)

  // Update gutachter guthaben
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('guthaben')
    .eq('id', svId)
    .single()

  if (sv) {
    await supabase
      .from('sachverstaendige')
      .update({ guthaben: Number(sv.guthaben ?? 0) + betrag })
      .eq('id', svId)
  }

  revalidatePath('/admin/finance')
}
