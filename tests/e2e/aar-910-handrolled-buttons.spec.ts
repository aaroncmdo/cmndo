import { test, type Page } from '@playwright/test'
import path from 'path'

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', '14.05.2026', 'aar-910-handrolled-buttons')

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('http://localhost:3016/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 60_000 })
}

test.describe('AAR-910 Handrolled-Buttons Visual-Audit', () => {
  test('Admin-Routes', async ({ browser }) => {
    test.setTimeout(240_000)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await loginAs(page, 'test-admin@claimondo.de', 'Test1234!')

    const routes = [
      ['/admin/kalender', '01-admin-kalender.png'],
      ['/admin/team', '02-admin-team.png'],
      ['/admin/team/incentives', '03-admin-team-incentives.png'],
      ['/admin/einstellungen/vertraege', '04-admin-vertraege.png'],
    ]
    for (const [route, file] of routes) {
      await page.goto(`http://localhost:3016${route}`)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(2500)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, file), fullPage: true })
    }
    await ctx.close()
  })

  test('SV-Routes', async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await loginAs(page, 'aaron.sprafke@claimondo.de', 'Test1234!')
    await page.goto('http://localhost:3016/gutachter/gebiet')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-gutachter-gebiet.png'), fullPage: true })
    await ctx.close()
  })
})
