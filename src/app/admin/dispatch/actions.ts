'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  emailSvZugewiesen,
  emailGutachtenEingegangen,
  emailFilmcheckBestanden,
  emailFallAbgeschlossen,
} from '@/lib/email'

export async function updateFallStatus(fallId: string, newStatus: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('faelle')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  // Fire-and-forget email notifications on status change
  triggerStatusEmail(supabase, fallId, newStatus).catch(() => {})

  revalidatePath('/admin/dispatch')
}

async function triggerStatusEmail(supabase: Awaited<ReturnType<typeof createClient>>, fallId: string, status: string) {
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, sv_id, lead_id, regulierung_betrag')
    .eq('id', fallId)
    .single()
  if (!fall) return

  const fallNr = fall.fall_nummer ?? fall.id.slice(0, 8)

  if (status === 'sv-zugewiesen' && fall.sv_id) {
    const { data: sv } = await supabase.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
    const { data: profile } = sv ? await supabase.from('profiles').select('email').eq('id', sv.profile_id).single() : { data: null }
    if (profile?.email) {
      let kunde = '—'
      if (fall.lead_id) {
        const { data: lead } = await supabase.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
        if (lead) kunde = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
      }
      const adr = [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || '—'
      await emailSvZugewiesen(profile.email, fallNr, kunde, adr)
    }
  }

  if (status === 'gutachten-eingegangen') {
    const { data: admins } = await supabase.from('profiles').select('email').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.email) await emailGutachtenEingegangen(a.email, fallNr)
    }
  }

  if (status === 'kanzlei-uebergeben') {
    const { data: kanzlei } = await supabase.from('profiles').select('email').eq('rolle', 'kanzlei')
    for (const k of kanzlei ?? []) {
      if (k.email) await emailFilmcheckBestanden(k.email, fallNr)
    }
  }

  if (status === 'abgeschlossen' && fall.lead_id) {
    const { data: lead } = await supabase.from('leads').select('email').eq('id', fall.lead_id).single()
    if (lead?.email) {
      const betrag = fall.regulierung_betrag
        ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(fall.regulierung_betrag))
        : '—'
      await emailFallAbgeschlossen(lead.email, fallNr, betrag)
    }
  }
}
