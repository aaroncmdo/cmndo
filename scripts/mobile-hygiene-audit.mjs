// Mobile-Hygiene-Audit: Screenshots aller Portale auf iPhone-14-Viewport (390×844).
// Browser ist visible (headless: false), läuft gegen app.staging.claimondo.de
// mit Basic-Auth (User aaroncmdo). Test-User-Login pro Rolle.
//
// Output: docs/14.05.2026/mobile-hygiene/<rolle>/<route>-mobile.png

import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const BASE = process.env.AUDIT_BASE_URL ?? 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_PASS ?? ''
const PASSWORD = process.env.TEST_PASSWORD ?? 'Test1234!'
const OUT = process.env.AUDIT_OUT ?? 'docs/14.05.2026/mobile-hygiene'

// iPhone 14 Pro
const VIEWPORT = { width: 390, height: 844 }
const DEVICE_SCALE = 2
const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

// Public-Routen (kein Login nötig)
const PUBLIC_ROUTES = [
  { name: '01-home', path: '/' },
  { name: '02-schaden-melden', path: '/schaden-melden' },
  { name: '03-gutachter-finden', path: '/gutachter-finden' },
  { name: '04-wie-es-funktioniert', path: '/wie-es-funktioniert' },
  { name: '05-vorteile', path: '/vorteile' },
  { name: '06-ueber-uns', path: '/ueber-uns' },
  { name: '07-faq', path: '/faq' },
  { name: '08-login', path: '/login' },
]

// Portal-Routen pro Rolle. Email-Convention: test-<rolle>@claimondo.de
const PORTALS = [
  {
    role: 'kunde',
    email: 'test-kunde@claimondo.de',
    routes: [
      { name: '01-dashboard', path: '/kunde' },
      { name: '02-onboarding', path: '/kunde/onboarding' },
      { name: '03-faelle', path: '/kunde/faelle' },
    ],
  },
  {
    role: 'sv',
    email: 'test-sv@claimondo.de',
    routes: [
      { name: '01-heute', path: '/gutachter/heute' },
      { name: '02-kalender', path: '/gutachter/kalender' },
      { name: '03-faelle', path: '/gutachter/faelle' },
      { name: '04-profil', path: '/gutachter/profil' },
    ],
  },
  {
    role: 'admin',
    email: 'test-admin@claimondo.de',
    routes: [
      { name: '01-dashboard', path: '/admin' },
      { name: '02-faelle', path: '/admin/faelle' },
      { name: '03-sachverstaendige', path: '/admin/sachverstaendige' },
      { name: '04-finance', path: '/admin/finance' },
    ],
  },
  {
    role: 'dispatch',
    email: 'test-dispatch@claimondo.de',
    routes: [
      { name: '01-dashboard', path: '/dispatch' },
      { name: '02-leads', path: '/dispatch/leads' },
      { name: '03-karte', path: '/dispatch/karte' },
      { name: '04-kalender', path: '/dispatch/kalender' },
    ],
  },
  {
    role: 'kanzlei',
    email: 'test-kanzlei@claimondo.de',
    routes: [
      { name: '01-dashboard', path: '/kanzlei' },
      { name: '02-mandate', path: '/kanzlei/mandate' },
    ],
  },
]

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: false, slowMo: 150 })
const issues = []

async function screenshot(page, dir, name) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const file = join(dir, `${name}-mobile.png`)
  await page.waitForTimeout(800)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function tryLogin(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(500)
  // Email + Password
  await page.fill('input[type="email"], input[name="email"]', email).catch(() => {})
  await page.fill('input[type="password"], input[name="password"]', PASSWORD).catch(() => {})
  await page.click('button[type="submit"]').catch(() => {})
  // Wait for either redirect or error
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 12000 }).catch(() => {})
}

// ===== Public-Routen ohne Login =====
console.log(`\n=== PUBLIC (${PUBLIC_ROUTES.length} routes) ===`)
const publicCtx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE,
  isMobile: true,
  hasTouch: true,
  userAgent: USER_AGENT,
  httpCredentials: BASIC_PASS ? { username: BASIC_USER, password: BASIC_PASS } : undefined,
})
const publicPage = await publicCtx.newPage()
publicPage.on('pageerror', (err) => {
  issues.push({ scope: 'public', url: publicPage.url(), type: 'pageerror', msg: err.message.split('\n')[0] })
})
for (const r of PUBLIC_ROUTES) {
  try {
    const resp = await publicPage.goto(BASE + r.path, { waitUntil: 'networkidle', timeout: 25000 })
    const status = resp ? resp.status() : 0
    const file = await screenshot(publicPage, join(OUT, 'public'), r.name)
    console.log(`OK  public  ${String(status).padEnd(3)} ${r.path.padEnd(30)} → ${file.split('mobile-hygiene/')[1]}`)
    if (status >= 400) issues.push({ scope: 'public', route: r.path, status })
  } catch (err) {
    console.log(`FAIL public      ${r.path} :: ${err.message.split('\n')[0]}`)
    issues.push({ scope: 'public', route: r.path, error: err.message.split('\n')[0] })
  }
}
await publicCtx.close()

// ===== Portal-Routen mit Login pro Rolle =====
for (const p of PORTALS) {
  console.log(`\n=== ${p.role.toUpperCase()} (${p.routes.length} routes) ===`)
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    isMobile: true,
    hasTouch: true,
    userAgent: USER_AGENT,
    httpCredentials: BASIC_PASS ? { username: BASIC_USER, password: BASIC_PASS } : undefined,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (err) => {
    issues.push({ scope: p.role, url: page.url(), type: 'pageerror', msg: err.message.split('\n')[0] })
  })
  try {
    await tryLogin(page, p.email)
    // Login-Erfolg check
    const after = page.url()
    if (after.includes('/login')) {
      console.log(`FAIL login ${p.role} (${p.email}) — bleibt auf /login`)
      issues.push({ scope: p.role, type: 'login-fail', email: p.email, after })
      await screenshot(page, join(OUT, p.role), '00-login-fail')
      await ctx.close()
      continue
    }
    await screenshot(page, join(OUT, p.role), '00-after-login')
  } catch (err) {
    console.log(`FAIL login ${p.role}: ${err.message.split('\n')[0]}`)
    issues.push({ scope: p.role, type: 'login-error', error: err.message.split('\n')[0] })
    await ctx.close()
    continue
  }

  for (const r of p.routes) {
    try {
      const resp = await page.goto(BASE + r.path, { waitUntil: 'networkidle', timeout: 25000 })
      const status = resp ? resp.status() : 0
      const file = await screenshot(page, join(OUT, p.role), r.name)
      console.log(`OK  ${p.role.padEnd(8)} ${String(status).padEnd(3)} ${r.path.padEnd(35)} → ${file.split('mobile-hygiene/')[1]}`)
      if (status >= 400) issues.push({ scope: p.role, route: r.path, status })
    } catch (err) {
      console.log(`FAIL ${p.role.padEnd(8)}     ${r.path} :: ${err.message.split('\n')[0]}`)
      issues.push({ scope: p.role, route: r.path, error: err.message.split('\n')[0] })
    }
  }
  await ctx.close()
}

await browser.close()

console.log(`\n=== ISSUES (${issues.length}) ===`)
for (const i of issues) console.log(' ', JSON.stringify(i))

// Write summary
const summary = {
  base: BASE,
  viewport: VIEWPORT,
  totalIssues: issues.length,
  issues,
  timestamp: new Date().toISOString(),
}
const summaryFile = join(OUT, 'audit-summary.json')
const { writeFileSync } = await import('fs')
writeFileSync(summaryFile, JSON.stringify(summary, null, 2))
console.log(`\nSummary written to ${summaryFile}`)
