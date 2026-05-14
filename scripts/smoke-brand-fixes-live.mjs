// Live-Smoke der vier Brand-Fixes:
//   1. V2-Extraktion mit KARpro-Logo
//   2. Sidebar-Schrift (ondo-Ton + 13px + Racing-Font)
//   3. Glass-Backdrop der Floating-Pills
//   4. Hilfe&Support-Footer lesbar
//
// Headed, langsam, Screenshots pro Schritt. Browser bleibt offen für Inspektion.

import { chromium } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3007'
const OUT = 'docs/14.05.2026/design-audit/screenshots-brand-fixes-live'
const EMAIL = 'aaron.sprafke@claimondo.de'
const PW = 'Test1234!'
const LOGO_PATH = 'tests/fixtures/test-logo.png'

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: false, slowMo: 400 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

let idx = 0
const step = async (label, delay = 800) => {
  idx++
  await page.waitForTimeout(delay)
  const filename = `${String(idx).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: join(OUT, filename), fullPage: true })
  console.log(`[${String(idx).padStart(2, '0')}] ${label} → ${filename}`)
}

page.on('pageerror', err => console.log('PAGE-ERROR:', err.message))
page.on('console', msg => {
  const text = msg.text()
  if (text.includes('[branding]') || text.includes('[onboarding-branding]')) {
    console.log('BROWSER:', text.slice(0, 200))
  }
})

// 1. Login
console.log('1) Login …')
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', PW)
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 90000 }).catch(() => {}),
  page.click('button[type="submit"]'),
])

// 2. Branding-Editor + Logo neu hochladen für frische V2-Extraktion
console.log('2) Branding-Editor + Logo …')
await page.goto(BASE + '/gutachter/profil/branding', { waitUntil: 'domcontentloaded', timeout: 60000 })
await step('editor-start', 2500)

const clearBtn = page.locator('button:has-text("Anderes Logo wählen")').first()
if (await clearBtn.count() > 0) {
  await clearBtn.click()
  await page.waitForTimeout(500)
}
const fileInput = page.locator('input[type="file"]').first()
await fileInput.setInputFiles(LOGO_PATH)
await step('logo-uploading', 1500)

console.log('3) Warten auf Upload + V2-Extraktion + Auto-Save …')
try {
  await page.waitForFunction(() => {
    const txt = document.body.innerText
    return !txt.includes('Wird hochgeladen')
      && !txt.includes('Hintergrund wird entfernt')
      && !txt.includes('Farben & Stil werden analysiert')
      && !txt.includes('werden analysiert')
  }, { timeout: 180000 })
  console.log('   extraction done — waiting for auto-save settle …')
  await page.waitForTimeout(3000)
} catch {
  console.log('   timeout — capture anyway')
}
await step('logo-extracted-v2', 2500)

// 3. /gutachter/heute — Sidebar Floating Default + Glass-Pills + Map-Backdrop
console.log('4) /gutachter/heute mit Brand …')
await page.goto(BASE + '/gutachter/heute', { waitUntil: 'domcontentloaded', timeout: 60000 })
await step('heute-floating-default', 4000)

// 4. Zoom auf Sidebar — Logo-Pill
console.log('5) Sidebar-Closeup (Logo) …')
const logoPill = page.locator('aside[role="navigation"] > div').first()
if (await logoPill.count() > 0) {
  await logoPill.screenshot({ path: join(OUT, `${String(++idx).padStart(2, '0')}-sidebar-logo-pill.png`) })
  console.log(`[${String(idx).padStart(2, '0')}] sidebar-logo-pill`)
}

// 5. Zoom auf Nav-Pill
console.log('6) Sidebar-Closeup (Nav) …')
const navPill = page.locator('aside[role="navigation"] > nav').first()
if (await navPill.count() > 0) {
  await navPill.screenshot({ path: join(OUT, `${String(++idx).padStart(2, '0')}-sidebar-nav-pill.png`) })
  console.log(`[${String(idx).padStart(2, '0')}] sidebar-nav-pill`)
}

// 6. Zoom auf Footer-Pill (H&S + Profil + Einstellungen + Abmelden)
console.log('7) Sidebar-Closeup (Footer) …')
const footerPill = page.locator('aside[role="navigation"] > div').last()
if (await footerPill.count() > 0) {
  await footerPill.screenshot({ path: join(OUT, `${String(++idx).padStart(2, '0')}-sidebar-footer-pill.png`) })
  console.log(`[${String(idx).padStart(2, '0')}] sidebar-footer-pill`)
}

// 7. Bar-Mode zum Vergleich
console.log('8) Bar-Mode Vergleich …')
await page.goto(BASE + '/gutachter/heute?sidebar=bar', { waitUntil: 'domcontentloaded', timeout: 60000 })
await step('heute-bar-mode', 3000)

// Zurück auf Floating
console.log('9) Zurück auf Floating …')
await page.goto(BASE + '/gutachter/heute?sidebar=floating', { waitUntil: 'domcontentloaded', timeout: 60000 })
await step('heute-floating-final', 3000)

console.log('\n=== DONE — Browser bleibt 20s offen ===')
await page.waitForTimeout(20000)
await browser.close()
