// 2026-05-07: Console-/Network-/Page-Error-Logger fuer eine spezifische
// Route. Komplement zu screenshot-route.mjs — der macht visuelles
// Debugging, dieses Skript faengt Runtime-Errors + Failed-Requests ab.
//
// Verwendung:
//   MSYS_NO_PATHCONV=1 node scripts/check-console-errors.mjs /gutachter/feldmodus
//   MSYS_NO_PATHCONV=1 node scripts/check-console-errors.mjs /gutachter/feldmodus --base=https://cmndo.vercel.app
//   MSYS_NO_PATHCONV=1 node scripts/check-console-errors.mjs /gutachter/feldmodus --wait=8000
//
// Output: stdout — gefilterte Errors + Warnings + Failed-Requests.

import { chromium } from 'playwright'

const BASE_URL = (process.argv.find((a) => a.startsWith('--base='))?.split('=')[1])
  ?? process.env.SCREENSHOT_BASE_URL
  ?? 'https://cmndo.vercel.app'
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? 'Test1234!'
const WAIT_MS = parseInt(process.argv.find((a) => a.startsWith('--wait='))?.split('=')[1] ?? '6000', 10)

const TEST_USERS = {
  gutachter: { email: 'test-sv@claimondo.de', landingMatch: /\/gutachter/ },
  dispatch:  { email: 'test-dispatch@claimondo.de', landingMatch: /\/dispatch/ },
  kunde:     { email: 'test-kunde@claimondo.de', landingMatch: /\/kunde/ },
}

const routes = process.argv.filter((a, i) => i >= 2 && !a.startsWith('--'))
if (routes.length === 0) {
  console.error('Usage: node scripts/check-console-errors.mjs <route> [--base=...] [--wait=6000]')
  process.exit(1)
}

function portalFor(path) {
  const seg = path.split('/').filter(Boolean)[0]
  return seg && TEST_USERS[seg] ? seg : null
}

async function login(page, email) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const emailTab = page.locator('button:has-text("E-Mail")').first()
  if (await emailTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailTab.click()
  }
  await page.locator('input[type="email"], input[name="email"]').fill(email)
  await page.locator('input[type="password"], input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const consoleMsgs = []
const pageErrors = []
const failedRequests = []

page.on('console', (msg) => {
  consoleMsgs.push({ type: msg.type(), text: msg.text() })
})
page.on('pageerror', (err) => {
  pageErrors.push({ message: err.message, stack: err.stack ?? null })
})
page.on('requestfailed', (req) => {
  failedRequests.push({ url: req.url(), failure: req.failure()?.errorText ?? '' })
})
page.on('response', (resp) => {
  const status = resp.status()
  if (status >= 400) {
    failedRequests.push({ url: resp.url(), failure: `HTTP ${status}` })
  }
})

console.log(`Base: ${BASE_URL}`)
console.log(`Routes: ${routes.join(', ')}`)
console.log(`Wait: ${WAIT_MS} ms\n`)

for (const route of routes) {
  const portal = portalFor(route)
  if (!portal) {
    console.error(`✗ ${route} — kein Test-User für Portal`)
    continue
  }
  consoleMsgs.length = 0
  pageErrors.length = 0
  failedRequests.length = 0

  await login(page, TEST_USERS[portal].email)
  console.log(`\n=== ${route} (${TEST_USERS[portal].email}) ===`)

  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (err) {
    console.error(`  goto-Error: ${err.message}`)
  }
  await page.waitForTimeout(WAIT_MS)

  const errors = consoleMsgs.filter((m) => m.type === 'error')
  const warnings = consoleMsgs.filter((m) => m.type === 'warning')
  const logs = consoleMsgs.filter((m) => m.type === 'log').slice(-10)

  if (pageErrors.length) {
    console.log(`  PAGE-ERRORS (${pageErrors.length}):`)
    for (const e of pageErrors) console.log(`    ❌ ${e.message}`)
  }
  if (errors.length) {
    console.log(`  CONSOLE-ERRORS (${errors.length}):`)
    for (const e of errors.slice(0, 15)) console.log(`    ❌ ${e.text.slice(0, 400)}`)
  }
  if (failedRequests.length) {
    console.log(`  FAILED-REQUESTS (${failedRequests.length}):`)
    for (const r of failedRequests.slice(0, 15)) console.log(`    ⚠ ${r.failure}: ${r.url.slice(0, 200)}`)
  }
  if (warnings.length) {
    console.log(`  WARNINGS (${warnings.length}, erste 5):`)
    for (const w of warnings.slice(0, 5)) console.log(`    ⚠ ${w.text.slice(0, 200)}`)
  }
  if (!pageErrors.length && !errors.length && !failedRequests.length) {
    console.log('  ✓ keine Errors/Failed-Requests')
    if (logs.length) {
      console.log('  letzte console.log:')
      for (const l of logs) console.log(`    · ${l.text.slice(0, 200)}`)
    }
  }
  console.log(`  URL final: ${page.url()}`)
}

await browser.close()
