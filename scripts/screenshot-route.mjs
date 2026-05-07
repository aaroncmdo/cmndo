// 2026-05-07: Schmales Single-Route-Screenshot-Script fuer Post-PR-Verifikation.
// Komplement zu screenshot-portals.mjs (das alle 24+ Routen × 3 Viewports
// scannt, ~25 min) — diese Variante macht 1-N spezifische Routen × 1-3
// Viewports in ~15-30 s.
//
// Verwendung (Git Bash auf Windows: MSYS_NO_PATHCONV=1 vor `node` setzen,
// sonst expandieren die leading-`/`-Routen zu `C:/Program Files/Git/...`):
//   MSYS_NO_PATHCONV=1 node scripts/screenshot-route.mjs /gutachter/heute
//   MSYS_NO_PATHCONV=1 node scripts/screenshot-route.mjs /gutachter/heute /gutachter/profil
//   MSYS_NO_PATHCONV=1 node scripts/screenshot-route.mjs /kunde --viewports=desktop,mobile
//   MSYS_NO_PATHCONV=1 node scripts/screenshot-route.mjs /dispatch/leads --base=https://cmndo.vercel.app
// Auf Linux/Mac/PowerShell: ohne MSYS_NO_PATHCONV.
//
// Auto-Login: Portal aus dem ersten Pfad-Segment abgeleitet
// (gutachter|dispatch|kunde) -> entsprechender Test-User.
//
// Output: tmp/screenshots/<slug>-<viewport>.png
//   slug = pfad mit '/' -> '_', leading '_' entfernt
//   tmp/ ist gitignored (lokal-only Artefakt)

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE_URL = (process.argv.find((a) => a.startsWith('--base='))?.split('=')[1])
  ?? process.env.SCREENSHOT_BASE_URL
  ?? 'https://cmndo.vercel.app'
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? 'Test1234!'
const OUT_DIR = 'tmp/screenshots'

const ALL_VIEWPORTS = {
  desktop: { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  tablet:  { name: 'tablet',  width: 768,  height: 1024, deviceScaleFactor: 2 },
  mobile:  { name: 'mobile',  width: 390,  height: 844, deviceScaleFactor: 2 },
}

const viewportArg = process.argv.find((a) => a.startsWith('--viewports='))?.split('=')[1] ?? 'desktop,mobile'
const VIEWPORTS = viewportArg.split(',').map((n) => ALL_VIEWPORTS[n.trim()]).filter(Boolean)

const TEST_USERS = {
  gutachter: { email: 'test-sv@claimondo.de', landingMatch: /\/gutachter/ },
  dispatch:  { email: 'test-dispatch@claimondo.de', landingMatch: /\/dispatch/ },
  kunde:     { email: 'test-kunde@claimondo.de', landingMatch: /\/kunde/ },
}

const routes = process.argv.filter((a, i) => i >= 2 && !a.startsWith('--'))
if (routes.length === 0) {
  console.error('Usage: node scripts/screenshot-route.mjs <route> [more-routes] [--viewports=desktop,mobile,tablet] [--base=https://...]')
  process.exit(1)
}

function portalFor(path) {
  const seg = path.split('/').filter(Boolean)[0]
  return seg && TEST_USERS[seg] ? seg : null
}

async function login(page, email, landingMatch) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const emailTab = page.locator('button:has-text("E-Mail")').first()
  if (await emailTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailTab.click().catch(() => {})
  }
  const emailInput = page.locator('input#email, input[name="email"], input[type="email"]').first()
  await emailInput.waitFor({ state: 'visible', timeout: 60000 })
  await emailInput.fill(email)
  const pwInput = page.locator('input#password, input[name="password"], input[type="password"]').first()
  await pwInput.waitFor({ state: 'visible', timeout: 5000 })
  await pwInput.fill(PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Anmelden"), button:has-text("Login")').first().click()
  await page.waitForURL(landingMatch, { timeout: 60000 }).catch(async () => {
    if (/\/login\/2fa/.test(page.url())) {
      await page.waitForURL(landingMatch, { timeout: 30000 }).catch(() => {})
    }
  })
  if (!landingMatch.test(page.url())) {
    throw new Error(`Login fuer ${email} blieb auf ${page.url()}`)
  }
}

function slugFor(path) {
  return path.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '_') || 'root'
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  console.log(`Base: ${BASE_URL}`)
  console.log(`Viewports: ${VIEWPORTS.map((v) => v.name).join(', ')}`)
  console.log(`Routes: ${routes.join(', ')}`)
  console.log('')

  // Routes nach Portal gruppieren — pro Portal nur einmal einloggen.
  const byPortal = {}
  for (const r of routes) {
    const p = portalFor(r)
    if (!p) {
      console.error(`!! ${r}: Portal nicht erkannt (erstes Segment muss gutachter/dispatch/kunde sein)`)
      continue
    }
    byPortal[p] = byPortal[p] ?? []
    byPortal[p].push(r)
  }

  const browser = await chromium.launch({ headless: true })
  try {
    for (const [portal, paths] of Object.entries(byPortal)) {
      const user = TEST_USERS[portal]
      console.log(`=== ${portal} (${user.email}) ===`)
      for (const viewport of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport })
        const loginPage = await ctx.newPage()
        try {
          await login(loginPage, user.email, user.landingMatch)
        } catch (err) {
          console.error(`  Login [${viewport.name}] fehlgeschlagen: ${err.message}`)
          await ctx.close()
          continue
        }
        await loginPage.close()

        for (const path of paths) {
          const page = await ctx.newPage()
          try {
            await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
            await page.addStyleTag({ content: `*,*::before,*::after{animation-duration:0s !important;transition-duration:0s !important;}` }).catch(() => {})
            await page.waitForTimeout(500)
            const file = join(OUT_DIR, `${slugFor(path)}-${viewport.name}.png`)
            await page.screenshot({ path: file, fullPage: true })
            console.log(`  ✓ ${path} [${viewport.name}] → ${file}`)
          } catch (err) {
            console.error(`  ✗ ${path} [${viewport.name}]: ${err.message}`)
          }
          await page.close()
        }
        await ctx.close()
      }
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
