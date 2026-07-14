import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
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
 * Filter: sv_id IS NOT NULL AND lead_preis_netto IS NULL AND operative_status in
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
  // B2b: KB-Closes tragen jetzt feine Terminals in operative_status (statt coarse 'abgeschlossen').
  // Alle sind >= gutachten-eingegangen = billable (Finder-Fee unabhaengig vom Claim-Outcome).
  'reguliert_vollstaendig',
  'klage_rechtsstreit',
  'verjaehrt',
  'abgelehnt_final',
  'an_externe_kanzlei_uebergeben',
]

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // CMM-49 Reader-Sweep: faelle-frei — alle Filterfelder leben auf claims (SSoT):
  // operative_status (CMM-74 b″, mirror von faelle.status), sv_id (CMM-60, 0-diff),
  // lead_preis_netto (CMM-44 SP-J, CLAIM_OWNED). Der frühere Zwei-Schritt
  // (claims→billableIds→faelle.in('claim_id')) entfaellt; eine claims-Query deckt alles.
  // Value-neutral: der 1 faelle-lose Orphan-Claim hat sv_id=NULL → vom
  // .not('sv_id','is',null)-Filter ausgeschlossen. processCaseBilling nimmt eine claims.id
  // (resolveClaimId(claimId)=claimId) + ist idempotent (no-op bei gesetztem
  // claims.lead_preis_netto), daher outcome-identisch zum frueheren faelle-Anker.
  const { data: billable, error } = await db
    .from('claims')
    .select('id, operative_status')
    .in('operative_status', BILLABLE_STATUSES)
    .not('sv_id', 'is', null)
    .is('lead_preis_netto', null)
    .limit(500)

  if (error) {
    console.error('[AAR-924] case-billing-batch claims query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!billable?.length) {
    return NextResponse.json({ ok: true, processed: 0, skipped: 0, errors: 0 })
  }

  let processed = 0
  let skipped = 0
  let errors = 0

  for (const claim of billable) {
    const claimStatus = (claim.operative_status as string | null) ?? null
    try {
      const result = await processCaseBilling(claim.id)
      if (result) {
        processed++
        console.log(`[AAR-924] batch processed claim ${claim.id} (status=${claimStatus}): lead_preis=${result.lead_preis_netto}`)
      } else {
        // null = bereits berechnet, schadenhoehe 0, oder kein sv_id (sollte
        // durch Filter ausgeschlossen sein)
        skipped++
      }
    } catch (err) {
      errors++
      console.error(`[AAR-924] processCaseBilling claim ${claim.id} fehlgeschlagen:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    errors,
    total_candidates: billable.length,
  })
}
