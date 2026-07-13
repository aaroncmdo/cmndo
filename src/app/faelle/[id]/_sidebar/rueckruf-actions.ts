'use server'

// AAR-637: Rückruf-Actions für die Fallakte-Sidebar. Schreibt admin_termine
// mit typ='rueckruf' + fall_id. Ein offener Rückruf pro Fall; Update-Pattern
// spiegelt Dispatch/Leads actions/rueckruf.ts.
// SP2d: Rückrufe syncen jetzt in Google + CalDAV des zugewiesenen Mitarbeiters
// (syncAdminTerminCalendarEvent — fail-soft, owner-gated).

import { createClient } from '@/lib/supabase/server'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'

export type FallRueckrufResult = { success: boolean; error?: string }

// SP2d: fail-soft Sync in Google + CalDAV (der Hook im Google-Modul triggert CalDAV mit).
function syncAdminTermin(terminId: string) {
  import('@/lib/google-calendar/admin-event-sync').then(({ syncAdminTerminCalendarEvent }) =>
    syncAdminTerminCalendarEvent(terminId).catch(() => {}),
  )
}

export async function saveFallRueckruf(
  fallId: string,
  datumIso: string | null,
  notiz: string | null,
): Promise<FallRueckrufResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const nowIso = new Date().toISOString()

  if (!datumIso) {
    const { data: cancelled, error } = await supabase
      .from('admin_termine')
      .update({ status: 'abgesagt', updated_at: nowIso })
      .eq('fall_id', fallId)
      .eq('typ', 'rueckruf')
      .eq('status', 'offen')
      .select('id')
    if (error) return { success: false, error: error.message }
    for (const c of cancelled ?? []) syncAdminTermin(c.id as string)
    revalidatePath(`/faelle/${fallId}`)
    revalidatePath('/admin')
    revalidatePath('/admin/kalender')
    revalidatePath('/mitarbeiter')
    return { success: true }
  }

  // CMM-49: kundenbetreuer_id + claim_nummer claims-direkt (SSoT) via resolveClaimId.
  const rrClaimId = await resolveClaimId(supabase, fallId)
  const { data: fallClaim } = rrClaimId
    ? await supabase.from('claims').select('kundenbetreuer_id, claim_nummer').eq('id', rrClaimId).maybeSingle()
    : { data: null }
  const kundenbetreuerId = (fallClaim?.kundenbetreuer_id as string | null) ?? null

  const titel = `Rückruf ${(fallClaim?.claim_nummer as string | null) ?? fallId.slice(0, 8)}`

  const { data: existing } = await supabase
    .from('admin_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
    .limit(1)
    .maybeSingle()

  const endIso = new Date(new Date(datumIso).getTime() + 15 * 60 * 1000).toISOString()

  if (existing?.id) {
    const { error } = await supabase
      .from('admin_termine')
      .update({
        titel,
        start_zeit: datumIso,
        end_zeit: endIso,
        notizen: notiz,
        updated_at: nowIso,
      })
      .eq('id', existing.id)
    if (error) return { success: false, error: error.message }
    syncAdminTermin(existing.id as string)
  } else {
    const { data: created, error } = await supabase
      .from('admin_termine')
      .insert({
        typ: 'rueckruf',
        titel,
        start_zeit: datumIso,
        end_zeit: endIso,
        fall_id: fallId,
        notizen: notiz,
        erstellt_von: user.id,
        zugewiesen_an: kundenbetreuerId ?? user.id,
        status: 'offen',
      })
      .select('id')
      .single()
    if (error) return { success: false, error: error.message }
    if (created?.id) syncAdminTermin(created.id as string)
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin')
  revalidatePath('/admin/kalender')
  revalidatePath('/mitarbeiter')
  return { success: true }
}

export async function markFallRueckrufErledigt(fallId: string): Promise<FallRueckrufResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: erledigt, error } = await supabase
    .from('admin_termine')
    .update({ status: 'erledigt', updated_at: new Date().toISOString() })
    .eq('fall_id', fallId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
    .select('id')

  if (error) return { success: false, error: error.message }
  for (const e of erledigt ?? []) syncAdminTermin(e.id as string)

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin')
  revalidatePath('/admin/kalender')
  revalidatePath('/mitarbeiter')
  return { success: true }
}
