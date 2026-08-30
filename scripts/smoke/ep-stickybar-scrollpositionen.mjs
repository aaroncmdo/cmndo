// Wie schlimm ist der StickyCallBar ueber dem Absende-Button wirklich?
//
// Die Viewport-Matrix meldete nur 1 von 15 Kombinationen betroffen (1440x900 Startseite) —
// aber sie hat je Seite nur EINE Scroll-Position gemessen (die, auf der scrollIntoViewIfNeeded
// landet). Ein echter Nutzer scrollt frei. Entscheidend ist deshalb: bei WELCHEN
// Scroll-Positionen faengt der Balken den Klick ab, und kann der Nutzer sich befreien,
// indem er weiterscrollt?
//
// Gemessen wird der Button an jeder Position an 3 Punkten (25/50/75 % der Breite). Nichts
// wird abgesendet.

import { chromium } from 'playwright'

const BASE = process.env.EP_BASE || 'https://claimondo.de'
const PFAD = process.env.EP_PFAD || '/'
const VP = { width: Number(process.env.EP_W || 1440), height: Number(process.env.EP_H || 900) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: VP, locale: 'de-DE' })
await page.goto(BASE + PFAD, { waitUntil: 'networkidle', timeout: 90_000 })
await page.waitForTimeout(2000)

const submit = page.locator('button[type="submit"]:visible').first()
if (!(await submit.count())) { console.log('kein Submit-Button'); await browser.close(); process.exit(0) }

// Absolute Dokument-Position des Buttons ermitteln.
const lage = await submit.evaluate((btn) => {
  const r = btn.getBoundingClientRect()
  return { docTop: r.top + window.scrollY, hoehe: r.height, docHoehe: document.body.scrollHeight }
})

console.log(`\n${BASE}${PFAD} @ ${VP.width}x${VP.height}`)
console.log(`Button: Dokument-Y ${Math.round(lage.docTop)}, Hoehe ${Math.round(lage.hoehe)}, Seite ${lage.docHoehe}px\n`)
console.log('  Button-Mitte im Viewport bei …  Messpunkte   Ergebnis')

// Der Button soll an verschiedenen Stellen des Viewports zu liegen kommen: ganz oben (10 %)
// bis ganz unten (95 %). So faellt auf, ob es nur eine schmale Zone am unteren Rand ist.
const zonen = [0.1, 0.25, 0.4, 0.55, 0.7, 0.8, 0.88, 0.95]
let betroffen = 0
for (const anteil of zonen) {
  const zielY = VP.height * anteil
  const scrollY = Math.max(0, Math.round(lage.docTop + lage.hoehe / 2 - zielY))
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollY)
  await page.waitForTimeout(350)

  const m = await submit.evaluate((btn) => {
    const r = btn.getBoundingClientRect()
    const y = r.top + r.height / 2
    return {
      y: Math.round(y),
      punkte: [0.25, 0.5, 0.75].map((f) => {
        const el = document.elementFromPoint(r.left + r.width * f, y)
        return { frei: el === btn || btn.contains(el), text: (el?.textContent || '').trim().slice(0, 24) }
      }),
    }
  })
  const blockiert = m.punkte.filter((p) => !p.frei)
  if (blockiert.length) betroffen++
  const bild = m.punkte.map((p) => (p.frei ? '·' : 'X')).join('')
  const info = blockiert.length === 0 ? '✅ frei'
    : `🔴 ${blockiert.length}/3 blockiert — "${blockiert[0].text}"`
  console.log(`  y=${String(m.y).padStart(4)} (${String(Math.round(anteil * 100)).padStart(2)} % der Hoehe)   [${bild}]   ${info}`)
}

console.log(`\n=> ${betroffen} von ${zonen.length} Scroll-Positionen blockiert`)
console.log(betroffen === 0
  ? '   Der Balken ist kein Problem — der Button ist ueberall erreichbar.'
  : betroffen === zonen.length
    ? '   Der Button ist in JEDER Scroll-Position blockiert — der Nutzer kann sich nicht befreien.'
    : '   Nur in einem Teil der Positionen — Weiterscrollen macht den Button erreichbar.')

await browser.close()
