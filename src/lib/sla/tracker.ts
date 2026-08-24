// AAR-85: SLA-Tracker fuer SA-Trigger-Pipeline.
// Startet/abschliesst SLA-Eintraege und prueft Breaches → Eskalations-Tasks.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSlaBreachTaskCancel } from './task-resolution'
import { deriveSvSlaCompletion } from './sv-completion'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'

export type SlaTyp =
  | 'gutachter_zuweisung'
  | 'termin_bestaetigung'
  | 'besichtigung'
  | 'gutachten_upload'
  // Filmcheck-Audit 29.06.2026: qc_filmcheck war im sla_tracking-CHECK-Constraint
  // schema-reserviert, aber nie verdrahtet -> stuck-in-filmcheck eskalierte nie
  // (nur der 2h-QC-Task + generische task-eskalation). Jetzt: start am filmcheck-
  // Eintritt, complete am kanzlei-uebergeben (state-machine.ts). checkAndEscalate-
  // Breaches (Cron) eskaliert generisch -> kein Cron-Change noetig.
  | 'qc_filmcheck'

// Frist in Minuten ab started_at
export const SLA_FRIST_MIN: Record<SlaTyp, number> = {
  gutachter_zuweisung: 30,
  termin_bestaetigung: 60,
  besichtigung: 48 * 60,
  gutachten_upload: 24 * 60,
  qc_filmcheck: 4 * 60,
}

export const SLA_LABEL: Record<SlaTyp, string> = {
  gutachter_zuweisung: 'Gutachter-Zuweisung (30 Min)',
  termin_bestaetigung: 'Termin-Bestaetigung (1 Std)',
  besichtigung: 'Besichtigung (48 Std)',
  gutachten_upload: 'Gutachten-Upload (24 Std)',
  qc_filmcheck: 'Filmcheck / QC (4 Std)',
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
 * Loest ausserdem jeden verknuepften offenen sla_breach-Task auf (nicht-kritisch, kein throw).
 */
export async function completeSla(fallId: string, typ: SlaTyp): Promise<void> {
  const db = createAdminClient()
  const { data: updated } = await db.from('sla_tracking')
    .update({ completed_at: new Date().toISOString(), status: 'completed' })
    .eq('fall_id', fallId)
    .eq('sla_typ', typ)
    .in('status', ['pending', 'breached'])
    .select('id, eskalation_task_id')

  // Verknuepfte sla_breach-Tasks als erledigt markieren (nicht-kritisch).
  // FG7 coordination marker: 887c23ef — tasks.status write gated .eq('status','offen').
  if (updated && updated.length > 0) {
    try {
      const now = new Date()
      for (const row of updated) {
        const taskId = (row as { id: string; eskalation_task_id: string | null }).eskalation_task_id
        if (!taskId) continue
        // Das umschliessende try faengt den Write nicht. Bleibt er aus, steht der
        // Eskalations-Task weiter offen, obwohl die SLA erfuellt ist.
        const { error: cancelFehler } = await db.from('tasks')
          .update(resolveSlaBreachTaskCancel(now, 'SLA erfüllt — Fall weitergelaufen'))
          .eq('id', taskId)
          .eq('status', 'offen')
        if (cancelFehler) {
          console.error(`[SLA] Eskalations-Task ${taskId} nicht aufgeloest:`, cancelFehler.message)
        }
      }
    } catch (err) {
      console.error('[SLA] completeSla task-cancel:', err)
    }
  }
}

/**
 * Findet alle pending SLAs deren breach_at < jetzt → Status auf 'breached' + Task erstellen.
 * Wird vom /api/sla/check-Endpoint (cron) aufgerufen.
 * Liefert Anzahl neu erkannter Breaches (nur echte Eskalationen, keine auto-completed Zeilen).
 *
 * FG7 (Task 4): Zwei Verbesserungen gegenueber dem alten Stand:
 * 1. target_rolle guard: kanzlei-Zeilen werden vom Select ausgeschlossen (kanzlei traegt
 *    eigene sla_typ-Werte die nicht im SV-SLA_LABEL stehen → undefinierter Task-Titel).
 * 2. Live completion re-check: Vor jeder Eskalation wird deriveSvSlaCompletion() aufgerufen.
 *    Wenn der Claim bereits weitergelaufen ist → completeSla() + continue (kein falscher Breach).
 *    qc_filmcheck bekommt kein re-check (behaelt generische Eskalation wie bisher).
 */
export async function checkAndEscalateBreaches(): Promise<{ neueBreaches: number; tasksErstellt: number }> {
  const db = createAdminClient()
  const now = new Date().toISOString()

  // target_rolle guard: kanzlei-Zeilen ausschliessen (FG7 Task 4 — kein kanzlei-Leak).
  const { data: pending } = await db
    .from('sla_tracking')
    .select('id, fall_id, claim_id, sla_typ, breach_at')
    .eq('status', 'pending')
    .lt('breach_at', now)
    .neq('target_rolle', 'kanzlei')

  if (!pending || pending.length === 0) return { neueBreaches: 0, tasksErstellt: 0 }

  let neueBreaches = 0
  let tasksErstellt = 0
  let autoCompleted = 0

  for (const sla of pending) {
    const fallId = sla.fall_id as string
    const claimId = sla.claim_id as string | null
    const typ = sla.sla_typ as SlaTyp

    // Fallnummer fuer Task-Titel + operative_status fuer completion re-check.
    // CMM-49 (Drop-Runway, Phase D Reader-Sweep): claim_nummer direkt aus claims
    // (SSoT) statt via .from('faelle') -> claims:claim_id-Embed. sla_tracking traegt
    // claim_id nativ (FK-Re-Key, 26/26 konsistent mit faelle[fall_id].claim_id).
    let fallNr = fallId.slice(0, 8)
    let operativeStatus: string | null = null
    if (claimId) {
      const { data: claimRow } = await db
        .from('claims')
        .select('claim_nummer, operative_status')
        .eq('id', claimId)
        .maybeSingle()
      fallNr = claimRow?.claim_nummer ?? fallId.slice(0, 8)
      operativeStatus = (claimRow?.operative_status as string | null) ?? null
    }

    // termin_bestaetigung: probe ob ein bestaetigter/abgeschlossener Termin existiert.
    // Gate auf typ um den Extra-Query fuer alle anderen typs zu vermeiden.
    const hasConfirmedTermin =
      typ === 'termin_bestaetigung'
        ? await db
            .from('gutachter_termine')
            .select('id', { count: 'exact', head: true })
            .or(bezugOrExpr('fall', fallId))
            .in('status', ['bestaetigt', 'abgeschlossen'])
            .then(({ count }) => (count ?? 0) > 0)
        : false

    // Completion re-check (FG7 Task 4): qc_filmcheck behaelt generische Eskalation (kein re-check).
    // Das typ !== 'qc_filmcheck' narrowt SlaTyp (5 Mitglieder) auf SvSlaTyp (4) → type-safe.
    if (typ !== 'qc_filmcheck' && deriveSvSlaCompletion(typ, { operativeStatus, hasConfirmedTermin })) {
      await completeSla(fallId, typ)
      autoCompleted++
      continue
    }

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

    neueBreaches++
  }

  if (autoCompleted > 0) {
    console.log(`[SLA] checkAndEscalateBreaches: ${autoCompleted} auto-completed (Claim bereits weitergelaufen)`)
  }

  return { neueBreaches, tasksErstellt }
}
