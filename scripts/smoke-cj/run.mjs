// Entry — Customer-Journey-Smoke-Runner
//
// Beispiele:
//   node scripts/smoke-cj/run.mjs --base staging --live          ← Live-Watch
//   node scripts/smoke-cj/run.mjs --base staging --live --pause  ← Live + Schritt pro Tastendruck
//   node scripts/smoke-cj/run.mjs --base staging                 ← Headless CI-Mode mit Auto-Restart

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
  const args = {
    iter: 'iter-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'),
    base: 'staging',
    live: false,
    pause: false,
  }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]?.replace(/^--/, '')
    if (!k) continue
    if (k === 'live' || k === 'pause') { args[k] = true; continue }
    args[k] = argv[i + 1]
    i += 1
  }
  return args
}

function resolveDomains(base) {
  if (base === 'local') {
    return { marketing: 'http://localhost:3000', app: 'http://localhost:3000' }
  }
  if (base === 'staging') {
    // Wildcard *.staging.claimondo.de live — gleicher Host für Marketing+App auf Staging
    // (auf Prod sind es zwei Hosts; siehe project_subdomain_architektur memory)
    return { marketing: 'https://app.staging.claimondo.de', app: 'https://app.staging.claimondo.de' }
  }
  if (base === 'prod') {
    // ACHTUNG — gegen Prod nur mit User-Confirmation. Default ist staging.
    return { marketing: 'https://claimondo.de', app: 'https://app.claimondo.de' }
  }
  // Fallback: base als komplette URL
  return { marketing: base, app: base }
}

async function main() {
  const args = parseArgs()
  const { marketing: marketingBaseUrl, app: appBaseUrl } = resolveDomains(args.base)
  const dateFolder = new Date().toISOString().slice(0, 10).split('-').reverse().join('.')
  const outDir = path.join('docs', dateFolder, 'smoke-claimondo-de', args.iter)

  console.log(`▶ CJ-Smoke ${args.live ? '(LIVE)' : '(headless)'}`)
  console.log(`  Marketing: ${marketingBaseUrl}`)
  console.log(`  App:       ${appBaseUrl}`)
  console.log(`  Output:    ${outDir}`)
  console.log(`  Steps:     ${STEPS.length}`)
  if (args.live) console.log('  → Browser bleibt sichtbar, SlowMo 400ms, Step-HUD oben rechts')
  if (args.pause) console.log('  → Pause zwischen Steps: Enter drücken')
  console.log()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const reporter = new Reporter({ outDir, iterName: args.iter })
  const ui = new UiDriver({
    marketingBaseUrl,
    appBaseUrl,
    outDir,
    supabaseAdminClient: supabase,
    live: args.live,
    pause: args.pause,
  })
  const db = new DbWatcher({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    outDir,
  })
  const assert = new AssertionTrack({ supabase })

  const tablesOfInterest = [
    'leads', 'faelle', 'flow_links', 'nachrichten', 'gutachter_termine',
    'claims', 'auftraege', 'dokumente', 'vs_reaktionen', 'abrechnungen',
  ]

  await ui.start()
  await db.start(tablesOfInterest)
  await assert.start()

  const orchestrator = new Orchestrator({
    steps: STEPS,
    tracks: { ui, db, assert },
    seedReset,
    reporter,
    live: args.live,
  })

  const result = await orchestrator.run()
  reporter.finalize({ ok: result.ok, reason: result.reason })

  if (!args.live) {
    await ui.cancel()
    await db.cancel()
    await assert.cancel()
  }
  process.exit(result.ok ? 0 : 1)
}

main().catch((err) => {
  console.error('Smoke-Run abgestürzt:', err)
  process.exit(1)
})
