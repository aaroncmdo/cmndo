import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendLeadReminderEmail } from '@/lib/email/lead-reminders'

// AAR-477 C11: Cron-Route — Reminder-Kaskade 2h/24h/72h + Timeout-Marker.
//
// Läuft stündlich (vercel.json), findet offene Self-Service-Leads ohne
// zugehörigen Fall, sendet je nach Alter Reminder 1/2/3. Anschließend
// RPC mark_expired_leads() für die 7-Tage-Disqualifikation.
//
// Auth-Konvention: Bearer ${CRON_SECRET} — identisch zu allen anderen
// Crons im Projekt (siehe abrechnung-reminder, whatsapp-erinnerungen usw.).

export const dynamic = 'force-dynamic'

type Candidate = {
  id: string
  email: string
  vorname: string | null
  reminder_token: string
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const h2 = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const h72 = new Date(now.getTime() - 72 * 60 * 60 * 1000)

  // Kohorten-Helper: Lädt Kandidaten für ein bestimmtes Reminder-Fenster.
  // Filter:
  //   - status='neu' und disqualifiziert=false (noch offen)
  //   - source_channel='self_service' (nicht für Makler-generierte Leads)
  //   - reminder_N_sent_at IS NULL (nicht schon versendet)
  //   - created_at <= before (alt genug für diese Stufe)
  //   - keine Faelle mit lead_id = lead.id (nicht konvertiert)
  async function candidates(
    before: Date,
    reminderField: 'reminder_1_sent_at' | 'reminder_2_sent_at' | 'reminder_3_sent_at',
  ): Promise<Candidate[]> {
    const { data, error } = await supabase
      .from('leads')
      .select('id, email, vorname, reminder_token, source_channel')
      .eq('status', 'neu')
      .eq('disqualifiziert', false)
      .eq('source_channel', 'self_service')
      .is(reminderField, null)
      .lte('created_at', before.toISOString())
      .not('email', 'is', null)
      .limit(50)
    if (error) {
      console.error('[AAR-477] Kandidaten-Query fehlgeschlagen:', reminderField, error.message)
      return []
    }
    if (!data || data.length === 0) return []

    // Lead-IDs, für die bereits ein Fall existiert → ausfiltern
    const leadIds = data.map((l) => l.id)
    const { data: existingFaelle } = await supabase
      .from('faelle')
      .select('lead_id')
      .in('lead_id', leadIds)
    const skip = new Set(
      (existingFaelle ?? [])
        .map((f) => f.lead_id as string | null)
        .filter((x): x is string => !!x),
    )

    return data
      .filter((l) => !skip.has(l.id as string))
      .map((l) => ({
        id: l.id as string,
        email: l.email as string,
        vorname: (l.vorname as string | null) ?? null,
        reminder_token: l.reminder_token as string,
      }))
  }

  const [cohort1, cohort2, cohort3] = await Promise.all([
    candidates(h2, 'reminder_1_sent_at'),
    candidates(h24, 'reminder_2_sent_at'),
    candidates(h72, 'reminder_3_sent_at'),
  ])

  let sent = 0
  let failed = 0

  async function processStep(
    lead: Candidate,
    step: 1 | 2 | 3,
    field: 'reminder_1_sent_at' | 'reminder_2_sent_at' | 'reminder_3_sent_at',
  ) {
    const ok = await sendLeadReminderEmail(lead, step)
    if (!ok) {
      failed += 1
      return
    }
    const { error: upErr } = await supabase
      .from('leads')
      .update({ [field]: new Date().toISOString() })
      .eq('id', lead.id)
    if (upErr) {
      console.error('[AAR-477] markSent fehlgeschlagen:', lead.id, field, upErr.message)
      failed += 1
      return
    }
    sent += 1
  }

  // Sequenziell pro Stufe, parallel zwischen den Stufen wäre möglich, aber
  // der Kohorten-Set ist klein (limit 50) und Resend hat Rate-Limits.
  for (const l of cohort1) await processStep(l, 1, 'reminder_1_sent_at')
  for (const l of cohort2) await processStep(l, 2, 'reminder_2_sent_at')
  for (const l of cohort3) await processStep(l, 3, 'reminder_3_sent_at')

  // 7-Tage-Timeout im selben Tick
  const { error: rpcErr } = await supabase.rpc('mark_expired_leads')
  if (rpcErr) {
    console.error('[AAR-477] mark_expired_leads RPC fehlgeschlagen:', rpcErr.message)
  }

  return NextResponse.json({
    sent,
    failed,
    cohorts: {
      r1: cohort1.length,
      r2: cohort2.length,
      r3: cohort3.length,
    },
    expired_rpc: rpcErr ? 'error' : 'ok',
  })
}
