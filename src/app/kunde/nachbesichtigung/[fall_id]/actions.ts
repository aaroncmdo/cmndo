'use server'

// AAR-558 (C9): Server-Action zum Einreichen der Kunden-Termin-Vorschläge.
// Schreibt JSONB-Array nachbesichtigung_kunde_termin_vorschlaege und triggert
// processLexDriveEvent mit eventType='kunde_nachbesichtigung_termine_eingereicht'.
// Der Event-Handler übernimmt das Mitteilungs-Routing (KB-Hinweis + C12-Trigger
// wenn Konfrontation gewünscht).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { processLexDriveEvent } from '@/lib/lexdrive/process-event'

interface TerminSlot {
  datum: string
  uhrzeit: string
}

interface SubmitInput {
  fallId: string
  termine: TerminSlot[]
  svKonfrontationGewuenscht: boolean
}

export async function submitNachbesichtigungsTermine(
  input: SubmitInput,
): Promise<{ success: boolean; error?: string }> {
  if (!input.fallId) return { success: false, error: 'fall_id fehlt' }
  if (!Array.isArray(input.termine) || input.termine.length === 0) {
    return { success: false, error: 'Mindestens 1 Termin-Vorschlag erforderlich' }
  }
  if (input.termine.length > 3) {
    return { success: false, error: 'Maximal 3 Termine möglich' }
  }

  for (const t of input.termine) {
    if (!t.datum || !t.uhrzeit) {
      return { success: false, error: 'Datum und Uhrzeit sind Pflichtfelder' }
    }
    const d = new Date(`${t.datum}T${t.uhrzeit}`)
    if (Number.isNaN(d.getTime())) {
      return { success: false, error: 'Ungültiges Datum/Uhrzeit-Format' }
    }
    if (d.getTime() < Date.now()) {
      return { success: false, error: 'Termine müssen in der Zukunft liegen' }
    }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()

  // Ownership-Check via faelle_kunde_view (security_invoker erbt kunde-RLS)
  const { data: fall } = await supabase
    .from('faelle_kunde_view')
    .select('id, fall_nummer, nachbesichtigung_kunde_termin_eingereicht_am')
    .eq('id', input.fallId)
    .maybeSingle()

  if (!fall) return { success: false, error: 'Fall nicht gefunden oder nicht berechtigt' }
  if (fall.nachbesichtigung_kunde_termin_eingereicht_am) {
    return { success: false, error: 'Termine wurden bereits eingereicht' }
  }

  // fall_nummer nachladen (manche views haben's evtl. nicht) via admin
  const { data: fallMeta } = await admin
    .from('faelle')
    .select('fall_nummer')
    .eq('id', input.fallId)
    .single()

  const now = new Date().toISOString()

  const result = await processLexDriveEvent({
    fallId: input.fallId,
    fallNr: fallMeta?.fall_nummer ?? input.fallId.slice(0, 8),
    eventType: 'kunde_nachbesichtigung_termine_eingereicht',
    payload: {
      termin_vorschlaege: input.termine,
      sv_konfrontation_gewuenscht: input.svKonfrontationGewuenscht,
      eingereicht_am: now,
    },
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error ?? 'Speichern fehlgeschlagen' }
  }

  revalidatePath(`/kunde/nachbesichtigung/${input.fallId}`)
  revalidatePath(`/kunde/faelle/${input.fallId}`)
  revalidatePath(`/admin/faelle/${input.fallId}`)
  revalidatePath(`/admin/faelle/${input.fallId}/prozess`)

  return { success: true }
}
