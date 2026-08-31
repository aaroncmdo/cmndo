// Prueft den Einklapp-Mechanismus der Kontaktleiste (Aaron 30.08.: "mach es einklappbar,
// damit man es an der Seite einfahren kann").
//
// Gemessen wird VERHALTEN, nicht Markup:
//   - ist die Leiste nach dem Einklappen wirklich WEG (nicht nur unsichtbar)?
//   - bleibt sie per Tastatur erreichbar? (Fokusfalle — der haeufigste a11y-Fehler
//     bei weggeschobenen Overlays)
//   - haelt der Zustand einen Reload durch?
//   - sind die Touch-Ziele >= 44px? (PRODUCT.md: Lesebrille und kleines Display sind
//     Normalfall, nicht Randfall)
//   - waechst die Leiste durch den Griff? (der Griff soll Platz sparen, nicht kosten)
//
// Aufruf: EP_BASE=http://localhost:3015 node scripts/smoke/ep-stickybar-einklappen.mjs

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.EP_BASE || 'https://claimondo.de'
const VP = { width: Number(process.env.EP_W || 1440), height: Number(process.env.EP_H || 900) }
const SHOTS = 'scripts/smoke/.ep-shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: VP, locale: 'de-DE' })
const page = await ctx.newPage()
const zeilen = []
const sag = (s) => { console.log(s); zeilen.push(s) }

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90_000 })
await page.waitForTimeout(2500)

// ⚠ NICHT bei y=0 messen. Dort weicht die Leiste absichtlich, weil der Absende-Button des
// Hero-Formulars in ihrer Zone liegt (#5753). Wer dort misst, haelt korrektes Verhalten fuer
// eine fehlende Leiste — und `aria-hidden` nimmt sie zusaetzlich aus dem a11y-Baum, `getByRole`
// findet dann gar nichts. Erst ein Stueck scrollen, dann ist sie regulaer da.
await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }))
await page.waitForTimeout(800)

const einklappGriff = page.getByRole('button', { name: /einklappen|collapse/i })
const ausklappGriff = page.getByRole('button', { name: /einblenden|show contact/i })
const anrufLink = page.getByRole('link', { name: /Sofort anrufen/i }).first()

// ── 1) Ausgangszustand ─────────────────────────────────────────────────────
sag(`[1] Leiste sichtbar: ${await anrufLink.isVisible()} · Einklapp-Griff: ${await einklappGriff.count()}`)

const masse = async (loc, was) => {
  const b = await loc.boundingBox()
  if (!b) return sag(`    ${was}: nicht messbar`)
  const ok = b.width >= 44 && b.height >= 44
  sag(`    ${was}: ${Math.round(b.width)}x${Math.round(b.height)} px ${ok ? '✅ >= 44' : '🔴 UNTER 44'}`)
}
await masse(einklappGriff, 'Einklapp-Griff')

// Hoehe der Leiste MIT Griff — sie darf durch ihn nicht wachsen.
const leisteHoehe = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find((e) => /Sofort anrufen/i.test(e.textContent || ''))
  let el = a
  while (el && getComputedStyle(el).position !== 'fixed') el = el.parentElement
  return el ? Math.round(el.getBoundingClientRect().height) : null
})
sag(`[2] Hoehe der Leiste insgesamt: ${leisteHoehe} px`)

await page.screenshot({ path: `${SHOTS}/leiste-01-ausgefahren.png` })

// ── 3) Einklappen ──────────────────────────────────────────────────────────
await einklappGriff.click()
await page.waitForTimeout(700)

const nachEinklappen = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find((e) => /Sofort anrufen/i.test(e.textContent || ''))
  return { nochImDom: !!a }
})
sag(`[3] Nach dem Einklappen — Anruf-Link noch im DOM: ${nachEinklappen.nochImDom} ${nachEinklappen.nochImDom ? '🔴 (Fokusfalle)' : '✅ ausgehaengt'}`)
sag(`    Ausfahr-Griff sichtbar: ${await ausklappGriff.isVisible()}`)
await masse(ausklappGriff, 'Ausfahr-Griff')
await page.screenshot({ path: `${SHOTS}/leiste-02-eingeklappt.png` })

// ── 4) Tastatur: nichts Unsichtbares darf Fokus bekommen ───────────────────
const fokusKette = await page.evaluate(() => {
  const fokussierbar = [...document.querySelectorAll('a[href],button:not([disabled]),input,select,textarea')]
  return fokussierbar
    .filter((e) => {
      const r = e.getBoundingClientRect()
      return r.left > window.innerWidth || r.right < 0 // ausserhalb links/rechts
    })
    .map((e) => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30))
})
sag(`[4] Fokussierbare Elemente ausserhalb des Bildes: ${fokusKette.length} ${fokusKette.length ? '🔴 ' + JSON.stringify(fokusKette) : '✅ keine'}`)

// ── 5) Reload: haelt der Zustand? ──────────────────────────────────────────
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const nachReload = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find((e) => /Sofort anrufen/i.test(e.textContent || ''))
  return !!a
})
sag(`[5] Nach Reload wieder ausgefahren: ${nachReload} ${nachReload ? '🔴 Zustand vergessen' : '✅ bleibt eingeklappt'}`)

// ── 6) Wieder ausklappen ───────────────────────────────────────────────────
const griff2 = page.getByRole('button', { name: /einblenden|show contact/i })
await griff2.click()
await page.waitForTimeout(700)
const wiederDa = await page.getByRole('link', { name: /Sofort anrufen/i }).first().isVisible().catch(() => false)
sag(`[6] Nach Ausklappen wieder da: ${wiederDa ? '✅' : '🔴'}`)
await page.screenshot({ path: `${SHOTS}/leiste-03-wieder-ausgefahren.png` })

// ── 7) Und der alte Fix haelt noch: verdeckt die Leiste den Absende-Button? ─
// ⚠ NICHT scrollIntoViewIfNeeded nehmen: das scrollt minimal und parkt den Button unter der
// STICKY TOPBAR — der Treffer heisst dann "Werkstatt finden" und sieht wie ein Overlay-Fehler
// aus, obwohl die Leiste unbeteiligt ist. Den Button gezielt in die Mitte holen.
// Die vollstaendige Abdeckung liefert ohnehin ep-stickybar-scrollpositionen.mjs (8 Positionen).
const submit = page.locator('button[type="submit"]:visible').first()
if (await submit.count()) {
  await submit.evaluate((btn) => {
    const r = btn.getBoundingClientRect()
    window.scrollBy({ top: r.top - window.innerHeight * 0.5, behavior: 'instant' })
  })
  await page.waitForTimeout(500)
  const frei = await submit.evaluate((btn) => {
    const r = btn.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { frei: el === btn || btn.contains(el), text: (el?.textContent || '').trim().slice(0, 30) }
  })
  sag(`[7] Absende-Button weiterhin frei: ${frei.frei ? '✅' : '🔴 verdeckt von "' + frei.text + '"'}`)
}

await browser.close()
console.log('\n──── ZUSAMMENFASSUNG ────')
console.log(zeilen.join('\n'))
