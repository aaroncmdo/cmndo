// Multi-Logo Walkthrough — iteriert durch alle 6 Test-Logos im Editor.
// Pro Logo: hochladen, V2-Extraktion abwarten, Screenshot Editor + /heute,
// extrahierte Farben loggen.

import { chromium } from 'playwright'
import { existsSync, mkdirSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3007'
const OUT = 'docs/14.05.2026/design-audit/multi-logo-walkthrough'
const EMAIL = 'aaron.sprafke@claimondo.de'
const PW = 'Test1234!'
const LOGO_DIR = 'tests/fixtures/logos'

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const logos = readdirSync(LOGO_DIR).sort()
console.log(`Iteriere durch ${logos.length} Logos:`, logos)

const browser = await chromium.launch({ headless: false, slowMo: 250 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

page.on('pageerror', err => console.log('PAGE-ERROR:', err.message))

const extractResults = []
page.on('response', async resp => {
  if (resp.url().includes('/api/branding/extract') && resp.request().method() === 'POST') {
    try {
      const body = await resp.json()
      extractResults.push({ status: resp.status(), body })
    } catch {}
  }
})

// Login
console.log('Login …')
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', PW)
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
])

for (let i = 0; i < logos.length; i++) {
  const logo = logos[i]
  const slug = logo.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 30)
  const idx = String(i + 1).padStart(2, '0')
  console.log(`\n========== ${idx}: ${logo} ==========`)

  await page.goto(BASE + '/gutachter/profil/branding', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)

  const clearBtn = page.locator('button:has-text("Anderes Logo wählen")').first()
  if (await clearBtn.count() > 0) {
    await clearBtn.click()
    await page.waitForTimeout(500)
  }

  const before = extractResults.length
  await page.locator('input[type="file"]').first().setInputFiles(join(LOGO_DIR, logo))
  console.log(`  uploading + extracting …`)

  try {
    await page.waitForFunction(
      prevLen => {
        const txt = document.body.innerText
        const noLoading =
          !txt.includes('Wird hochgeladen') &&
          !txt.includes('Hintergrund wird entfernt') &&
          !txt.includes('Farben & Stil werden analysiert') &&
          !txt.includes('werden analysiert')
        return noLoading
      },
      before,
      { timeout: 180000 },
    )
    await page.waitForTimeout(3000) // auto-save settle
  } catch (e) {
    console.log(`  timeout — capture state anyway`)
  }

  const lastResult = extractResults[extractResults.length - 1]
  if (lastResult) {
    const b = lastResult.body
    console.log(`  → primary: ${b.primary}, secondary: ${b.secondary}, accent: ${b.accent}`)
    console.log(`    mood: ${b.brandMood}, font: ${b.recommendedFontCategory}, fallback: ${b.fallbackReason ?? 'none'}`)
  }

  await page.screenshot({ path: join(OUT, `${idx}-${slug}-editor.png`), fullPage: true })

  // /heute mit Brand
  await page.goto(BASE + '/gutachter/heute', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3500)
  await page.screenshot({ path: join(OUT, `${idx}-${slug}-heute.png`), fullPage: true })

  console.log(`  ✓ Screenshots: ${idx}-${slug}-editor.png + ${idx}-${slug}-heute.png`)
}

// Summary JSON
import { writeFileSync } from 'fs'
writeFileSync(
  join(OUT, '_summary.json'),
  JSON.stringify({ logos, results: extractResults.map(r => r.body) }, null, 2),
)

console.log('\n=== DONE ===')
console.log(`Screenshots: ${OUT}`)
console.log(`Summary: ${OUT}/_summary.json`)
await page.waitForTimeout(15000)
await browser.close()
