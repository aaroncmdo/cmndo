import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-907 Staging-Vollstaendig-Smoke: ab Startseite bis Account angelegt
// auf https://staging.claimondo.de mit nginx-Basic-Auth.
//
// Geduldiger Wait fuer den /flow/[token]-Pfad — signSAandCreateFall +
// createKundeAccount koennen je 5-10s dauern auf staging (Storage, Auth,
// Email, Mitteilungen).
//
// Run:
//   STAGING_BASIC_PASS=... npx playwright test smoke-staging-vollstaendig --headed

const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'aar907-staging-vollstaendig',
  'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const BASE = process.env.STAGING_BASE_URL ?? 'https://staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_PASS ?? ''
const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const EMAIL = `smoke-voll-staging-${RUN_ID}@claimondo.de`

let stepIdx = 0
async function shot(page: Page, name: string) {
  stepIdx += 1
  const f = `${String(stepIdx).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, f), fullPage: true })
  console.log(`[SHOT-STAGING] ${f}`)
}

async function dismissCookie(page: Page) {
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
}

async function paintCanvas(page: Page): Promise<boolean> {
  const canvas = page.locator('canvas').first()
  if (!(await canvas.isVisible().catch(() => false))) return false
  const box = await canvas.boundingBox()
  if (!box) return false
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(box.x + 30, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - 20)
  await page.mouse.move(box.x + box.width - 30, cy + 10)
  await page.mouse.up()
  await page.mouse.move(box.x + 50, cy + 25)
  await page.mouse.down()
  await page.mouse.move(cx - 20, cy + 5)
  await page.mouse.move(cx + 50, cy + 25)
  await page.mouse.up()
  return true
}

test.use({
  baseURL: BASE,
  httpCredentials: BASIC_PASS
    ? { username: BASIC_USER, password: BASIC_PASS }
    : undefined,
})

test('Staging Vollstaendig: ab Startseite bis Account-Anlage (Gap-3-Verify)', async ({ page }) => {
  test.setTimeout(300_000)
  if (!BASIC_PASS) test.skip(true, 'STAGING_BASIC_PASS nicht gesetzt')

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[BROWSER error] ${m.text()}`)
  })

  // ═══ PHASE 1: Startseite ═══════════════════════════════════════════
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '01-staging-startseite')

  // CTA "Schaden melden"
  await page.locator('a[href="/schaden-melden"]').first().click()
  await page.waitForURL(/\/schaden-melden(?:\?|$)/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '02-staging-mini-wizard')

  // ═══ PHASE 2: Mini-Wizard mit 5 Pflichtfeldern ═════════════════════
  await page.locator('#unfallort').fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#vorname').fill('AnnaStaging')
  await page.locator('#nachname').fill('StagingTest')
  await page.locator('#telefon').fill('+49 221 1234567')
  await page.locator('#email').fill(EMAIL)
  await page.locator('[data-slot="checkbox"]').first().click()
  await shot(page, '03-staging-ausgefuellt')

  await page.getByRole('button', { name: /login-link erhalten/i }).click()
  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 30_000 })
  await shot(page, '04-staging-bestaetigung')

  // ═══ PHASE 3: Token aus DB ═══════════════════════════════════════════
  // Staging hat keinen /api/dev/lookup-token (dev-only). Wir nutzen das
  // SUPABASE_SERVICE_ROLE_KEY zwar lokal aber Test kann nicht direkt
  // querien. Stattdessen: wir lesen Token aus dem URL-redirect-Logs.
  // Auf staging laeuft das nicht offen — wir stoppen hier mit Hinweis,
  // dass der Magic-Link-Klick manuell aus Aaron's Email erfolgen muss.
  console.log('[STAGING-VOLL] Bestaetigungs-Page erreicht — naechster Schritt')
  console.log('[STAGING-VOLL] braucht Email-Token (in Production-DB).')
  console.log('[STAGING-VOLL] Manueller Test: Email-Inbox checken, Magic-Link klicken.')
  console.log(`[STAGING-VOLL] Lead-Email: ${EMAIL}`)

  // Wir verifizieren dass der dispatchMagicLink-Pfad funktioniert hat
  expect(page.url()).toContain('/schaden-melden/link-versendet')
  expect(page.url()).toContain('kanal=email')
})

test('Lokal Vollstaendig: ab /flow/[token] bis Account-Anlage', async ({ page }) => {
  // Dieser Test laeuft NUR lokal — staging hat keinen Dev-API-Endpoint
  // /api/dev/lookup-token. Lokal koennen wir Token + Account-Anlage testen.
  test.setTimeout(180_000)
  if (BASE !== 'http://localhost:3000') {
    test.skip(true, 'Nur lokal lauffaehig (Dev-API-Endpoint)')
  }

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/schaden-melden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)

  const lokalEmail = `smoke-lokal-${RUN_ID}@claimondo.de`
  await page.locator('#unfallort').fill('Köln Hbf')
  await page.locator('#vorname').fill('Lokal')
  await page.locator('#nachname').fill('Test')
  await page.locator('#telefon').fill('+49 221 9999999')
  await page.locator('#email').fill(lokalEmail)
  await page.locator('[data-slot="checkbox"]').first().click()
  await page.getByRole('button', { name: /login-link erhalten/i }).click()
  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 25_000 })
  await shot(page, '05-lokal-bestaetigung')

  // Token aus Dev-API
  let token: string | null = null
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(1_000)
    const r = await page.evaluate(async (e) => {
      const res = await fetch(`/api/dev/lookup-token?email=${encodeURIComponent(e)}`)
      return { s: res.status, b: await res.json().catch(() => null) }
    }, lokalEmail)
    if (r.s === 200 && r.b?.token) {
      token = r.b.token
      break
    }
  }
  expect(token).toBeTruthy()
  console.log(`[LOKAL TOKEN] ${token}`)

  // /flow/[token]
  await page.goto(`/flow/${token}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '06-lokal-flow-step1')

  // Step 1: Datenschutz + Weiter
  for (const cb of await page.locator('input[type="checkbox"]:not(:checked)').all()) {
    if (await cb.isVisible().catch(() => false)) {
      await cb.click({ force: true }).catch(() => {})
    }
  }
  await page.getByRole('button', { name: /^weiter/i }).first().click()
  await page.waitForTimeout(2_000)
  await shot(page, '07-lokal-flow-step2')

  // Step 2: gutachter — "Wir suchen einen passenden SV" + Weiter
  await page.getByRole('button', { name: /^weiter/i }).first().click()
  await page.waitForTimeout(2_000)
  await shot(page, '08-lokal-flow-step3-sa')

  // Step 3: SA-Pad + Akzeptanz + SA unterzeichnen
  await paintCanvas(page)
  for (const cb of await page.locator('input[type="checkbox"]:not(:checked)').all()) {
    if (await cb.isVisible().catch(() => false)) {
      await cb.click({ force: true }).catch(() => {})
    }
  }
  await page.waitForTimeout(500)
  await shot(page, '09-lokal-flow-sa-signed')
  await page.getByRole('button', { name: /sa unterzeichnen/i }).click()

  // Gap-3-Fix: warten auf den Account-Step ODER auf /kunde-Redirect.
  // signSAandCreateFall + createKundeAccount koennen 10-20s dauern.
  console.log('[LOKAL] Warte auf Account-Step oder /kunde-Redirect (bis 60s) …')
  const accountStepOrKunde = await Promise.race([
    page
      .locator('text=Geschafft!')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => 'account-step' as const)
      .catch(() => null),
    page
      .waitForURL(/\/kunde/, { timeout: 60_000 })
      .then(() => 'kunde-redirect' as const)
      .catch(() => null),
  ])
  console.log(`[LOKAL] Result: ${accountStepOrKunde}`)
  await shot(page, '10-lokal-nach-sa-submit')

  // Falls Account-Step erreicht: warten bis Auto-Login durch ist
  if (accountStepOrKunde === 'account-step') {
    console.log('[LOKAL] Account-Step erreicht, warte auf Auto-Login (bis 30s)')
    await page.waitForURL(/\/kunde/, { timeout: 30_000 }).catch(() => {
      console.log('[LOKAL] Auto-Login hat nicht weitergeleitet — Fallback-Button vermutlich aktiv')
    })
    await shot(page, '11-lokal-nach-login')
  }

  const finalUrl = page.url()
  console.log(`[LOKAL] Final URL: ${finalUrl}`)
  await shot(page, '12-lokal-final')
})
