import { test, type Page } from '@playwright/test'
import path from 'path'

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', '14.05.2026', 'aar-910-handrolled-buttons', 'after')

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('http://localhost:3016/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 60_000 })
}

test('AAR-910 After: migrated buttons render', async ({ browser }) => {
  test.setTimeout(240_000)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await loginAs(page, 'test-admin@claimondo.de', 'Test1234!')

  for (const [route, file] of [
    ['/admin/einstellungen/vertraege', '01-vertraege.png'],
    ['/admin/team', '02-team.png'],
    ['/admin/team/incentives', '03-incentives.png'],
  ] as const) {
    await page.goto(`http://localhost:3016${route}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(3000)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, file), fullPage: true })
  }
  console.log('Errors:', pageErrors.length, pageErrors.slice(0, 3))
  await ctx.close()
})
