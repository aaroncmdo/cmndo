'use server'

// AAR-395 / AAR-408: SV schlägt dem Kunden einen ersten Besichtigungstermin vor.
// Erstellt einen neuen gutachter_termine-Row mit status='reserviert'.
// Der Kunde bekommt dann eine WhatsApp/Email zum Annehmen oder Gegenvorschlag.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'

type Result = { success: true; terminId: string } | { success: false; error: string }

export async function svTerminErstvorschlag(
  fallId: string,
  startZeit: string, // ISO-Datum
  grund?: string | null,
  dauerMinuten: number = 90,
): Promise<Result> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Auth + Fall/SV-Zuordnung prüfen
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein SV-Profil' }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, sv_id, kunde_id')
    .eq('id', fallId)
    .eq('sv_id', sv.id)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const admin = createAdminClient()

  // Schon offener Termin? Dann besser Gegenvorschlag-Flow nutzen.
  const { data: bestehend } = await admin
    .from('gutachter_termine')
    .select('id, status')
    .eq('fall_id', fallId)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
    .limit(1)
    .maybeSingle()

  if (bestehend) {
    return {
      success: false,
      error: 'Es existiert bereits ein offener Termin — bitte den bestehenden bearbeiten.',
    }
  }

  const start = new Date(startZeit)
  if (isNaN(start.getTime())) {
    return { success: false, error: 'Ungültiges Datum' }
  }
  const end = new Date(start.getTime() + dauerMinuten * 60 * 1000)

  const { data: termin, error: insertErr } = await admin
    .from('gutachter_termine')
    .insert({
      fall_id: fallId,
      sv_id: sv.id,
      status: 'reserviert',
      start_zeit: start.toISOString(),
      end_zeit: end.toISOString(),
      gegenvorschlag_von: null,
    })
    .select('id')
    .single()

  if (insertErr || !termin) {
    return { success: false, error: insertErr?.message ?? 'Termin-Anlage fehlgeschlagen' }
  }

  // AAR-694 Teil B: SV-Google-Kalender-Event anlegen (non-critical, fire-and-forget)
  import('@/lib/google-calendar/sv-event-sync').then(({ syncSvCalendarEvent }) =>
    syncSvCalendarEvent(termin.id).catch((err) =>
      console.warn('[sv-termin-erstvorschlag] syncSvCalendarEvent:', err instanceof Error ? err.message : err),
    ),
  )

  // Timeline-Eintrag (non-critical)
  try {
    await admin.from('timeline').insert({
      fall_id: fallId,
      typ: 'termin',
      titel: 'SV hat Termin vorgeschlagen',
      beschreibung: `Vorschlag für ${start.toLocaleString('de-DE')}.${grund ? ` Grund: ${grund}` : ''}`,
    })
  } catch (err) {
    console.error('[svTerminErstvorschlag] Timeline-Insert fehlgeschlagen:', err)
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/auftraege')
  revalidatePath('/gutachter/kalender')
  revalidatePath(`/kunde/faelle/${fallId}`)

  return { success: true, terminId: termin.id }
}
