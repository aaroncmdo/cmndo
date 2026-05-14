// Mobile-Cockpit-Smoke für SV-Portal.
// iPhone-14 viewport, Login, /gutachter/heute + andere Tabs, Tab-Bar-Klick.

import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3007'
const OUT = 'docs/14.05.2026/design-audit/sv-mobile-cockpit'
const EMAIL = 'aaron.sprafke@claimondo.de'
const PW = 'Test1234!'

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: false, slowMo: 250 })
const ctx = await browser.newContext({
  ...devices['iPhone 14'],
  geolocation: { latitude: 50.94, longitude: 6.96 },
  permissions: ['geolocation'],
})
await ctx.addCookies([{ name: 'claimondo-cookie-consent', value: 'true', domain: 'localhost', path: '/' }])

const page = await ctx.newPage()
page.on('pageerror', err => console.log('PAGE-ERROR:', err.message))

console.log('Login …')
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', PW)
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
])

console.log('1. /gutachter/heute — Map fullbleed + Tab-Bar + Header-Capsule …')
await page.goto(BASE + '/gutachter/heute', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(4500)
await page.screenshot({ path: join(OUT, '01-heute.png') })

console.log('2. Tab: Aufträge')
await page.locator('nav[aria-label="SV-Mobile-Navigation"] a:has-text("Aufträge")').click({ timeout: 10000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(OUT, '02-auftraege.png') })

console.log('3. Tab: Fälle')
await page.locator('nav[aria-label="SV-Mobile-Navigation"] a:has-text("Fälle")').click({ timeout: 10000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(OUT, '03-faelle.png') })

console.log('4. Tab: Kalender')
await page.locator('nav[aria-label="SV-Mobile-Navigation"] a:has-text("Kalender")').click({ timeout: 10000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(OUT, '04-kalender.png') })

console.log('5. Tab: Mehr — sollte den Drawer öffnen')
await page.locator('nav[aria-label="SV-Mobile-Navigation"] button:has-text("Mehr")').click({ timeout: 10000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: join(OUT, '05-mehr-drawer.png') })

// Drawer wieder zu
await page.keyboard.press('Escape').catch(() => {})
await page.locator('body').click({ position: { x: 350, y: 400 } }).catch(() => {})
await page.waitForTimeout(700)

console.log('6. Zurück auf Heute — Map sollte hinter Tab-Bar durchschimmern')
await page.locator('nav[aria-label="SV-Mobile-Navigation"] a:has-text("Heute")').click({ timeout: 10000 })
await page.waitForTimeout(3500)
await page.screenshot({ path: join(OUT, '06-heute-final.png') })

console.log('=== DONE ===')
await page.waitForTimeout(8000)
await browser.close()
