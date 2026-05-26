import { test } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// CMM-65 realtime smoke — one-time Kunde login that caches the auth state so the
// realtime spec can be re-run without hammering POST /login (staging blips 502
// on login under pool load). Mirrors the admin/sv storageState pattern in
// tests/e2e/fixtures.ts. Named *.spec.ts so the default chromium project runs it.
//
// Run once (env via runner): npx playwright test kunde-auth-setup --project=chromium

const BASE = process.env.STAGING_APP_URL ?? 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? ''
const KUNDE_EMAIL = process.env.TEST_KUNDE_EMAIL ?? 'test-kunde@claimondo.de'
const KUNDE_PASS = process.env.TEST_KUNDE_PASSWORD ?? 'Test1234!'
const KUNDE_STORAGE =
  process.env.KUNDE_STORAGE ?? path.resolve(__dirname, '..', '..', 'playwright', '.auth', 'kunde.json')

test.use({
  baseURL: BASE,
  httpCredentials: BASIC_PASS ? { username: BASIC_USER, password: BASIC_PASS } : undefined,
})

test('kunde auth setup -> save storageState', async ({ page, context }) => {
  test.setTimeout(120_000)
  test.skip(!process.env.RUN_CMM65_SMOKE, 'set RUN_CMM65_SMOKE=1 to run (see smoke-audit MD)')
  test.skip(!BASIC_PASS, 'STAGING_BASIC_AUTH_PASS not set')

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', KUNDE_EMAIL)
  await page.fill('input[type="password"], input[name="password"]', KUNDE_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})

  fs.mkdirSync(path.dirname(KUNDE_STORAGE), { recursive: true })
  await context.storageState({ path: KUNDE_STORAGE })
  console.log(`[setup] landed=${page.url()} -> saved storageState to ${KUNDE_STORAGE}`)
})
