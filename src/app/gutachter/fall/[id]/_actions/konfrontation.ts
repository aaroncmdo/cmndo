'use server'

// AAR-559 (C10): SV-Konfrontations-Termin Annehmen/Ablehnen.
// Der Kunde hat im Kunde-Portal (C9) gebeten, dass der SV bei der
// Nachbesichtigung dabei ist. Der SV bestätigt hier Termin-bereitschaft
// oder lehnt mit Grund ab. Audit + Mitteilungen via processLexDriveEvent.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'
import { processLexDriveEvent } from '@/lib/lexdrive/process-event'

interface BestaetigenInput {
  fallId: string
}

interface AblehnenInput {
  fallId: string
  grund: string
}

async function loadFallFuerSv(
  fallId: string,
): Promise<{ fall: { id: string; fall_nummer: string | null }; userId: string } | { error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { error: 'Kein SV-Profil' }

  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select(
      'id, fall_nummer, sv_id, nachbesichtigung_sv_konfrontation_gewuenscht, nachbesichtigung_sv_termin_vereinbart_am',
    )
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .maybeSingle()

  if (!fall) return { error: 'Fall nicht gefunden oder nicht autorisiert' }
  if (!fall.nachbesichtigung_sv_konfrontation_gewuenscht) {
    return { error: 'Kunde hat keine Konfrontation angefordert' }
  }
  if (fall.nachbesichtigung_sv_termin_vereinbart_am) {
    return { error: 'Konfrontations-Termin wurde bereits bestätigt' }
  }

  return {
    fall: { id: fall.id as string, fall_nummer: (fall.fall_nummer as string | null) ?? null },
    userId: user.id,
  }
}

export async function bestaetigeKonfrontationsTermin(
  input: BestaetigenInput,
): Promise<{ success: boolean; error?: string }> {
  if (!input.fallId) return { success: false, error: 'fall_id fehlt' }

  const loaded = await loadFallFuerSv(input.fallId)
  if ('error' in loaded) return { success: false, error: loaded.error }

  const now = new Date().toISOString()
  const result = await processLexDriveEvent({
    fallId: loaded.fall.id,
    fallNr: loaded.fall.fall_nummer ?? input.fallId.slice(0, 8),
    eventType: 'sv_konfrontation_bestaetigt',
    payload: { bestaetigt_am: now },
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: loaded.userId,
  })

  if (!result.success) return { success: false, error: result.error ?? 'Speichern fehlgeschlagen' }

  revalidatePath(`/gutachter/fall/${input.fallId}`)
  revalidatePath(`/faelle/${input.fallId}`)
  revalidatePath(`/faelle/${input.fallId}/prozess`)
  return { success: true }
}

export async function lehneKonfrontationsTermin(
  input: AblehnenInput,
): Promise<{ success: boolean; error?: string }> {
  if (!input.fallId) return { success: false, error: 'fall_id fehlt' }
  const grund = input.grund.trim()
  if (grund.length < 10) {
    return { success: false, error: 'Bitte mindestens 10 Zeichen Begründung angeben' }
  }

  const loaded = await loadFallFuerSv(input.fallId)
  if ('error' in loaded) return { success: false, error: loaded.error }

  const now = new Date().toISOString()
  const result = await processLexDriveEvent({
    fallId: loaded.fall.id,
    fallNr: loaded.fall.fall_nummer ?? input.fallId.slice(0, 8),
    eventType: 'sv_konfrontation_abgelehnt',
    payload: { abgelehnt_am: now, notiz_sv: grund },
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: loaded.userId,
  })

  if (!result.success) return { success: false, error: result.error ?? 'Speichern fehlgeschlagen' }

  revalidatePath(`/gutachter/fall/${input.fallId}`)
  revalidatePath(`/faelle/${input.fallId}`)
  revalidatePath(`/faelle/${input.fallId}/prozess`)
  return { success: true }
}
