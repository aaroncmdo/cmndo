'use server'

// AAR-637: Rückruf-SoT auf admin_termine konsolidiert. Kein leads.rueckruf_*
// mehr — stattdessen ein admin_termine-Eintrag mit typ='rueckruf', lead_id,
// status∈('offen','erledigt','abgesagt'). Dadurch sehen Admin-Kalender,
// Mitarbeiter-Kalender und Dispatch-Rückrufliste denselben Termin.
//
// Pro Lead existiert höchstens EIN offener Rückruf-Termin (es ergibt kein
// Sinn zwei parallele Rückrufe für denselben Lead zu haben). Update-Logik:
// existiert bereits ein offener Termin für den Lead → updaten; sonst neuer
// Insert. Als erledigt/abgesagt markierte Termine bleiben als Historie.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type RueckrufActionResult = { success: boolean; error?: string }

async function ensureDauer(startIso: string): Promise<string> {
  return new Date(new Date(startIso).getTime() + 15 * 60 * 1000).toISOString()
}

export async function saveRueckruf(
  leadId: string,
  datumIso: string | null,
  notiz: string | null,
): Promise<RueckrufActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  if (!datumIso) {
    // Datum gelöscht → offenen Rückruf-Termin für diesen Lead absagen
    const { data: cancelled, error } = await supabase
      .from('admin_termine')
      .update({ status: 'abgesagt', updated_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .eq('typ', 'rueckruf')
      .eq('status', 'offen')
      .select('id')
    if (error) return { success: false, error: error.message }
    await supabase
      .from('leads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', leadId)
    // Schnell-Lookup auf leads nullen
    await supabase.from('leads').update({ rueckruf_geplant_am: null, updated_at: new Date().toISOString() }).eq('id', leadId)
    // AAR-698: Google-Calendar-Events der abgesagten Termine entfernen
    for (const c of cancelled ?? []) {
      import('@/lib/google-calendar/admin-event-sync').then(({ syncAdminTerminCalendarEvent }) =>
        syncAdminTerminCalendarEvent(c.id as string).catch(() => {}),
      )
    }
    revalidatePath(`/dispatch/leads/${leadId}`)
    revalidatePath('/dispatch/rueckrufe')
    revalidatePath('/admin/kalender')
    return { success: true }
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('vorname, nachname')
    .eq('id', leadId)
    .maybeSingle()

  const titel = `${lead?.vorname ?? ''} ${lead?.nachname ?? ''}`.trim() || 'Rückruf'

  const { data: existing } = await supabase
    .from('admin_termine')
    .select('id')
    .eq('lead_id', leadId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
    .limit(1)
    .maybeSingle()

  const endIso = await ensureDauer(datumIso)
  const nowIso = new Date().toISOString()

  let terminId: string | null = null
  if (existing?.id) {
    terminId = existing.id as string
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
    if (error) {
      console.error('[saveRueckruf] update fehlgeschlagen:', error.message)
      return { success: false, error: error.message }
    }
  } else {
    const { data: inserted, error } = await supabase
      .from('admin_termine')
      .insert({
        typ: 'rueckruf',
        titel,
        start_zeit: datumIso,
        end_zeit: endIso,
        lead_id: leadId,
        notizen: notiz,
        erstellt_von: user.id,
        zugewiesen_an: user.id,
        status: 'offen',
      })
      .select('id')
      .single()
    if (error || !inserted) {
      console.error('[saveRueckruf] insert fehlgeschlagen:', error?.message)
      return { success: false, error: error?.message ?? 'Insert fehlgeschlagen' }
    }
    terminId = inserted.id as string
  }

  await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: 'rueckruf',
      rueckruf_geplant_am: datumIso,
      updated_at: nowIso,
    })
    .eq('id', leadId)

  // AAR-698: Im Google-Kalender des Vereinbarenden (zugewiesen_an = user.id)
  // spiegeln. Fail-silent wenn kein Token vorhanden.
  if (terminId) {
    import('@/lib/google-calendar/admin-event-sync').then(({ syncAdminTerminCalendarEvent }) =>
      syncAdminTerminCalendarEvent(terminId).catch((err) =>
        console.warn('[saveRueckruf] syncAdminTerminCalendarEvent:', err instanceof Error ? err.message : err),
      ),
    )
  }

  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/rueckrufe')
  revalidatePath('/admin/kalender')
  revalidatePath('/admin')
  revalidatePath('/mitarbeiter')
  return { success: true }
}

export async function markRueckrufErledigt(leadId: string): Promise<RueckrufActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: erledigt, error } = await supabase
    .from('admin_termine')
    .update({ status: 'erledigt', updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
    .select('id')

  if (error) return { success: false, error: error.message }

  // Schnell-Lookup auf leads nullen
  await supabase.from('leads').update({ rueckruf_geplant_am: null, updated_at: new Date().toISOString() }).eq('id', leadId)

  // AAR-698: Google-Calendar-Events entfernen wenn als erledigt markiert
  for (const e of erledigt ?? []) {
    import('@/lib/google-calendar/admin-event-sync').then(({ syncAdminTerminCalendarEvent }) =>
      syncAdminTerminCalendarEvent(e.id as string).catch(() => {}),
    )
  }

  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/rueckrufe')
  revalidatePath('/admin/kalender')
  revalidatePath('/admin')
  revalidatePath('/mitarbeiter')
  return { success: true }
}
