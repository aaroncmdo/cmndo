'use server'

// AAR-314: Auslandskennzeichen — Anfrage beim Deutschen Büro Grüne Karte.
// Der MA triggert die Anfrage via deutsches-buero-gruene-karte.de,
// dieser Server-Endpoint persistiert das Datum und legt einen
// KB-Reminder-Task für Tag +10 an (wenn bis dahin keine Antwort kam,
// muss nachgehakt werden).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function setGrueneKarteAngefragt(
  leadId: string,
): Promise<{ success: boolean; error?: string; fälligAm?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'dispatch', 'kundenbetreuer'].includes(rolle ?? '')) {
    return { success: false, error: 'Nicht autorisiert' }
  }

  const today = new Date()
  const heute = today.toISOString().slice(0, 10)
  const faellig = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)
  const fälligAm = faellig.toISOString()

  const { error } = await supabase
    .from('leads')
    .update({ gegner_versicherung_anfrage_datum: heute })
    .eq('id', leadId)
  if (error) return { success: false, error: error.message }

  // Task für KB setzen — idempotent via task_code
  try {
    const admin = createAdminClient()
    const { data: lead } = await admin
      .from('leads')
      .select('vorname, nachname, gegner_kennzeichen')
      .eq('id', leadId)
      .maybeSingle()

    const { data: existing } = await admin
      .from('tasks')
      .select('id')
      .eq('lead_id', leadId)
      .eq('task_code', 'gruene-karte-reminder')
      .maybeSingle()

    if (!existing) {
      const kunde = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : ''
      await admin.from('tasks').insert({
        lead_id: leadId,
        typ: 'kb',
        task_code: 'gruene-karte-reminder',
        titel: `Grüne-Karte-Antwort prüfen ${kunde ? `(${kunde})` : ''}`.trim(),
        beschreibung:
          `Vor 10 Tagen wurde beim Deutschen Büro Grüne Karte die DE-Eintrittsversicherung für Kennzeichen ${
            lead?.gegner_kennzeichen ?? '—'
          } angefragt. Bitte prüfen ob die E-Mail eingetroffen ist und im Fall hinterlegen.`,
        status: 'offen',
        prioritaet: 'normal',
        empfaenger_rolle: 'kundenbetreuer',
        faellig_am: fälligAm,
        deadline: fälligAm,
        auto_erstellt: true,
        trigger_event: 'gruene-karte-angefragt',
        phase: 'phase4',
      })
    }
  } catch (err) {
    console.error('[AAR-314] Grüne-Karte-Reminder-Task fehlgeschlagen:', err)
  }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, fälligAm }
}
