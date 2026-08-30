// Verdeckt der StickyCallBar ("Sofort anrufen" / "Rückruf", fixed unten) den Absende-Button
// der Marketing-Lead-Formulare?
//
// Aufgefallen 29.08. NACH dem Autocomplete-Fix (#5744): solange die Vorschlagsliste ueber dem
// Button lag, war sie das oberste Element — der StickyCallBar darunter fiel gar nicht auf.
// ⭐ Ein Fehler kann einen zweiten maskieren; nach einem Fix neu messen, nicht nur den Fix
// verifizieren.
//
// Gemessen wird das VERHALTEN an DREI Punkten je Button (25/50/75 % der Breite) ueber mehrere
// Viewports — der Balken sitzt unten RECHTS, ein mittiger Einzelpunkt wuerde die linke Haelfte
// faelschlich als frei ausweisen (bzw. umgekehrt). Es wird nichts abgesendet.

import { chromium, devices } from 'playwright'

const BASE = process.env.EP_BASE || 'https://claimondo.de'

const VIEWPORTS = [
  { name: '1920x1080', viewport: { width: 1920, height: 1080 } },
  { name: '1440x900',  viewport: { width: 1440, height: 900 } },
  { name: '1280x720',  viewport: { width: 1280, height: 720 } },
  { name: 'iPhone 13', ...devices['iPhone 13'] },
  { name: 'Pixel 5',   ...devices['Pixel 5'] },
]

const SEITEN = [
  { name: 'Startseite',      pfad: '/' },
  { name: 'Stadtseite Köln', pfad: '/kfz-gutachter/koeln' },
  { name: 'Ads-Landing',     pfad: '/kfzgutachter-lp' },
]

const browser = await chromium.launch()
const zeilen = []

for (const vp of VIEWPORTS) {
  for (const s of SEITEN) {
    const ctx = await browser.newContext({ ...vp, locale: 'de-DE' })
    const page = await ctx.newPage()
    const z = { viewport: vp.name, seite: s.name }
    try {
      await page.goto(BASE + s.pfad, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(1800)

      const submit = page.locator('button[type="submit"]:visible').first()
      if (!(await submit.count())) { z.status = 'kein Submit'; zeilen.push(z); await ctx.close(); continue }

      await submit.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)

      z.mess = await submit.evaluate((btn) => {
        const r = btn.getBoundingClientRect()
        const y = r.top + r.height / 2
        return [0.25, 0.5, 0.75].map((f) => {
          const x = r.left + r.width * f
          const el = document.elementFromPoint(x, y)
          return {
            anteil: f,
            frei: el === btn || btn.contains(el),
            text: (el?.textContent || '').trim().slice(0, 28),
          }
        })
      })
      const blockiert = z.mess.filter((m) => !m.frei)
      z.status = blockiert.length === 0 ? 'frei'
        : blockiert.length === 3 ? 'GANZ verdeckt'
        : `${blockiert.length}/3 verdeckt`
      z.woran = blockiert[0]?.text || ''
    } catch (e) {
      z.status = 'FEHLER: ' + String(e.message).split('\n')[0].slice(0, 50)
    }
    zeilen.push(z)
    await ctx.close()
  }
}

await browser.close()

console.log(`\nStickyCallBar ueber dem Absende-Button — ${BASE}`)
console.log('(3 Messpunkte je Button: 25 % / 50 % / 75 % der Breite)\n')
let verdeckt = 0
for (const z of zeilen) {
  const symbol = z.status === 'frei' ? '✅' : z.status.includes('verdeckt') ? '🔴' : '⚪'
  if (z.status.includes('verdeckt')) verdeckt++
  const punkte = z.mess ? z.mess.map((m) => (m.frei ? '·' : 'X')).join('') : '---'
  console.log(`  ${z.viewport.padEnd(11)} ${z.seite.padEnd(17)} [${punkte}] ${symbol} ${z.status}${z.woran ? ` — "${z.woran}"` : ''}`)
}
console.log(`\n=> ${verdeckt} von ${zeilen.length} Kombinationen betroffen`)
