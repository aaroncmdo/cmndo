#!/usr/bin/env node
// Logged-in UI-Smoke für Cluster F+G PR-2b — gegen staging.claimondo.de.
//
// Pro Rolle: Basic-Auth-Gate, Login, Navigation auf relevante Pages, Screenshot.
// Console-Errors + 5xx-Network-Responses werden mitgeloggt.
//
// Usage:
//   node --env-file=.env.local scripts/smoke-cluster-fg-pr2b-ui.mjs
//
// ENV (alle Pflicht):
//   STAGING_BASIC_USER  STAGING_BASIC_PASS
//   TEST_KUNDE_EMAIL    TEST_KUNDE_PASSWORD      (default: test-kunde@claimondo.de / Test1234!)
//   TEST_SV_EMAIL       TEST_SV_PASSWORD
//   TEST_ADMIN_EMAIL    TEST_ADMIN_PASSWORD
//   TEST_DISPATCH_EMAIL TEST_DISPATCH_PASSWORD

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BASE = 'https://staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_USER || 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_PASS
const SCREENSHOTS_DIR = 'docs/15.05.2026/cluster-fg-pr2b-screenshots'
const PW_DEFAULT = 'Test1234!'

if (!BASIC_PASS) {
  console.error('❌ STAGING_BASIC_PASS fehlt')
  process.exit(1)
}

mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const PERSONAS = [
  {
    role: 'kunde',
    email: process.env.TEST_KUNDE_EMAIL || 'test-kunde@claimondo.de',
    password: process.env.TEST_KUNDE_PASSWORD || PW_DEFAULT,
    pages: [
      { path: '/kunde', name: 'kunde-dashboard' },
      { path: '/kunde/onboarding', name: 'kunde-onboarding' },
    ],
  },
  {
    role: 'sv',
    email: process.env.TEST_SV_EMAIL || 'test-sv@claimondo.de',
    password: process.env.TEST_SV_PASSWORD || PW_DEFAULT,
    pages: [
      { path: '/gutachter', name: 'sv-dashboard' },
      { path: '/gutachter/heute', name: 'sv-heute' },
      { path: '/gutachter/kalender', name: 'sv-kalender' },
    ],
  },
  {
    role: 'admin',
    email: process.env.TEST_ADMIN_EMAIL || 'test-admin@claimondo.de',
    password: process.env.TEST_ADMIN_PASSWORD || PW_DEFAULT,
    pages: [
      { path: '/faelle', name: 'admin-faelle' },
      { path: '/admin/team', name: 'admin-team' },
    ],
  },
  {
    role: 'dispatch',
    email: process.env.TEST_DISPATCH_EMAIL || 'test-dispatch@claimondo.de',
    password: process.env.TEST_DISPATCH_PASSWORD || PW_DEFAULT,
    pages: [
      { path: '/dispatch', name: 'dispatch-home' },
      { path: '/dispatch/leads', name: 'dispatch-leads' },
    ],
  },
]

const findings = []

async function login(page, email, password) {
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await page.fill('input[type=email], input[name=email]', email)
  await page.fill('input[type=password], input[name=password]', password)
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}),
    page.click('button[type=submit]'),
  ])
}

async function smokePersona(browser, persona) {
  const context = await browser.newContext({
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()

  const errors = []
  const fives = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200))
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message.slice(0, 200)}`))
  page.on('response', (resp) => {
    if (resp.status() >= 500 && !resp.url().includes('.css') && !resp.url().includes('.js')) {
      fives.push(`${resp.status()} ${resp.url().slice(0, 120)}`)
    }
  })

  console.log(`\n=== ${persona.role.toUpperCase()} (${persona.email}) ===`)

  try {
    await login(page, persona.email, persona.password)
    // Nach Login: Sind wir wirklich eingeloggt? URL prüfen.
    await page.waitForTimeout(1500)
    const postLoginUrl = page.url()
    console.log(`  ✓ Login → ${postLoginUrl}`)

    for (const p of persona.pages) {
      const t0 = Date.now()
      const resp = await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 20000 }).catch((e) => ({ status: () => 0, error: e.message }))
      const ms = Date.now() - t0
      const status = resp.status ? resp.status() : 0
      const screenshotPath = path.join(SCREENSHOTS_DIR, `${persona.role}-${p.name}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {})
      const result = { role: persona.role, path: p.path, status, ms, screenshot: screenshotPath, errors: [...errors], fives: [...fives] }
      findings.push(result)
      const symbol = status >= 200 && status < 400 && errors.length === 0 && fives.length === 0 ? '✓' : status === 0 ? '✗' : '⚠'
      console.log(`  ${symbol} ${p.path} → ${status} (${ms}ms)${errors.length ? ` errors:${errors.length}` : ''}${fives.length ? ` 5xx:${fives.length}` : ''}`)
      errors.length = 0
      fives.length = 0
    }
  } catch (err) {
    console.log(`  ✗ ${persona.role} failed: ${err.message.slice(0, 200)}`)
    findings.push({ role: persona.role, error: err.message })
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({ headless: true })
for (const persona of PERSONAS) {
  await smokePersona(browser, persona)
}
await browser.close()

writeFileSync(path.join(SCREENSHOTS_DIR, 'findings.json'), JSON.stringify(findings, null, 2))
console.log(`\n=== Done — ${findings.length} Pages, Screenshots in ${SCREENSHOTS_DIR}/ ===`)

const failed = findings.filter((f) => f.error || f.status >= 500 || (f.errors && f.errors.length > 0) || (f.fives && f.fives.length > 0))
process.exit(failed.length > 0 ? 1 : 0)
