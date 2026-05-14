// Live-Smoke gegen staging.claimondo.de mit Basic-Auth.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const URL = 'https://staging.claimondo.de/'
const USER = 'aaroncmdo'
const PASS = 'ClaimondoSuperuser123789!!'
const OUT = 'docs/13.05.2026/marketing-rework/screenshots/staging-live'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  httpCredentials: { username: USER, password: PASS },
})
const page = await ctx.newPage()
const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 })
console.log(`Status: ${resp?.status()}`)

try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(400) } } catch {}

await page.evaluate(async () => {
  await new Promise((r) => {
    let y = 0
    const step = () => { window.scrollTo(0, y); y += 600; if (y > document.body.scrollHeight) return r(); setTimeout(step, 150) }
    step()
  })
})
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(500)

await page.screenshot({ path: join(OUT, 'full-page.png'), fullPage: true })
console.log('✓ full-page.png')

const SECTIONS = [
  ['hero-band', 'section:has-text("Sofort nach dem Unfall")'],
  ['hero-form', 'section[aria-labelledby="hero-heading"]'],
  ['bgh', 'section[aria-labelledby="bgh-heading-premium"]'],
  ['einsatzgebiet', 'section[aria-labelledby="einsatzgebiet-heading"]'],
  ['berater', 'section[aria-labelledby="berater-heading"]'],
]
for (const [slug, sel] of SECTIONS) {
  const el = await page.$(sel)
  if (!el) { console.log(`✗ ${slug}: nf`); continue }
  await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
  await el.screenshot({ path: join(OUT, `${slug}.png`) })
  console.log(`✓ ${slug}.png`)
}

const text = await page.evaluate(() => document.body.innerText)
const CHECKS = [
  '110+ DAT-Gutachter bundesweit verfügbar',
  'Wir regeln Ihren Kfz-Schaden vollständig',
  'Vier Dinge stehen Ihnen nach unverschuldetem Unfall zu',
  '8 BGH-Urteile, die Ihre Ansprüche absichern',
  'Versicherer-Taktiken — und wie wir sie kontern',
  '7 Fehler, die Sie nach einem Unfall vermeiden',
  '110+ DAT-Sachverständige · Schwerpunkt NRW',
  'Ein Berater. Eine Nummer. Die ganze Strecke',
]
let pass = 0
for (const c of CHECKS) {
  const ok = text.includes(c)
  console.log(`${ok ? '✓' : '✗'} ${c}`)
  if (ok) pass++
}
console.log(`\n${pass}/${CHECKS.length} content-checks pass on staging.claimondo.de`)

await browser.close()
