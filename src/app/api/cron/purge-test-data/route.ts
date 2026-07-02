import { NextResponse } from 'next/server'
import { purgeTestData } from '@/lib/health/purge-test-data'
import { recordFailedOperation, markOperationResolved } from '@/lib/reliability/dead-letter'

export const dynamic = 'force-dynamic'

/**
 * Test-Daten-Janitor (Design 2026-07-02): entfernt Seed-/Test-Pollution aus Prod.
 *
 * Sicherheit: CRON_SECRET-gated; dryRun ist DEFAULT (liefert nur das Manifest). Echtes Loeschen
 * nur mit explizitem `?confirm=DELETE-TESTDATA`. Loescht nur Claims/Leads + Dependents, NIE
 * Accounts; Recency-Guard 72h + Safety-Cap (bei zu vielen Zielen Abbruch ohne Loeschung).
 *
 * Bei echten Laeufen (nicht Dry-Run) wird das Ergebnis an die Reliability-Schicht gemeldet:
 * Safety-Cap-Abbruch oder Delete-Fehler -> Dead-Letter (recovery-monitor-Cron eskaliert an
 * Admins), sonst resolved. Sonst verschwaende `cron-call.sh` das Ergebnis im `> /dev/null`.
 *
 * Doppelnutzung: manueller One-Shot (curl) + nightly VPS-Cron.
 */
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const confirm = new URL(request.url).searchParams.get('confirm')
  const dryRun = confirm !== 'DELETE-TESTDATA'

  const manifest = await purgeTestData({ dryRun })

  if (!dryRun) {
    const DEDUP = 'purge-test-data-daily'
    if (manifest.capExceeded || manifest.errors.length > 0) {
      await recordFailedOperation({
        operationType: 'purge_test_data',
        dedupKey: DEDUP,
        error: manifest.capExceeded ? manifest.errors[0] : `${manifest.errors.length} Delete-Fehler`,
        payload: {
          capExceeded: manifest.capExceeded,
          targets: manifest.t1.length + manifest.t2.length,
          deleted: manifest.deleted,
          errors: manifest.errors.slice(0, 10),
        },
      })
    } else {
      await markOperationResolved(DEDUP)
    }
  }

  return NextResponse.json(manifest, { status: 200 })
}
