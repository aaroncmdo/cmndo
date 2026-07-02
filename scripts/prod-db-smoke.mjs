#!/usr/bin/env node
// Prod-DB-Smoke-Runner: faehrt `src/**/*.prod-smoke.ts` GEGEN DIE PROD-DB (echter Code, echte Daten).
// (Nicht zu verwechseln mit scripts/prod-smoke.mjs — das ist der Marketing-Playwright-Live-Smoke.)
//
//   npm run smoke:db                 # alle *.prod-smoke.ts, dry-run (kein echter Send)
//   npm run smoke:db -- werkstatt    # nur passende
//   SIDE_EFFECT_MODE=test-recipient npm run smoke:db   # Sends an Test-Adresse (s. #1)
//
// KONVENTION (Aaron): Smokes IMMER nur mit den SMOKE-Test-Entities (Smoke-SV / SMOKE-Werkstatt),
// nie mit echten Kunden/SVs. Fixtures: siehe docs/side-effect-mode-prod-smoke.md.
//
// - laedt prod-Creds aus .env.local (falls vorhanden) ODER aus process.env
// - setzt PROD_SMOKE=1 + SIDE_EFFECT_MODE default 'dry-run' -> Write-Pfade senden NICHTS an echt
// - eigene Config -> diese Tests laufen NIE im normalen `npm test`.
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const NEEDED = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && NEEDED.includes(m[1]) && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

const missing = NEEDED.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`[smoke:db] Fehlende Env-Vars: ${missing.join(', ')} — in .env.local setzen oder ins Env exportieren.`)
  process.exit(1)
}

process.env.PROD_SMOKE = '1'
if (!process.env.SIDE_EFFECT_MODE) process.env.SIDE_EFFECT_MODE = 'dry-run'

console.log(`[smoke:db] PROD_SMOKE=1  SIDE_EFFECT_MODE=${process.env.SIDE_EFFECT_MODE}  -> vitest (src/**/*.prod-smoke.ts)`)

const res = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.prod-smoke.config.ts', ...process.argv.slice(2)],
  { stdio: 'inherit', shell: process.platform === 'win32', env: process.env },
)
process.exit(res.status ?? 1)
