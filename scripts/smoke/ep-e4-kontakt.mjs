// Gezielt: das Kontaktformular des Finders — sind die Labels korrekt verdrahtet,
// und was sagt "Termin reservieren" bei ungueltiger Eingabe?
import { chromium } from 'playwright'
import { join } from 'node:path'
import { MARKETING, identitaet } from './ep-lib.mjs'

const ident = identitaet('E4K')
const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE' })).newPage()
await page.goto(`${MARKETING}/gutachter-finden`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})

async function frame() {
  for (let i = 0; i < 25; i++) {
    const f = page.frames().find((x) => x.url().includes('embed/gutachter-finder'))
    if (f) { const l = await f.evaluate(() => (document.body?.innerText || '').length).catch(() => 0); if (l > 200) return f }
    await page.waitForTimeout(1000)
  }
  throw new Error('kein Frame')
}
let F = await frame()
await page.waitForTimeout(2000)

// Ort
const ort = F.locator('input[placeholder*="Adresse"]').first()
await ort.click(); await ort.pressSequentially('Domkloster 4, 50667 Köln', { delay: 90 })
await page.waitForTimeout(3000)
await F.locator('[role="option"], li').filter({ hasText: /Domkloster/i }).first().click()
await page.waitForTimeout(5000); F = await frame()

// Slot
const slot = F.locator('button').filter({ hasText: /\d{2}\.\d{2}\.,?\s*\d{1,2}:\d{2}\s*Uhr/ }).first()
await slot.waitFor({ state: 'visible', timeout: 30_000 })
await slot.click(); await page.waitForTimeout(3500); F = await frame()

// Schadentyp
await F.locator('button').filter({ hasText: 'Auffahrunfall' }).first().click()
await page.waitForTimeout(3500); F = await frame()

// ── Kontaktformular analysieren ──
const analyse = await F.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')].filter((el) => el.getBoundingClientRect().width > 0)
  return inputs.map((el, i) => ({
    i, typ: el.type, name: el.name, id: el.id, ph: el.placeholder,
    autocomplete: el.getAttribute('autocomplete') || '',
    labelVia_labels: (el.labels?.[0]?.innerText || '').trim(),
    ariaLabel: el.getAttribute('aria-label') || '',
    // Was steht optisch direkt darueber?
    vorherText: (el.previousElementSibling?.textContent || el.parentElement?.firstElementChild?.textContent || '').trim().slice(0, 30),
  }))
})
console.log('Kontaktfelder:', JSON.stringify(analyse, null, 2))

// Sauber ueber die POSITION fuellen (Reihenfolge laut Anzeige: Vorname, Nachname, Telefon, E-Mail)
const inputs = F.locator('input:visible')
const n = await inputs.count()
console.log('sichtbare inputs:', n)
const werte = [ident.vorname, ident.nachname, process.env.EP_TELEFON || '+491633628571', ident.email]
let wi = 0
for (let i = 0; i < n; i++) {
  const el = inputs.nth(i)
  const typ = await el.getAttribute('type')
  if (typ === 'checkbox') continue
  if (wi < werte.length) { await el.fill(werte[wi]); wi++ }
}
const gefuellt = await F.evaluate(() =>
  [...document.querySelectorAll('input')].filter((el) => el.getBoundingClientRect().width > 0 && el.type !== 'checkbox')
    .map((el) => ({ typ: el.type, wert: el.value })),
)
console.log('nach Fuellen:', JSON.stringify(gefuellt))

const cb = F.locator('input[type="checkbox"]:not([aria-hidden="true"])').first()
if (await cb.count() && !(await cb.isChecked())) await cb.check().catch(() => {})

await page.screenshot({ path: join(process.cwd(), 'scripts/smoke/.ep-walk/e4-kontakt.png'), fullPage: true })
const res = F.getByRole('button', { name: /^Termin reservieren/i }).first()
console.log('Reservieren-Button aus?', await res.isDisabled().catch(() => 'n/a'))
await res.click()
await page.waitForTimeout(6000)
const danach = await F.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 800)).catch(() => '(Frame weg)')
console.log('\nNach Reservieren:', danach)
await page.screenshot({ path: join(process.cwd(), 'scripts/smoke/.ep-walk/e4-nach-reservieren.png'), fullPage: true })
console.log('\nIdentitaet:', ident.email)
await browser.close()
