'use server'

import { createAdminClient } from '@/lib/supabase/admin'

type Slot = { datum: string; uhrzeit: string }

/**
 * KFZ-192: SV macht Gegenvorschlag mit alternativen Slots.
 * Prüft 24h-Fenster (final_verbindlich_ab), setzt status='gegenvorschlag',
 * speichert Slots in sv_vorgeschlagene_slots, erstellt Timeline-Eintrag.
 */
export async function gegenvorschlagTermin(terminId: string, slots: Slot[]) {
  const db = createAdminClient()

  // Termin laden
  const { data: termin, error: terminErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, final_verbindlich_ab')
    .eq('id', terminId)
    .single()

  if (terminErr || !termin) throw new Error('Termin nicht gefunden')

  // 24h-Fenster prüfen
  if (
    termin.final_verbindlich_ab &&
    new Date(termin.final_verbindlich_ab as string) < new Date()
  ) {
    throw new Error('Termin bereits final verbindlich — Gegenvorschlag nicht mehr möglich')
  }

  if (!slots || slots.length === 0) throw new Error('Mindestens ein Slot erforderlich')

  // Termin updaten
  const { error: updateErr } = await db
    .from('gutachter_termine')
    .update({
      status: 'gegenvorschlag',
      sv_vorgeschlagene_slots: slots,
    })
    .eq('id', terminId)

  if (updateErr) throw new Error(`Termin-Update fehlgeschlagen: ${updateErr.message}`)

  // Timeline-Eintrag
  const { error: tlErr } = await db.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: 'SV hat Gegenvorschlag gemacht',
    beschreibung: `${slots.length} alternative Terminvorschlag${slots.length === 1 ? '' : 'e'}: ${slots.map(s => `${s.datum} ${s.uhrzeit}`).join(', ')}.`,
  })

  if (tlErr) console.error('[gegenvorschlagTermin] Timeline-Insert:', tlErr.message)
}
