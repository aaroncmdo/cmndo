'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// AAR-637: Rückruf-Erledigt-Status wandert auf admin_termine (typ='rueckruf',
// status='erledigt'). leads.rueckruf_erledigt wurde gedroppt.

async function closeOpenRueckrufTermin(leadId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  await supabase
    .from('admin_termine')
    .update({ status: 'erledigt', updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
}

function revalidateRueckrufPaths(leadId: string) {
  revalidatePath('/dispatch/rueckrufe')
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/dashboard')
  revalidatePath('/admin/kalender')
  revalidatePath('/admin')
  revalidatePath('/mitarbeiter')
}

/**
 * Einheitlicher Rückruf-Erledigen-Flow: Ergebnis + Notiz + optionaler Folgetermin.
 * Ersetzt die getrennten markAngerufen / markNichtErreicht Aktionen.
 */
export async function markRueckrufErledigtMitErgebnis(
  leadId: string,
  ergebnis: 'erreicht' | 'nicht_erreicht',
  notiz: string | null,
  neuerTerminIso?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const now = new Date().toISOString()

  // Anruf-Log-Eintrag
  await supabase.from('anruf_log').insert({
    lead_id: leadId,
    zeitpunkt: now,
    status: ergebnis,
    notiz: notiz ?? null,
    erstellt_von: user.id,
  })

  if (ergebnis === 'erreicht') {
    await closeOpenRueckrufTermin(leadId, supabase)
    const { error } = await supabase
      .from('leads')
      .update({
        qualifizierungs_phase: 'in-qualifizierung',
        letzter_anruf_am: now,
        letzter_anruf_status: 'erreicht',
        rueckruf_geplant_am: null,
        updated_at: now,
      })
      .eq('id', leadId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data: lead } = await supabase
      .from('leads')
      .select('anruf_versuche, vorname, nachname')
      .eq('id', leadId)
      .single()

    const versuche = ((lead?.anruf_versuche as number) ?? 0) + 1
    const updates: Record<string, unknown> = {
      anruf_versuche: versuche,
      letzter_anruf_am: now,
      letzter_anruf_status: 'nicht_erreicht',
      updated_at: now,
    }

    if (versuche >= 2 && !neuerTerminIso) {
      // Kein Folgetermin geplant und 2+ Versuche → kalt
      updates.qualifizierungs_phase = 'kalt'
      await closeOpenRueckrufTermin(leadId, supabase)
    }

    if (neuerTerminIso) {
      updates.rueckruf_geplant_am = neuerTerminIso
      // Vorhandenen offenen Termin updaten oder neuen erstellen
      const { data: existing } = await supabase
        .from('admin_termine')
        .select('id')
        .eq('lead_id', leadId)
        .eq('typ', 'rueckruf')
        .eq('status', 'offen')
        .limit(1)
        .maybeSingle()

      const titel = `${lead?.vorname ?? ''} ${lead?.nachname ?? ''}`.trim() || 'Rückruf'
      const endIso = new Date(new Date(neuerTerminIso).getTime() + 15 * 60_000).toISOString()

      if (existing?.id) {
        await supabase
          .from('admin_termine')
          .update({ titel, start_zeit: neuerTerminIso, end_zeit: endIso, notizen: notiz, updated_at: now })
          .eq('id', existing.id)
      } else {
        const { data: inserted } = await supabase
          .from('admin_termine')
          .insert({
            typ: 'rueckruf',
            titel,
            start_zeit: neuerTerminIso,
            end_zeit: endIso,
            lead_id: leadId,
            notizen: notiz,
            erstellt_von: user.id,
            zugewiesen_an: user.id,
            status: 'offen',
          })
          .select('id')
          .single()
        if (inserted?.id) {
          import('@/lib/google-calendar/admin-event-sync').then(({ syncAdminTerminCalendarEvent }) =>
            syncAdminTerminCalendarEvent(inserted.id as string).catch(() => {}),
          )
        }
      }
    }

    const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
    if (error) return { ok: false, error: error.message }
  }

  revalidateRueckrufPaths(leadId)
  return { ok: true }
}

/** @deprecated Benutze markRueckrufErledigtMitErgebnis */
export async function markAngerufen(leadId: string) {
  const r = await markRueckrufErledigtMitErgebnis(leadId, 'erreicht', null)
  if (!r.ok) throw new Error(r.error)
}

/** @deprecated Benutze markRueckrufErledigtMitErgebnis */
export async function markNichtErreicht(leadId: string) {
  const r = await markRueckrufErledigtMitErgebnis(leadId, 'nicht_erreicht', null)
  if (!r.ok) throw new Error(r.error)
}
