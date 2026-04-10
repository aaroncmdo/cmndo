'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-192: SV lehnt einen Termin ab.
 * Prüft 24h-Fenster (final_verbindlich_ab), setzt status='abgelehnt',
 * inkrementiert ablehnungen_30_tage, erstellt Admin-Task.
 */
export async function ablehnTermin(terminId: string, grund: string) {
  const db = createAdminClient()

  // Termin laden
  const { data: termin, error: terminErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, final_verbindlich_ab, status')
    .eq('id', terminId)
    .single()

  if (terminErr || !termin) throw new Error('Termin nicht gefunden')

  // 24h-Fenster prüfen
  if (
    termin.final_verbindlich_ab &&
    new Date(termin.final_verbindlich_ab as string) < new Date()
  ) {
    throw new Error('Termin bereits final verbindlich — Ablehnung nicht mehr möglich')
  }

  // Termin als abgelehnt markieren
  const { error: updateErr } = await db
    .from('gutachter_termine')
    .update({
      status: 'abgelehnt',
      sv_ablehnung_grund: grund || null,
      sv_ablehnung_am: new Date().toISOString(),
    })
    .eq('id', terminId)

  if (updateErr) throw new Error(`Termin-Update fehlgeschlagen: ${updateErr.message}`)

  // ablehnungen_30_tage inkrementieren
  const { data: sv, error: svErr } = await db
    .from('sachverstaendige')
    .select('ablehnungen_30_tage')
    .eq('id', termin.sv_id as string)
    .single()

  if (!svErr && sv) {
    await db
      .from('sachverstaendige')
      .update({ ablehnungen_30_tage: (sv.ablehnungen_30_tage ?? 0) + 1 })
      .eq('id', termin.sv_id as string)
  }

  // Admin-Task erstellen
  const { error: taskErr } = await db.from('tasks').insert({
    fall_id: termin.fall_id,
    titel: 'SV hat Termin abgelehnt — alternativen SV finden',
    beschreibung: grund ? `Ablehnungsgrund: ${grund}` : 'Kein Grund angegeben.',
    typ: 'sv_ablehnung',
    status: 'offen',
    prioritaet: 'dringend',
    auto_erstellt: true,
    faellig_am: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  if (taskErr) console.error('[ablehnTermin] Task-Insert:', taskErr.message)

  // Timeline-Eintrag
  await db.from('timeline').insert({
    fall_id: termin.fall_id,
    typ: 'termin',
    titel: 'SV hat Termin abgelehnt',
    beschreibung: grund
      ? `Ablehnungsgrund: ${grund}`
      : 'SV hat Termin ohne Angabe von Gründen abgelehnt.',
  })
}
