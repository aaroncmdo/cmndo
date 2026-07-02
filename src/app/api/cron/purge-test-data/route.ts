import { NextResponse } from 'next/server'
import { purgeTestData } from '@/lib/health/purge-test-data'

export const dynamic = 'force-dynamic'

/**
 * Test-Daten-Janitor (Design 2026-07-02): entfernt Seed-/Test-Pollution aus Prod.
 *
 * Sicherheit: CRON_SECRET-gated; dryRun ist DEFAULT (liefert nur das Manifest). Echtes Loeschen
 * nur mit explizitem `?confirm=DELETE-TESTDATA`. Loescht nur Claims/Leads + Dependents, NIE
 * Accounts; Recency-Guard 72h schuetzt mid-flight Smoke-Runs.
 *
 * Doppelnutzung: manueller One-Shot (curl) + optionaler nightly Janitor (Smoke-Residue akkumuliert).
 */
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const confirm = new URL(request.url).searchParams.get('confirm')
  const dryRun = confirm !== 'DELETE-TESTDATA'

  const manifest = await purgeTestData({ dryRun })
  return NextResponse.json(manifest, { status: 200 })
}
