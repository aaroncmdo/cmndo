'use server'

// CMM-32e: KB-QC-Freigabe. Schließt den Auftrag ab, legt den Kanzlei-Fall
// an, ändert damit die Claim-Phase auf Regulierung. Beim SV rutscht der
// Auftrag in „Mein Fall".

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function gibKanzleipaketFrei(
  auftragId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle as string)) {
    return { ok: false, error: 'Nur Admin/KB darf freigeben' }
  }

  const db = createAdminClient()

  const { data: auftrag } = await db
    .from('auftraege')
    .select('id, fall_id, gutachten_url, gutachten_final_freigegeben, status')
    .eq('id', auftragId)
    .maybeSingle()
  if (!auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }
  if (auftrag.gutachten_final_freigegeben) return { ok: true }
  if (!auftrag.gutachten_url) return { ok: false, error: 'Kein Gutachten hochgeladen' }

  const now = new Date().toISOString()

  // Auftrag schließen
  const { error: aErr } = await db
    .from('auftraege')
    .update({
      gutachten_final_freigegeben: true,
      status: 'abgeschlossen',
      abgeschlossen_am: now,
    })
    .eq('id', auftragId)
  if (aErr) return { ok: false, error: aErr.message }

  // Kanzlei-Fall anlegen falls noch keiner existiert
  const { data: existing } = await db
    .from('kanzlei_faelle')
    .select('id')
    .eq('fall_id', auftrag.fall_id)
    .maybeSingle()

  if (!existing) {
    const { error: kErr } = await db
      .from('kanzlei_faelle')
      .insert({
        fall_id: auftrag.fall_id,
        status: 'versicherungskontakt',
      })
    if (kErr) return { ok: false, error: kErr.message }
  }

  revalidatePath(`/admin/faelle/${auftrag.fall_id}`)
  revalidatePath(`/mitarbeiter/faelle/${auftrag.fall_id}`)
  revalidatePath(`/kunde/faelle/${auftrag.fall_id}`)
  revalidatePath(`/gutachter/fall/${auftrag.fall_id}`)
  return { ok: true }
}
