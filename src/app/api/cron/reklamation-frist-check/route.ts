import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'

export const dynamic = 'force-dynamic'

/**
 * KFZ-150 Block I: Reklamation-Frist-Check Cron (täglich 10:00).
 * Abgelaufene Reklamationen auto-ablehnen + überfällige Admin-Tasks.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
    await db.from('reklamationen').update({ status: 'auto_abgelehnt_frist', bearbeitet_am: now }).eq('id', r.id)

    // KFZ-151: Auto-Resolve aller offenen Tasks zu dieser Reklamation
    await resolveTasksForEntity('reklamation', r.id, 'Reklamation auto-abgelehnt: Frist abgelaufen')

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
      await createLinkedTask({
        fall_id: r.fall_id,
        titel: 'Überfällige Reklamation bearbeiten (3-Werktage-Frist §7)',
        typ: 'reklamation',
        prioritaet: 'dringend',
        faellig_am: new Date(),
        entity_type: 'reklamation',
        entity_id: r.id,
      })
    }
  }

  return NextResponse.json({ ok: true, autoAbgelehnt: abgelaufen?.length ?? 0, ueberfaellig: ueberfaellig?.length ?? 0 })
}
