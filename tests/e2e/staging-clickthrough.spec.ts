import { test, type Page } from '@playwright/test'
import path from 'path'

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', '14.05.2026', 'staging-clickthrough')
const BASE = 'https://app.staging.claimondo.de'
const BASIC_AUTH = { username: 'aaroncmdo', password: 'ClaimondoSuperuser123789!!' }

async function loginApp(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true })
}

test.describe('Staging Clickthrough', () => {
  test('Admin/Dispatch Journey', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      httpCredentials: BASIC_AUTH,
    })
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })

    await loginApp(page, 'test-admin@claimondo.de', 'Test1234!')
    await shoot(page, '01-admin-landing.png')

    await page.goto(`${BASE}/dispatch/dashboard`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '02-dispatch-dashboard.png')

    await page.goto(`${BASE}/dispatch/leads`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '03-dispatch-leads-list.png')

    const firstLead = page.locator('table tbody tr').first()
    if (await firstLead.count() > 0) {
      await firstLead.click({ force: true })
      await page.waitForLoadState('networkidle').catch(() => {})
      await shoot(page, '04-dispatch-lead-detail.png')
    }

    await page.goto(`${BASE}/dispatch/karte`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(4000)
    await shoot(page, '05-dispatch-karte.png')

    const marker = page.locator('.mapboxgl-marker').first()
    if (await marker.count() > 0) {
      await marker.click({ force: true }).catch(() => {})
      await page.waitForTimeout(1500)
      await shoot(page, '06-dispatch-karte-popup.png')
    }

    await page.goto(`${BASE}/dispatch/kalender`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '07-dispatch-kalender.png')

    await page.goto(`${BASE}/dispatch/sachverstaendige`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '08-dispatch-sachverstaendige.png')

    console.log('ADMIN-Errors:', errors.length)
    errors.slice(0, 30).forEach((e) => console.log(e))
    await ctx.close()
  })

  test('SV Journey (Test-Aaron)', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      httpCredentials: BASIC_AUTH,
    })
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })

    await loginApp(page, 'aaron.sprafke@claimondo.de', 'Test1234!')
    await shoot(page, '09-sv-landing.png')

    await page.goto(`${BASE}/gutachter/heute`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '10-sv-heute.png')

    await page.goto(`${BASE}/gutachter/kalender`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '11-sv-kalender.png')

    await page.goto(`${BASE}/gutachter/auftraege`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '12-sv-auftraege.png')

    await page.goto(`${BASE}/gutachter/profil`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '13-sv-profil.png')

    await page.goto(`${BASE}/gutachter/vertrag`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await shoot(page, '14-sv-vertrag.png')

    console.log('SV-Errors:', errors.length)
    errors.slice(0, 30).forEach((e) => console.log(e))
    await ctx.close()
  })
})
