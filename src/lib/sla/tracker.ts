// AAR-85: SLA-Tracker fuer SA-Trigger-Pipeline.
// Startet/abschliesst SLA-Eintraege und prueft Breaches → Eskalations-Tasks.

import { createAdminClient } from '@/lib/supabase/admin'

export type SlaTyp =
  | 'gutachter_zuweisung'
  | 'termin_bestaetigung'
  | 'besichtigung'
  | 'gutachten_upload'

// Frist in Minuten ab started_at
export const SLA_FRIST_MIN: Record<SlaTyp, number> = {
  gutachter_zuweisung: 30,
  termin_bestaetigung: 60,
  besichtigung: 48 * 60,
  gutachten_upload: 24 * 60,
}

export const SLA_LABEL: Record<SlaTyp, string> = {
  gutachter_zuweisung: 'Gutachter-Zuweisung (30 Min)',
  termin_bestaetigung: 'Termin-Bestaetigung (1 Std)',
  besichtigung: 'Besichtigung (48 Std)',
  gutachten_upload: 'Gutachten-Upload (24 Std)',
}

/**
 * Startet SLA-Tracking. Idempotent via UNIQUE(fall_id, sla_typ).
 * Wenn Eintrag existiert (auch completed), wird nichts ueberschrieben.
 */
export async function startSla(fallId: string, typ: SlaTyp, startedAt?: Date): Promise<void> {
  const db = createAdminClient()
  const start = startedAt ?? new Date()
  const breachAt = new Date(start.getTime() + SLA_FRIST_MIN[typ] * 60_000)

  await db.from('sla_tracking').insert({
    fall_id: fallId,
    sla_typ: typ,
    started_at: start.toISOString(),
    breach_at: breachAt.toISOString(),
    status: 'pending',
  }).then(({ error }) => {
    // 23505 = unique_violation → Eintrag existiert bereits, ignorieren
    if (error && error.code !== '23505') {
      console.error(`[SLA] startSla(${typ}) Fehler:`, error.message)
    }
  })
}

/**
 * Schliesst pending SLA-Eintrag ab. Wenn Eintrag bereits breached → trotzdem completed.
 */
export async function completeSla(fallId: string, typ: SlaTyp): Promise<void> {
  const db = createAdminClient()
  await db.from('sla_tracking')
    .update({ completed_at: new Date().toISOString(), status: 'completed' })
    .eq('fall_id', fallId)
    .eq('sla_typ', typ)
    .in('status', ['pending', 'breached'])
}

/**
 * Findet alle pending SLAs deren breach_at < jetzt → Status auf 'breached' + Task erstellen.
 * Wird vom /api/sla/check-Endpoint (cron) aufgerufen.
 * Liefert Anzahl neu erkannter Breaches.
 */
export async function checkAndEscalateBreaches(): Promise<{ neueBreaches: number; tasksErstellt: number }> {
  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data: pending } = await db
    .from('sla_tracking')
    .select('id, fall_id, sla_typ, breach_at')
    .eq('status', 'pending')
    .lt('breach_at', now)

  if (!pending || pending.length === 0) return { neueBreaches: 0, tasksErstellt: 0 }

  let tasksErstellt = 0
  for (const sla of pending) {
    const fallId = sla.fall_id as string
    const typ = sla.sla_typ as SlaTyp

    // Fallnummer fuer Task-Titel
    const { data: fall } = await db.from('faelle').select('claims:claim_id(claim_nummer)').eq('id', fallId).maybeSingle()
    const fallNr = (Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims)?.claim_nummer ?? fallId.slice(0, 8)

    // Eskalations-Task erstellen
    const { data: task, error: taskErr } = await db.from('tasks').insert({
      fall_id: fallId,
      typ: 'sla_breach',
      titel: `SLA-Verletzung: ${SLA_LABEL[typ]} - Fall ${fallNr}`,
      beschreibung: `Frist ${SLA_LABEL[typ]} ueberschritten (started_at ${sla.breach_at}). Bitte umgehend pruefen.`,
      prioritaet: 'kritisch',
      auto_erstellt: true,
    }).select('id').single()

    if (taskErr) {
      console.error(`[SLA] Task-Insert Fehler ${fallId}/${typ}:`, taskErr.message)
      continue
    }
    tasksErstellt++

    await db.from('sla_tracking')
      .update({ status: 'breached', eskalation_task_id: task!.id })
      .eq('id', sla.id as string)

    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: `SLA-Verletzung: ${SLA_LABEL[typ]}`,
      beschreibung: `Eskalations-Task ${task!.id} angelegt.`,
    })
  }

  return { neueBreaches: pending.length, tasksErstellt }
}
