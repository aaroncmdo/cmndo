// Gezielter Blick auf den Gutachter-Finder im iframe: was ist das Adressfeld,
// und was passiert beim Tippen?
import { chromium } from 'playwright'
import { join } from 'node:path'
import { MARKETING } from './ep-lib.mjs'

const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE' })).newPage()
await page.goto(`${MARKETING}/gutachter-finden`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})

let F = null
for (let i = 0; i < 25; i++) {
  F = page.frames().find((x) => x.url().includes('embed/gutachter-finder'))
  if (F) { const len = await F.evaluate(() => (document.body?.innerText || '').length).catch(() => 0); if (len > 200) break }
  await page.waitForTimeout(1000)
}
console.log('Frame:', F?.url())

const felder = await F.evaluate(() =>
  [...document.querySelectorAll('input,textarea')].map((el) => ({
    typ: el.type, name: el.name, id: el.id, ph: el.placeholder,
    cls: (el.className || '').slice(0, 70),
    sichtbar: el.getBoundingClientRect().width > 0,
    rolle: el.getAttribute('role') || '',
  })),
)
console.log('Alle Felder:', JSON.stringify(felder, null, 2))

const ort = F.locator('input[placeholder*="Adresse"]').first()
console.log('Treffer per placeholder*=Adresse:', await ort.count())
await ort.click()
await ort.pressSequentially('Domkloster 4, 50667 Köln', { delay: 100 })
await page.waitForTimeout(3000)
console.log('Wert nach Tippen:', JSON.stringify(await ort.inputValue()))

const optionen = await F.evaluate(() =>
  [...document.querySelectorAll('[role="option"], li button, ul li')].map((el) => (el.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 8),
)
console.log('Vorschlaege:', JSON.stringify(optionen))

const opt = F.locator('[role="option"], li').filter({ hasText: /Domkloster/i }).first()
console.log('Domkloster-Option gefunden:', await opt.count())
if (await opt.count()) { await opt.click(); await page.waitForTimeout(1500) }
console.log('Wert nach Auswahl:', JSON.stringify(await ort.inputValue()))

const buttons = await F.evaluate(() =>
  [...document.querySelectorAll('button')].filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => ({ t: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50), aus: el.disabled })),
)
console.log('Buttons danach:', JSON.stringify(buttons.slice(0, 30)))
await page.screenshot({ path: join(process.cwd(), 'scripts/smoke/.ep-walk/e4-debug.png'), fullPage: true })
await browser.close()
