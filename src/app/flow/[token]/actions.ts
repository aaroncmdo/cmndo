'use server'

import { emailNeuerFall } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'

export async function notifyNeuerFall(fallId: string) {
  const supabase = await createClient()

  const { data: fall } = await supabase
    .from('faelle')
    .select('fall_nummer, schadens_ursache')
    .eq('id', fallId)
    .single()

  if (!fall) return

  const fallNr = fall.fall_nummer ?? fallId.slice(0, 8)
  const schadensart = fall.schadens_ursache ?? 'Unbekannt'

  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('rolle', 'admin')

  for (const admin of admins ?? []) {
    if (admin.email) {
      await emailNeuerFall(admin.email, fallNr, schadensart).catch(() => {})
    }
  }
}
