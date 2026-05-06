import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * KFZ-203: 5-Min Dispatch-Alert Cron.
 * Leads mit status='neu' > 5 Min alt ohne existierende Dispatch-Task
 * → automatisch Task erstellen.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  // Leads die neu sind und aelter als 5 Min
  const { data: staleLeads } = await db
    .from('leads')
    .select('id, vorname, nachname, telefon')
    .eq('qualifizierungs_phase', 'neu')
    .lt('created_at', fiveMinAgo)

  let created = 0

  for (const lead of staleLeads ?? []) {
    // Prüfe ob schon eine offene Dispatch-Task existiert
    const { count } = await db
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('typ', 'dispatch')
      .eq('status', 'offen')
      .eq('entity_type', 'lead')
      .eq('entity_id', lead.id)

    if ((count ?? 0) > 0) continue

    // Task erstellen
    await db.from('tasks').insert({
      titel: `Lead unbearbeitet: ${lead.vorname ?? ''} ${lead.nachname ?? ''} (${lead.telefon ?? '?'})`,
      typ: 'dispatch',
      prioritaet: 'dringend',
      status: 'offen',
      entity_type: 'lead',
      entity_id: lead.id,
      faellig_am: new Date().toISOString(),
    })

    created++
  }

  return NextResponse.json({ ok: true, checked: staleLeads?.length ?? 0, created })
}
