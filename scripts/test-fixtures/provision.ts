import type { SupabaseClient } from '@supabase/supabase-js'
import { makeClient, Reporter } from './lib'
import { ensureAccounts } from './accounts'
import { ensureSeedGraph } from './seed-graph'

export async function runProvision(db: SupabaseClient, opts: { dryRun: boolean }): Promise<Reporter> {
  const reporter = new Reporter()
  const o = { reporter, dryRun: opts.dryRun }
  console.log(`\n=== Test-Fixtures-Provisioner ${opts.dryRun ? '(DRY-RUN)' : ''} ===`)
  console.log('— Accounts —')
  await ensureAccounts(db, o)
  console.log('— Seed-Graph —')
  await ensureSeedGraph(db, o)
  return reporter
}

// CLI-Entry (nur wenn direkt ausgeführt)
if (process.argv[1] && process.argv[1].endsWith('provision.ts')) {
  const dryRun = process.argv.includes('--dry-run')
  runProvision(makeClient(), { dryRun })
    .then((rep) => {
      rep.print()
      console.log(`\nFertig — ${rep.failures} Fehler.`)
      process.exit(rep.exitCode())
    })
    .catch((err) => {
      console.error('Provisioner-Crash:', err)
      process.exit(2)
    })
}
