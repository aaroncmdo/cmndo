'use server'

// AAR-368: Customer-facing Wrapper um die bestehenden Termine-Libs.
// getAvailableKbSlots + bookKbTermin existieren bereits (AAR-169) — hier
// nur die Brücke zur UI: die UI übergibt fallId, wir ermitteln daraus die
// kundenbetreuer_id und leiten an die bestehenden Helper weiter.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getAvailableKbSlots } from '@/lib/termine/kb-slots'
import { bookKbTermin } from '@/lib/termine/kb-booking'

export type FreeSlot = { datum: string; uhrzeit: string }

export type LoadSlotsResult =
  | { ok: true; slots: FreeSlot[]; kbName: string | null }
  | { ok: false; error: string }

export async function ladeVerfuegbareBeratungSlots(fallId: string): Promise<LoadSlotsResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt' }

  const db = createAdminClient()
  const { data: fall } = await db
    .from('faelle')
    .select('id, kunde_id, kundenbetreuer_id')
    .eq('id', fallId)
    .single()
  if (!fall) return { ok: false, error: 'Fall nicht gefunden' }
  if (fall.kunde_id !== user.id) return { ok: false, error: 'Kein Zugriff' }
  if (!fall.kundenbetreuer_id) return { ok: false, error: 'Kein Kundenbetreuer zugewiesen' }

  let kbName: string | null = null
  const { data: kb } = await db
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', fall.kundenbetreuer_id as string)
    .single()
  if (kb) kbName = [kb.vorname, kb.nachname].filter(Boolean).join(' ') || null

  const slots = await getAvailableKbSlots(fall.kundenbetreuer_id as string)
  return { ok: true, slots, kbName }
}

export type BookResult = { ok: true; terminId: string } | { ok: false; error: string }

export async function bucheBeratungstermin(
  fallId: string,
  datum: string,
  uhrzeit: string,
  kanal: 'video' | 'telefon',
  thema: string,
  beschreibung?: string,
): Promise<BookResult> {
  // Thema + freier Text werden zu einem Notiz-Feld kombiniert — bookKbTermin
  // hat keine dedizierten Thema-Felder.
  const notiz = beschreibung ? `${thema} — ${beschreibung}` : thema
  const result = await bookKbTermin(fallId, datum, uhrzeit, kanal, notiz)
  if (result.ok) {
    revalidatePath(`/kunde/faelle/${fallId}`)
    revalidatePath('/kunde')
  }
  return result
}
