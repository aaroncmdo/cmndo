#!/usr/bin/env node
/**
 * scripts/journey-smoke.mjs — User-Journey-Smoke (POC: Phase 1+2)
 *
 * Anders als der state-smoke (scripts/e2e-full-smoke.mjs):
 *  - Kein Service-Role-Forcing für Forward-Progress
 *  - Jede Aktion klick-by-klick durch die UI
 *  - Pro Aktion: 4-Rollen-Cross-Check (Admin/Dispatch/SV/Kunde)
 *  - Pop-Over- und Exit-Pfade explizit getestet
 *  - Daten-Hygiene-Asserts (was darf NICHT mehr sichtbar sein)
 *
 * Voraussetzungen:
 *  1. Dev-Server läuft auf localhost:3000
 *  2. node scripts/e2e-reset.mjs && node scripts/e2e-seed-fixtures.mjs (für Test-User + Fixtures)
 *
 * POC-Limit: dieser Run testet nur Phase 1 (Webform) + Phase 2 (Dispatch-Quali).
 * Phasen 3-12 folgen iterativ nach Aaron-Review.
 */

import { teardown, writeReport, getFindings } from './journey/_helpers.mjs'
import { runPhase1 } from './journey/01-webform.mjs'
import { runPhase2 } from './journey/02-dispatch-quali.mjs'
import { runPhase3 } from './journey/03-button-audit.mjs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

async function pruefeDevServer() {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5_000) })
    return res.status < 500
  } catch {
    return false
  }
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Claimondo Journey-Smoke (POC: Phase 1+2)`)
  console.log(`  Zeitstempel: ${ts}`)
  console.log(`  Base-URL:    ${BASE_URL}`)
  console.log('═══════════════════════════════════════════════════\n')

  if (!(await pruefeDevServer())) {
    console.error(`[FEHLER] Dev-Server nicht erreichbar unter ${BASE_URL}`)
    process.exit(1)
  }

  let phase1Result = null
  let phase2Result = null
  let phase3Result = null

  try {
    phase1Result = await runPhase1()
    phase2Result = await runPhase2(phase1Result)
    phase3Result = await runPhase3()
  } catch (err) {
    console.error('[Journey-Smoke] Unerwarteter Fehler:', err)
  } finally {
    await teardown()
  }

  // Report
  const reportPath = writeReport()
  const findings = getFindings()
  const counts = {
    PASS: findings.filter((f) => f.sev === 'PASS').length,
    INFO: findings.filter((f) => f.sev === 'INFO').length,
    SOFT: findings.filter((f) => f.sev === 'SOFT').length,
    HARD: findings.filter((f) => f.sev === 'HARD').length,
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  Journey-Smoke abgeschlossen`)
  console.log(`  PASS: ${counts.PASS}  INFO: ${counts.INFO}  SOFT: ${counts.SOFT}  HARD: ${counts.HARD}`)
  console.log(`  Report:      ${reportPath}`)
  console.log('═══════════════════════════════════════════════════')

  process.exit(counts.HARD > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('[FATAL]', err)
  process.exit(1)
})
