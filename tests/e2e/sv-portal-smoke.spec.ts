import { test } from '@playwright/test'
import path from 'path'

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', '14.05.2026', 'aar-894-sv-smoke')

test.describe('AAR-894 SV-Portal — Test-Aaron', () => {
  test('smoke: /gutachter/heute + /gutachter/kalender', async ({ browser }) => {
    test.setTimeout(420_000)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text()}`) })
    page.on('pageerror', (err) => pageErrors.push(`[pageerror] ${err.message}`))

    await page.goto('http://localhost:3014/login')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-login-page.png'), fullPage: true })
    await page.fill('input[name="email"]', 'aaron.sprafke@claimondo.de')
    await page.fill('input[name="password"]', 'Test1234!')
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('/login') || url.pathname.includes('/login/2fa'), { timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
    console.log('Post-Login URL:', page.url())
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-post-login.png'), fullPage: true })

    // Wenn 2FA: stoppen mit klarer Meldung
    if (page.url().includes('/login/2fa')) {
      console.log('STOPPED: 2FA required for Test-Aaron account')
      await context.close()
      return
    }

    await page.goto('http://localhost:3014/gutachter/heute')
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(3000)
    console.log('Heute final URL:', page.url())
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-gutachter-heute.png'), fullPage: true })

    await page.goto('http://localhost:3014/gutachter/kalender', { timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(3000)
    console.log('Kalender final URL:', page.url())
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-gutachter-kalender.png'), fullPage: true })

    await page.goto('http://localhost:3014/gutachter/auftraege', { timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(2000)
    console.log('Auftraege final URL:', page.url())
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-gutachter-auftraege.png'), fullPage: true })

    await page.goto('http://localhost:3014/gutachter', { timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(2000)
    console.log('Gutachter-Root final URL:', page.url())
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-gutachter-root.png'), fullPage: true })

    console.log('=== Console-Errors ===')
    consoleErrors.forEach((e) => console.log(e))
    console.log('=== Page-Errors ===')
    pageErrors.forEach((e) => console.log(e))

    await context.close()
  })
})
