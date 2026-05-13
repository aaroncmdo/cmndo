// Entry — `node scripts/smoke-cj/run.mjs --iter <name> --base staging`
// Lädt .env(.test|.local), startet Orchestrator mit allen drei Tracks.

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { Orchestrator } from './orchestrator.mjs'
import { UiDriver } from './ui-driver.mjs'
import { DbWatcher } from './db-watcher.mjs'
import { AssertionTrack } from './assertion-track.mjs'
import { Reporter } from './reporter.mjs'
import { seedReset } from './seed-reset.mjs'
import { STEPS } from './assertion-map.mjs'

loadEnv({ path: '.env.test' })
loadEnv({ path: '.env.local' })

function parseArgs() {
  const args = { iter: 'iter-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'), base: 'staging' }
  for (let i = 2; i < process.argv.length; i += 2) {
    const k = process.argv[i]?.replace(/^--/, '')
    if (k) args[k] = process.argv[i + 1]
  }
  return args
}

async function main() {
  const { iter, base } = parseArgs()
  const baseUrl = base === 'staging'
    ? 'https://app.staging.claimondo.de'
    : base === 'local'
    ? 'http://localhost:3000'
    : base
  const outDir = path.join('docs', new Date().toISOString().slice(0, 10).split('-').reverse().join('.'), 'smoke-claimondo-de', iter)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const reporter = new Reporter({ outDir, iterName: iter })
  const ui = new UiDriver({ baseUrl, outDir, supabaseAdminClient: supabase })
  const db = new DbWatcher({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    outDir,
  })
  const assert = new AssertionTrack({ supabase })

  // Tabellen die der Watcher abonniert (für alle Steps)
  const tablesOfInterest = ['leads', 'faelle', 'flow_links', 'nachrichten', 'gutachter_termine', 'claims', 'auftraege']

  await ui.start()
  await db.start(tablesOfInterest)
  await assert.start()

  const orchestrator = new Orchestrator({
    steps: STEPS,
    tracks: { ui, db, assert },
    seedReset,
    reporter,
  })

  const result = await orchestrator.run()
  reporter.finalize({ ok: result.ok, reason: result.reason })

  await ui.cancel()
  await db.cancel()
  await assert.cancel()

  process.exit(result.ok ? 0 : 1)
}

main().catch((err) => {
  console.error('Smoke-Run abgestürzt:', err)
  process.exit(1)
})
