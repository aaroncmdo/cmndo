import { test, type Page } from '@playwright/test'
import path from 'path'

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', '14.05.2026', 'aar-907-radii-sweep-smoke')

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('http://localhost:3015/login', { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 120_000 })
}

test.describe('AAR-907 Radii-Sweep Visual', () => {
  test('Dispatch-Portal als Admin', async ({ browser }) => {
    test.setTimeout(480_000)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    const errs: string[] = []
    page.on('pageerror', (e) => errs.push(e.message))

    await loginAs(page, 'test-admin@claimondo.de', 'Test1234!')

    await page.goto('http://localhost:3015/dispatch/leads', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-dispatch-leads.png'), fullPage: true })

    await page.goto('http://localhost:3015/dispatch/karte', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-dispatch-karte.png'), fullPage: true })

    await page.goto('http://localhost:3015/dispatch/dashboard', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-dispatch-dashboard.png'), fullPage: true })

    console.log('Admin/Dispatch errors:', errs.length, errs.slice(0, 5))
    await ctx.close()
  })

  test('SV-Portal als Test-Aaron', async ({ browser }) => {
    test.setTimeout(480_000)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    const errs: string[] = []
    page.on('pageerror', (e) => errs.push(e.message))

    await loginAs(page, 'aaron.sprafke@claimondo.de', 'Test1234!')

    await page.goto('http://localhost:3015/gutachter/heute', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-gutachter-heute.png'), fullPage: true })

    await page.goto('http://localhost:3015/gutachter/kalender', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-gutachter-kalender.png'), fullPage: true })

    await page.goto('http://localhost:3015/gutachter/auftraege', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-gutachter-auftraege.png'), fullPage: true })

    console.log('SV errors:', errs.length, errs.slice(0, 5))
    await ctx.close()
  })

  test('Public Schaden-Melden Wizard', async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    const errs: string[] = []
    page.on('pageerror', (e) => errs.push(e.message))

    await page.goto('http://localhost:3015/schaden-melden')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-schaden-melden.png'), fullPage: true })

    console.log('Public errors:', errs.length, errs.slice(0, 5))
    await ctx.close()
  })
})
