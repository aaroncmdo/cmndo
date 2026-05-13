#!/usr/bin/env node
// Authd-Smoke: Admin-Login + Test-Plan-Routen aus PR #992
//   - /admin/finance (Tiles)
//   - /admin (Dashboard)
//   - /admin/faelle
//   - /gutachter/heute (SV-Sicht)
// Pro Route: HTTP 200, kein "Application Error", kein violet/rose/purple/indigo im HTML.

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const OUT = join(__dirname, 'smoke-screenshots-authd')

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de'
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? 'Test1234!'
const SV_EMAIL = process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de'
const SV_PASS = process.env.TEST_SV_PASSWORD ?? 'Test1234!'

const ADMIN_ROUTES = [
  { path: '/admin', label: 'admin-dashboard' },
  { path: '/admin/finance', label: 'admin-finance' },
  { path: '/admin/faelle', label: 'admin-faelle' },
  { path: '/admin/sachverstaendige', label: 'admin-sv' },
]

const SV_ROUTES = [
  { path: '/gutachter', label: 'gutachter-home' },
  { path: '/gutachter/heute', label: 'gutachter-heute' },
  { path: '/gutachter/faelle', label: 'gutachter-faelle' },
]

const FORBIDDEN = [
  /class="[^"]*\bviolet-\d/,
  /class="[^"]*\bpurple-\d/,
  /class="[^"]*\brose-\d/,
  /class="[^"]*\bindigo-\d/,
]

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

async function login(page, email, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 30_000 })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
}

async function smokeRoutes(page, routes, prefix) {
  const out = []
  for (const { path, label } of routes) {
    const r = { label, path, status: null, hasError: false, forbiddenHits: [] }
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 })
      r.status = resp?.status() ?? 0
      const html = await page.content()
      if (/Application Error|Internal Server Error|500 - Server-side Exception/i.test(html)) r.hasError = true
      for (const re of FORBIDDEN) {
        const m = html.match(re)
        if (m) r.forbiddenHits.push(m[0].slice(0, 100))
      }
      await page.screenshot({ path: join(OUT, `${prefix}-${label}.png`), fullPage: false })
    } catch (err) {
      r.status = 'CRASH'
      r.error = String(err).slice(0, 200)
    }
    const ok = (r.status === 200 || r.status === 304) && !r.hasError && r.forbiddenHits.length === 0
    console.log(`${ok ? '✓' : '✗'} ${prefix}/${label.padEnd(22)} ${String(r.status).padEnd(5)} forbidden=${r.forbiddenHits.length}${r.hasError ? ' APP-ERR' : ''}${r.error ? ' ' + r.error : ''}`)
    if (r.forbiddenHits.length) for (const h of r.forbiddenHits) console.log(`    └─ ${h}`)
    out.push(r)
  }
  return out
}

const browser = await chromium.launch()
const allResults = { admin: [], sv: [] }

// Admin
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    await login(page, ADMIN_EMAIL, ADMIN_PASS)
    console.log(`[admin] logged in as ${ADMIN_EMAIL}`)
    allResults.admin = await smokeRoutes(page, ADMIN_ROUTES, 'admin')
  } catch (err) {
    console.error(`[admin] login failed: ${err}`)
  }
  await ctx.close()
}

// SV
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    await login(page, SV_EMAIL, SV_PASS)
    console.log(`[sv] logged in as ${SV_EMAIL}`)
    allResults.sv = await smokeRoutes(page, SV_ROUTES, 'sv')
  } catch (err) {
    console.error(`[sv] login failed: ${err}`)
  }
  await ctx.close()
}

await browser.close()

const flat = [...allResults.admin, ...allResults.sv]
const pass = flat.filter((r) => (r.status === 200 || r.status === 304) && !r.hasError && r.forbiddenHits.length === 0).length
const fail = flat.length - pass
writeFileSync(join(OUT, '..', 'smoke-authd-result.json'), JSON.stringify({ pass, fail, ...allResults }, null, 2))
console.log(`\n${pass} pass, ${fail} fail.`)
process.exit(fail > 0 ? 1 : 0)
