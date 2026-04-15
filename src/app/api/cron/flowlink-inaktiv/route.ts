import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * AAR-147 / Spec §3 Phase 6: Inaktiv-Cron für FlowLinks.
 *
 * Läuft alle 30 Minuten. Wenn ein FlowLink seit mehr als 2 Stunden erstellt
 * ist und noch nicht geöffnet wurde (geoeffnet_am IS NULL, status='offen'),
 * dann wird für den zuständigen Dispatcher ein Task „Token-Link inaktiv"
 * angelegt — damit der MA den Kunden nachträglich anruft.
 *
 * Dedupe: Pro Lead wird maximal alle 4 Stunden ein neuer Inaktiv-Task
 * erstellt. Wenn bereits ein offener Task mit task_typ='inaktiv_followup'
 * existiert oder in den letzten 4h einer angelegt wurde, wird er übersprungen.
 *
 * NOTE: flow_links hat die Spalte `erstellt_am` (nicht `created_at`) —
 * siehe Schema. Das wurde im ursprünglichen page.tsx-Refactor übersehen.
 */
export async function GET() {
  const db = createAdminClient()

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  // FlowLinks die seit >2h inaktiv sind (offen + nie geöffnet)
  const { data: stale } = await db
    .from('flow_links')
    .select('id, lead_id, erstellt_am, leads(vorname, nachname, telefon)')
    .eq('status', 'offen')
    .is('geoeffnet_am', null)
    .lt('erstellt_am', twoHoursAgo)

  let created = 0
  let skipped = 0

  for (const fl of (stale ?? []) as Array<{
    id: string
    lead_id: string | null
    erstellt_am: string
    leads: unknown
  }>) {
    if (!fl.lead_id) continue

    // Dedupe: Task mit task_typ='inaktiv_followup' existiert bereits + ist frisch
    const { count: existing } = await db
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', fl.lead_id)
      .eq('task_typ', 'inaktiv_followup')
      .gte('created_at', fourHoursAgo)

    if ((existing ?? 0) > 0) {
      skipped++
      continue
    }

    // Lead-Info für die Task-Beschreibung (nested-FK normalisieren)
    const leadRel = fl.leads
    const lead = (Array.isArray(leadRel) ? leadRel[0] : leadRel) as
      | { vorname: string | null; nachname: string | null; telefon: string | null }
      | null
    const name = `${lead?.vorname ?? ''} ${lead?.nachname ?? ''}`.trim() || 'Kunde'
    const tel = lead?.telefon ?? '—'
    const hoursInactive = Math.floor((Date.now() - new Date(fl.erstellt_am).getTime()) / (60 * 60 * 1000))

    await db.from('tasks').insert({
      typ: 'dispatch',
      task_typ: 'inaktiv_followup',
      titel: `Token-Link inaktiv — Kunde anrufen: ${name}`,
      beschreibung: `FlowLink seit ${hoursInactive}h inaktiv. Telefon: ${tel}. Bitte Kunde anrufen und Status klären.`,
      status: 'offen',
      prioritaet: 'dringend',
      entity_type: 'lead',
      entity_id: fl.lead_id,
      lead_id: fl.lead_id,
      faellig_am: new Date().toISOString(),
      auto_erstellt: true,
    })

    created++
  }

  return NextResponse.json({
    ok: true,
    checked: stale?.length ?? 0,
    created,
    skipped,
  })
}
