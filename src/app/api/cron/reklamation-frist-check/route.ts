import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * KFZ-150 Block I: Reklamation-Frist-Check Cron (täglich 10:00).
 * Abgelaufene Reklamationen auto-ablehnen + überfällige Admin-Tasks.
 */
export async function GET() {
  const db = createAdminClient()
  const now = new Date().toISOString()

  // 1. Frist abgelaufen → auto_abgelehnt_frist
  const { data: abgelaufen } = await db.from('reklamationen')
    .select('id, fall_id, gutachter_id')
    .eq('status', 'eingereicht')
    .lt('frist_bis', now)

  for (const r of abgelaufen ?? []) {
    await db.from('reklamationen').update({ status: 'auto_abgelehnt_frist', bearbeitet_am: now }).eq('id', r.id)

    // Email an SV
    try {
      const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', r.gutachter_id).single()
      if (sv?.profile_id) {
        const { data: p } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
        if (p?.email) {
          const { sendEmail } = await import('@/lib/email/google/client')
          await sendEmail({
            to: p.email,
            subject: 'Reklamation abgelehnt — Frist überschritten',
            html: `<p>Hallo ${p.vorname ?? 'Partner'},</p><p>deine Reklamation wurde automatisch abgelehnt, da die 5-Werktage-Frist überschritten wurde.</p>`,
            empfaengerTyp: 'sv',
            template: 'reklamation_frist_abgelaufen',
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
    // Nur einmal Task erstellen
    const { data: existingTask } = await db.from('tasks')
      .select('id')
      .eq('fall_id', r.fall_id)
      .eq('typ', 'reklamation')
      .eq('status', 'offen')
      .limit(1)
      .maybeSingle()

    if (!existingTask) {
      await db.from('tasks').insert({
        fall_id: r.fall_id,
        titel: 'Überfällige Reklamation bearbeiten (3-Werktage-Frist §7)',
        typ: 'reklamation',
        status: 'offen',
        prioritaet: 'hoch',
        faellig_am: new Date().toISOString(),
      })
    }
  }

  return NextResponse.json({ ok: true, autoAbgelehnt: abgelaufen?.length ?? 0, ueberfaellig: ueberfaellig?.length ?? 0 })
}
