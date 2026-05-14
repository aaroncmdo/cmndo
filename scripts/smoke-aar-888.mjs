// AAR-888 — RLS-Smoke gegen staging.claimondo.de
// Sichtbarer Chromium (headless:false) + Screenshots in docs/14.05.2026/aar-888-smoke/
// Usage: node scripts/smoke-aar-888.mjs [flow]
//   flow = "rueckruf" | "magic-link" | "zb1" | "onboarding" | "all"
//   Default: "rueckruf"

import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAIN_REPO = path.resolve(__dirname, '../../../../')
const SHOTS_DIR = path.join(MAIN_REPO, 'docs/14.05.2026/aar-888-smoke')

const STAGING_URL = 'https://staging.claimondo.de'
const BASIC_USER = 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASSWORD ?? 'ClaimondoSuperuser123789!!'

const FLOW = process.argv[2] ?? 'rueckruf'

async function shot(page, name) {
  const file = path.join(SHOTS_DIR, `${name}.png`)
  await fs.mkdir(SHOTS_DIR, { recursive: true })
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  📸 ${path.relative(MAIN_REPO, file)}`)
}

async function withBrowser(fn) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 600,
    args: ['--window-size=1400,900'],
  })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await context.newPage()
  try {
    await fn(page)
  } finally {
    console.log('\n  Browser bleibt 5s offen … schließt dann automatisch.')
    await page.waitForTimeout(5000)
    await browser.close()
  }
}

// ────────────────────────────────────────────────────────────────────────
// Flow 1: Marketing-Rückruf-Modal
// Erwartung: Modal öffnet, Submit klappt, kein 500/RLS-Fehler.
// Testet: gutachter_finder_anfragen.gfa_insert_public (LASSEN) + Lead-Insert
//   (sollte nicht über anon-Policy laufen, sondern über Server-Action)
// ────────────────────────────────────────────────────────────────────────
async function rueckruf(page) {
  console.log('\n▶ Flow 1: Marketing-Rückruf-Modal')
  console.log(`  → ${STAGING_URL}/`)
  await page.goto(`${STAGING_URL}/`, { waitUntil: 'domcontentloaded' })
  await shot(page, '01-rueckruf-landing')

  // Rückruf-Button finden (kann verschiedene Labels haben)
  const triggers = [
    'text=Kostenlosen Rückruf',
    'text=Rückruf anfordern',
    'text=Rückruf',
    'text=Jetzt Rückruf',
    'button:has-text("Rückruf")',
  ]
  let opened = false
  for (const sel of triggers) {
    const btn = page.locator(sel).first()
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`  Trigger gefunden: ${sel}`)
      await btn.click()
      opened = true
      break
    }
  }
  if (!opened) {
    console.log('  ⚠ Kein Rückruf-Trigger sichtbar — Screenshot zur Inspektion.')
    await shot(page, '01-rueckruf-no-trigger')
    return
  }

  await page.waitForTimeout(800)
  await shot(page, '02-rueckruf-modal-open')

  // Heuristik: erste-name / nachname / telefon / email Felder
  const nameField = page.locator('input[name*="name" i], input[placeholder*="Name" i]').first()
  const phoneField = page.locator('input[type="tel"], input[name*="tel" i], input[name*="phone" i], input[placeholder*="elefon" i]').first()
  const emailField = page.locator('input[type="email"]').first()

  if (await nameField.isVisible({ timeout: 1500 }).catch(() => false)) {
    await nameField.fill('AAR-888 Smoke')
  }
  if (await phoneField.isVisible({ timeout: 1500 }).catch(() => false)) {
    await phoneField.fill('+49 151 12345678')
  }
  if (await emailField.isVisible({ timeout: 1500 }).catch(() => false)) {
    await emailField.fill('aar-888-smoke@claimondo.de')
  }
  await shot(page, '03-rueckruf-modal-filled')

  // Submit
  const submit = page.locator('button[type="submit"]:visible, button:has-text("Absenden"):visible, button:has-text("Anfordern"):visible').first()
  if (!(await submit.isVisible({ timeout: 1500 }).catch(() => false))) {
    console.log('  ⚠ Kein Submit-Button sichtbar.')
    await shot(page, '03b-rueckruf-no-submit')
    return
  }

  // Capture network errors
  const networkErrors = []
  page.on('response', (resp) => {
    if (resp.status() >= 400 && resp.url().includes('claimondo')) {
      networkErrors.push(`${resp.status()} ${resp.url()}`)
    }
  })

  await submit.click()
  await page.waitForTimeout(2500)
  await shot(page, '04-rueckruf-after-submit')

  if (networkErrors.length > 0) {
    console.log('  ❌ Netzwerk-Errors:')
    networkErrors.forEach((e) => console.log(`     ${e}`))
  } else {
    console.log('  ✓ Submit ohne 4xx/5xx-Errors.')
  }
}

// ────────────────────────────────────────────────────────────────────────
// Step 1: Login als test-dispatch
// Erwartung: Login klappt, Redirect aus /login raus auf Dispatch-Landing.
// ────────────────────────────────────────────────────────────────────────
async function dispatchLogin(page) {
  console.log('\n▶ Step 1: Login als test-dispatch')
  const email = process.env.TEST_DISPATCH_EMAIL ?? 'test-dispatch@claimondo.de'
  const password = process.env.TEST_DISPATCH_PASSWORD ?? 'Test1234!'

  console.log(`  → ${STAGING_URL}/login`)
  await page.goto(`${STAGING_URL}/login`, { waitUntil: 'domcontentloaded' })
  await shot(page, '10-login-page')

  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await shot(page, '11-login-filled')

  const networkErrors = []
  page.on('response', (resp) => {
    if (resp.status() >= 500 && resp.url().includes('claimondo')) {
      networkErrors.push(`${resp.status()} ${resp.url()}`)
    }
  })

  await page.click('button[type="submit"]')
  // Either we leave /login (success) or stay (2FA prompt or error)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const url = page.url()
  console.log(`  Post-login URL: ${url}`)
  await shot(page, '12-after-login')

  if (url.includes('/login')) {
    // Possibly 2FA or error
    const twofaVisible = await page.locator('text=/2FA|Code|Verifizierung/i').first().isVisible({ timeout: 1500 }).catch(() => false)
    if (twofaVisible) {
      console.log('  ⚠ 2FA-Prompt sichtbar — Test-User hat 2FA AN (sollte AUS sein laut Memory).')
    } else {
      const err = await page.locator('text=/Fehler|falsch|nicht/i').first().textContent().catch(() => '')
      console.log(`  ❌ Login fehlgeschlagen, noch auf /login. Sichtbarer Text: "${err}"`)
    }
    return false
  }

  if (networkErrors.length > 0) {
    console.log('  ❌ 5xx beim Login:')
    networkErrors.forEach((e) => console.log(`     ${e}`))
    return false
  }

  console.log('  ✓ Login erfolgreich.')
  return true
}

// ────────────────────────────────────────────────────────────────────────
// Magic-Link Smoke
// Erwartung: /flow/<token> lädt, kein 5xx, Inhalte sichtbar.
// ────────────────────────────────────────────────────────────────────────
async function magicLink(page) {
  console.log('\n▶ Magic-Link Smoke')
  const token = process.env.SMOKE_FLOW_TOKEN ?? '5b0fe6baf3ba716dba3596210f0c1d26'
  const url = `${STAGING_URL}/flow/${token}`
  console.log(`  → ${url}`)

  const networkErrors = []
  page.on('response', (resp) => {
    if (resp.status() >= 500 && resp.url().includes('claimondo')) {
      networkErrors.push(`${resp.status()} ${resp.url()}`)
    }
  })

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await shot(page, '20-flow-token-landing')

  const visibleText = await page.locator('body').textContent().catch(() => '')
  const isError = /500|nicht gefunden|abgelaufen|Fehler/i.test(visibleText?.slice(0, 500) ?? '')

  if (networkErrors.length > 0) {
    console.log('  ❌ 5xx:')
    networkErrors.forEach((e) => console.log(`     ${e}`))
  } else {
    console.log('  ✓ Kein 5xx-Error.')
  }
  if (isError) {
    console.log('  ⚠ Body enthält Error-Begriff (siehe Screenshot).')
  } else {
    console.log('  ✓ Page rendert ohne sichtbare Error-Texte.')
  }

  // Scroll runter um zu sehen was alles geladen ist
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
  await page.waitForTimeout(800)
  await shot(page, '21-flow-token-scrolled')
}

async function main() {
  console.log(`AAR-888 Smoke — Flow: ${FLOW}`)
  console.log(`Staging: ${STAGING_URL} (Basic-Auth: ${BASIC_USER})`)
  console.log(`Shots: ${path.relative(MAIN_REPO, SHOTS_DIR)}`)

  await withBrowser(async (page) => {
    if (FLOW === 'rueckruf') {
      await rueckruf(page)
    } else if (FLOW === 'login') {
      await dispatchLogin(page)
    } else if (FLOW === 'magic-link') {
      await magicLink(page)
    } else if (FLOW === 'onboarding' || FLOW === 'all') {
      const ok = await dispatchLogin(page)
      if (!ok) {
        console.log('Abbruch: Login fehlgeschlagen.')
        return
      }
      console.log('\nNext: Lead-Anlage via Dispatch-UI — pausiere für Inspektion.')
      await page.waitForTimeout(15000)
    } else {
      console.log(`Flow "${FLOW}" noch nicht implementiert.`)
    }
  })
  console.log('\n✓ Smoke beendet.')
}

main().catch((err) => {
  console.error('✗ Smoke gescheitert:', err)
  process.exit(1)
})
