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
// CMM-63 SP-C: Ownership zentral über claim_parties (SSoT) statt inline
// faelle.kunde_id-Check. assertKundeOwnsFall liefert kundenbetreuer_id gleich mit.
import { assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'

export type FreeSlot = { datum: string; uhrzeit: string }

export type LoadSlotsResult =
  | { ok: true; slots: FreeSlot[]; kbName: string | null }
  | { ok: false; error: string }

export async function ladeVerfuegbareBeratungSlots(fallId: string): Promise<LoadSlotsResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt' }

  // CMM-63 SP-C: Ownership + kundenbetreuer_id über den zentralen Helper
  // (claim_parties-SSoT, faelle.kunde_id nur noch Transitions-Fallback).
  const db = createAdminClient()
  const ownership = await assertKundeOwnsFall(db, user.id, user.email ?? null, fallId)
  if (!ownership.ok) {
    return { ok: false, error: ownership.error === 'not_found' ? 'Fall nicht gefunden' : 'Kein Zugriff' }
  }
  const kundenbetreuerId = ownership.kundenbetreuerId
  if (!kundenbetreuerId) return { ok: false, error: 'Kein Kundenbetreuer zugewiesen' }

  let kbName: string | null = null
  const { data: kb } = await db
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', kundenbetreuerId)
    .single()
  if (kb) kbName = [kb.vorname, kb.nachname].filter(Boolean).join(' ') || null

  const slots = await getAvailableKbSlots(kundenbetreuerId)
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
