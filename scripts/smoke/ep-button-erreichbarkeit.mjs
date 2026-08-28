// Ist der Absende-Button der Stadtseite real unerreichbar — oder nur unter Playwrights
// Scroll-Verhalten? Gemessen ueber mehrere Viewports, inkl. Mobil (dort nehmen Sticky-Header
// und die fixierte Bottom-Leiste den meisten Platz).
//
// Gemessen wird NICHT "Playwright kann klicken", sondern was WIRKLICH auf dem Button liegt:
// document.elementFromPoint() auf mehreren Punkten des Buttons, bei realistischer Scrollposition
// (Formular mittig im Bild — so wie ein Mensch es hat).
import { chromium, devices } from 'playwright'
import { MARKETING } from './ep-lib.mjs'

const SEITEN = [
  { id: 'Stadtseite', url: `${MARKETING}/kfz-gutachter/koeln` },
  { id: 'Startseite', url: `${MARKETING}/` },
  { id: 'Ads-LP', url: `${MARKETING}/kfzgutachter-lp` },
]
const VIEWPORTS = [
  { name: 'iPhone 13', ...devices['iPhone 13'] },
  { name: 'Pixel 5', ...devices['Pixel 5'] },
  { name: 'Laptop 1280x720', viewport: { width: 1280, height: 720 } },
  { name: 'Desktop 1920x1080', viewport: { width: 1920, height: 1080 } },
]

const browser = await chromium.launch({ headless: true })
console.log('Seite'.padEnd(12), 'Viewport'.padEnd(20), 'Button sichtbar', ' verdeckt von')
console.log('-'.repeat(95))

for (const seite of SEITEN) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ ...vp, locale: 'de-DE' })
    const page = await ctx.newPage()
    let zeile = `${seite.id.padEnd(12)} ${vp.name.padEnd(20)}`
    try {
      await page.goto(seite.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
      await page.waitForTimeout(2500)

      const btn = page.getByRole('button', { name: /Jetzt kostenlosen Rückruf erhalten/i }).first()
      if (!(await btn.count())) { console.log(zeile, ' — kein Button gefunden'); await ctx.close(); continue }

      // Realistische Position: Formular mittig ins Bild, wie ein Mensch scrollt.
      await btn.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(900)

      const mess = await btn.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const punkte = [
          ['Mitte', r.x + r.width / 2, r.y + r.height / 2],
          ['links', r.x + 8, r.y + r.height / 2],
          ['rechts', r.x + r.width - 8, r.y + r.height / 2],
        ]
        const treffer = punkte.map(([wo, x, y]) => {
          const top = document.elementFromPoint(x, y)
          const eigen = top === el || el.contains(top)
          const beschreibung = top
            ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}:${(top.innerText || '').trim().slice(0, 22)}`
            : 'nichts'
          return { wo, eigen, beschreibung }
        })
        return { rect: { y: Math.round(r.y), h: Math.round(r.height) }, treffer }
      })

      const blockiert = mess.treffer.filter((t) => !t.eigen)
      zeile += blockiert.length === 0
        ? ' ✅ frei          '
        : ` ❌ ${blockiert.length}/3 Punkte    `
      zeile += blockiert.map((b) => `${b.wo}→${b.beschreibung}`).join(' | ')
      console.log(zeile)
    } catch (e) {
      console.log(zeile, ' FEHLER:', String(e).slice(0, 60))
    }
    await ctx.close()
  }
}
await browser.close()
