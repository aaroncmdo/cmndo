import { test as base, type Page } from '@playwright/test'
import path from 'path'

// KFZ-185: Test fixtures with auth-state caching.

const ADMIN_STORAGE = path.join(__dirname, '../../playwright/.auth/admin.json')
const SV_STORAGE = path.join(__dirname, '../../playwright/.auth/sv.json')

async function login(page: Page, email: string, password: string, storageFile: string) {
  await page.goto('/login')
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15_000 })
  await page.context().storageState({ path: storageFile })
}

// Fixtures that provide pre-authenticated pages
export const test = base.extend<{
  adminPage: Page
  svPage: Page
}>({
  adminPage: async ({ browser }, use) => {
    const email = process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de'
    const password = process.env.TEST_ADMIN_PASSWORD ?? 'Test1234!'
    const ctx = await browser.newContext({ storageState: ADMIN_STORAGE }).catch(async () => {
      // First run — no stored state, login fresh
      const freshCtx = await browser.newContext()
      const page = await freshCtx.newPage()
      await login(page, email, password, ADMIN_STORAGE)
      await page.close()
      await freshCtx.close()
      return browser.newContext({ storageState: ADMIN_STORAGE })
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  svPage: async ({ browser }, use) => {
    const email = process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de'
    const password = process.env.TEST_SV_PASSWORD ?? 'Test1234!'
    const ctx = await browser.newContext({ storageState: SV_STORAGE }).catch(async () => {
      const freshCtx = await browser.newContext()
      const page = await freshCtx.newPage()
      await login(page, email, password, SV_STORAGE)
      await page.close()
      await freshCtx.close()
      return browser.newContext({ storageState: SV_STORAGE })
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },
})

export { expect } from '@playwright/test'
