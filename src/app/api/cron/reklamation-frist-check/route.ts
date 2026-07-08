import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'

export const dynamic = 'force-dynamic'

/**
 * KFZ-150 Block I: Reklamation-Frist-Check Cron (täglich 10:00).
 * Abgelaufene Reklamationen auto-ablehnen + überfällige Admin-Tasks.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()
  const now = new Date().toISOString()

  // 1. Frist abgelaufen → auto_abgelehnt_frist
  const { data: abgelaufen } = await db.from('reklamationen')
    .select('id, fall_id, sv_id')
    .eq('status', 'eingereicht')
    .lt('frist_bis', now)

  for (const r of abgelaufen ?? []) {
    const { error: updErr } = await db.from('reklamationen').update({ status: 'auto_abgelehnt_frist', bearbeitet_am: now }).eq('id', r.id)
    if (updErr) {
      // Status-Write ungeprueft war ein stiller Verlust — bei DB-Fehler nicht weiter
      // (kein resolveTasks/Email fuer eine Reklamation, die noch 'eingereicht' ist).
      console.error(`[KFZ-150 rekla] Status-Update ${r.id} fehlgeschlagen:`, updErr.message)
      continue
    }

    // KFZ-151: Auto-Resolve aller offenen Tasks (Partial-batch-Schutz: throw hier darf
    // nicht die restlichen abgelaufenen Reklamationen des Laufs abbrechen).
    try {
      await resolveTasksForEntity('reklamation', r.id, 'Reklamation auto-abgelehnt: Frist abgelaufen')
    } catch (err) {
      console.error(`[KFZ-150 rekla] resolveTasks ${r.id} fehlgeschlagen:`, err instanceof Error ? err.message : err)
    }

    // Email an SV
    try {
      const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', r.sv_id).single()
      if (sv?.profile_id) {
        const { data: p } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
        if (p?.email) {
          const { sendCommunication } = await import('@/lib/communications/send')
          const { render } = await import('@react-email/render')
          const { ReklamationFristAbgelaufenEmail, subject: reklaSubject } = await import('@/lib/email/google/templates/ReklamationFristAbgelaufen')
          const reklaProps = { vorname: p.vorname ?? null }
          const html = await render(ReklamationFristAbgelaufenEmail(reklaProps))
          await sendCommunication('sv_monatsabrechnung', {
            email: p.email,
            vorname: p.vorname ?? '',
            subject: reklaSubject(reklaProps),
            html,
          })
        }
      }
    } catch { /* */ }
  }

  // 2. Überfällige Bearbeitung (> 3 Werktage) → Admin-Task
  const dreiTageAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: ueberfaellig } = await db.from('reklamationen')
    .select('id, fall_id')
    .eq('status', 'eingereicht')
    .lt('eingereicht_am', dreiTageAgo)
    .gte('frist_bis', now) // Frist noch nicht abgelaufen

  for (const r of ueberfaellig ?? []) {
    // Nur einmal Task pro Reklamation erstellen (KFZ-151: ueber entity_id deduplizieren)
    const { data: existingTask } = await db.from('tasks')
      .select('id')
      .eq('entity_type', 'reklamation')
      .eq('entity_id', r.id)
      .eq('status', 'offen')
      .limit(1)
      .maybeSingle()

    if (!existingTask) {
      // Partial-batch-Schutz: createLinkedTask-throw darf den Lauf nicht abbrechen.
      try {
        await createLinkedTask({
          fall_id: r.fall_id,
          titel: 'Überfällige Reklamation bearbeiten (3-Werktage-Frist §7)',
          typ: 'reklamation',
          prioritaet: 'dringend',
          faellig_am: new Date(),
          entity_type: 'reklamation',
          entity_id: r.id,
        })
      } catch (err) {
        console.error(`[KFZ-150 rekla] Überfällig-Task ${r.id} fehlgeschlagen:`, err instanceof Error ? err.message : err)
      }
    }
  }

  return NextResponse.json({ ok: true, autoAbgelehnt: abgelaufen?.length ?? 0, ueberfaellig: ueberfaellig?.length ?? 0 })
}
