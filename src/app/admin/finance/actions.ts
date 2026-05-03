'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function erfasseEinzahlung(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const svId = formData.get('sv_id') as string
  const betrag = parseFloat(formData.get('betrag') as string)
  const typ = formData.get('typ') as string
  const beschreibung = formData.get('beschreibung') as string

  if (!svId) return { ok: false, error: 'Gutachter auswählen' }
  if (isNaN(betrag) || betrag <= 0) return { ok: false, error: 'Gültigen Betrag eingeben' }
  if (!['anzahlung', 'nachzahlung', 'paketwechsel'].includes(typ)) return { ok: false, error: 'Ungültiger Typ' }

  const { error: insertErr } = await supabase.from('gutachter_einzahlungen').insert({
    sv_id: svId,
    betrag,
    typ,
    beschreibung: beschreibung || null,
  })

  if (insertErr) return { ok: false, error: insertErr.message }

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('werbebudget_guthaben_netto')
    .eq('id', svId)
    .single()

  if (sv) {
    await supabase
      .from('sachverstaendige')
      .update({ werbebudget_guthaben_netto: Number(sv.werbebudget_guthaben_netto ?? 0) + betrag })
      .eq('id', svId)
  }

  revalidatePath('/admin/finance')
  return { ok: true }
}
