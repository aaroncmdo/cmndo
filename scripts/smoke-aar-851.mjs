// AAR-851 — Post-REVOKE Smoke gegen staging.claimondo.de
// Verifiziert dass /kunde/termin/[token] Server-Component-Render funktioniert
// trotz REVOKE SELECT FROM anon auf gutachter_termine.
// Token ist abgelaufen → Erwartung: "Link nicht mehr gültig"-Page, keine 5xx.

import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAIN_REPO = path.resolve(__dirname, '../../../../')
const SHOTS_DIR = path.join(MAIN_REPO, 'docs/14.05.2026/aar-851-smoke')

const STAGING_URL = 'https://staging.claimondo.de'
const BASIC_USER = 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASSWORD ?? 'ClaimondoSuperuser123789!!'
const TOKEN = '_MzIhCXb2v3cOHEW6165qEqlqZFn3mnWzfBjRY5HFM8'

async function shot(page, name) {
  const file = path.join(SHOTS_DIR, `${name}.png`)
  await fs.mkdir(SHOTS_DIR, { recursive: true })
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  📸 ${path.relative(MAIN_REPO, file)}`)
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 400 })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await context.newPage()

  const networkErrors = []
  page.on('response', (resp) => {
    if (resp.status() >= 500 && resp.url().includes('claimondo')) {
      networkErrors.push(`${resp.status()} ${resp.url()}`)
    }
  })

  try {
    const url = `${STAGING_URL}/kunde/termin/${TOKEN}`
    console.log(`▶ ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await shot(page, '01-termin-token-page')

    const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
    const isExpiredPage = /Link nicht mehr gültig|nicht mehr gültig/i.test(bodyText.slice(0, 500))

    console.log(networkErrors.length === 0 ? '  ✓ Kein 5xx' : `  ❌ 5xx: ${networkErrors.join(', ')}`)
    console.log(isExpiredPage ? '  ✓ Page rendert "Link nicht mehr gültig" (Server-Component load OK)' : '  ⚠ Unerwartete Page — Body-Anfang: ' + bodyText.slice(0, 200))

    await page.waitForTimeout(3000)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('✗ Smoke gescheitert:', err)
  process.exit(1)
})
