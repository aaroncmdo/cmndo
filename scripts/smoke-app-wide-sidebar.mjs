// App-wide Sidebar-Rollout-Smoke.
//
// Iteriert durch alle Portale (Gutachter, Admin, Dispatch, Kunde, ggf. Kanzlei)
// und shottet Desktop (1440x900) sowie Mobile (390x844 iPhone-14). Sieht ob
// die Floating-Pills mit Backdrop-Blur überall greifen.

import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3007'
const OUT = 'docs/14.05.2026/design-audit/app-wide-sidebar'
const EMAIL = 'aaron.sprafke@claimondo.de'
const PW = 'Test1234!'

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const ROUTES = [
  { label: 'gutachter-heute', path: '/gutachter/heute' },
  { label: 'gutachter-tagesmodul', path: '/gutachter/heute' },
  { label: 'admin-faelle', path: '/admin/faelle' },
  { label: 'dispatch-leads', path: '/dispatch/leads' },
  { label: 'kunde-portal', path: '/kunde' },
]

const browser = await chromium.launch({ headless: false, slowMo: 200 })

// Desktop
console.log('=== DESKTOP 1440x900 ===')
const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const dPage = await desktopCtx.newPage()
dPage.on('pageerror', err => console.log('PAGE-ERROR:', err.message))

async function login(p) {
  // Cookie-Consent preempt: setze die acceptance bevor wir die Seite laden,
  // damit der Banner gar nicht erst rendert (er versperrt sonst den Submit).
  await p.context().addCookies([
    {
      name: 'claimondo-cookie-consent',
      value: 'true',
      domain: 'localhost',
      path: '/',
    },
  ])
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await p.fill('input[name="email"]', EMAIL)
  await p.fill('input[name="password"]', PW)
  await Promise.all([
    p.waitForURL(u => !u.pathname.includes('/login'), { timeout: 60000 }),
    p.click('button[type="submit"]'),
  ])
}

console.log('Login (desktop) …')
await login(dPage)

for (const r of ROUTES) {
  console.log(`  desktop → ${r.path}`)
  try {
    await dPage.goto(BASE + r.path, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await dPage.waitForTimeout(3500)
    await dPage.screenshot({ path: join(OUT, `desktop-${r.label}.png`), fullPage: false })
  } catch (e) {
    console.log(`    skipped — ${e.message.slice(0, 80)}`)
  }
}

await desktopCtx.close()

// Mobile (iPhone 14)
console.log('\n=== MOBILE iPhone-14 ===')
const mobileCtx = await browser.newContext({ ...devices['iPhone 14'] })
const mPage = await mobileCtx.newPage()
mPage.on('pageerror', err => console.log('PAGE-ERROR:', err.message))

console.log('Login (mobile) …')
await login(mPage)

for (const r of ROUTES) {
  console.log(`  mobile → ${r.path}`)
  try {
    await mPage.goto(BASE + r.path, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await mPage.waitForTimeout(3500)
    await mPage.screenshot({ path: join(OUT, `mobile-${r.label}.png`), fullPage: false })
    // Drawer öffnen wenn vorhanden
    const burger = mPage.locator('button[aria-label*="Menü öffnen" i]').first()
    if (await burger.count() > 0) {
      await burger.click().catch(() => {})
      await mPage.waitForTimeout(900)
      await mPage.screenshot({ path: join(OUT, `mobile-${r.label}-drawer.png`), fullPage: false })
      // Drawer wieder zu via Escape oder Overlay-Click
      await mPage.keyboard.press('Escape').catch(() => {})
    }
  } catch (e) {
    console.log(`    skipped — ${e.message.slice(0, 80)}`)
  }
}

await mobileCtx.close()
console.log('\n=== DONE ===')
await browser.close()
