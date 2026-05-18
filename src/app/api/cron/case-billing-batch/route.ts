import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processCaseBilling } from '@/lib/abrechnung/process-case-billing'

export const dynamic = 'force-dynamic'

/**
 * AAR-924: Batch-Cron als Reconcile-Backstop fuer processCaseBilling().
 *
 * Primaer-Pfad ist der State-Machine-Trigger in transitionFallStatus()
 * (siehe src/lib/faelle/state-machine.ts). Dieser Cron faengt Faelle ein die
 * den State-Trigger verpasst haben (Crash, manuelle DB-Updates, Status-Sprung
 * via Webhook ohne transitionFallStatus()-Call usw.).
 *
 * Filter: sv_id IS NOT NULL AND lead_preis_netto IS NULL AND status in
 * BILLABLE_STATUSES. processCaseBilling() ist idempotent (no-op bei bereits
 * gesetztem lead_preis_netto), Race-Safe auch wenn parallel mit State-Trigger.
 *
 * Schedule: taeglich 17:00 (1h vor cron/abrechnung-erstellen das die
 * eigentliche Rechnung erstellt).
 */

const BILLABLE_STATUSES = [
  'gutachten-eingegangen',
  'filmcheck',
  'qc-pruefung',
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung',
  'regulierung-laeuft',
  'vs-kuerzt',
  'nachbesichtigung-laeuft',
  'vs-abgelehnt',
  'klage',
  'zahlung-eingegangen',
  'abgeschlossen',
]

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Faelle mit SV, fakturierbar, aber noch keine Berechnung
  const { data: faelle, error } = await db
    .from('faelle')
    .select('id, status')
    .not('sv_id', 'is', null)
    .is('lead_preis_netto', null)
    .in('status', BILLABLE_STATUSES)
    .limit(500)

  if (error) {
    console.error('[AAR-924] case-billing-batch query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!faelle?.length) {
    return NextResponse.json({ ok: true, processed: 0, skipped: 0, errors: 0 })
  }

  let processed = 0
  let skipped = 0
  let errors = 0

  for (const fall of faelle) {
    try {
      const result = await processCaseBilling(fall.id)
      if (result) {
        processed++
        console.log(`[AAR-924] batch processed fall ${fall.id} (status=${fall.status}): lead_preis=${result.lead_preis_netto}`)
      } else {
        // null = bereits berechnet, schadenhoehe 0, oder kein sv_id (sollte
        // durch Filter ausgeschlossen sein)
        skipped++
      }
    } catch (err) {
      errors++
      console.error(`[AAR-924] processCaseBilling fall ${fall.id} fehlgeschlagen:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    errors,
    total_candidates: faelle.length,
  })
}
