// Gegentest zum StickyCallBar-Fix: weicht die Leiste NUR bei echter Kollision — oder ist sie
// jetzt dauerhaft weg?
//
// Ein Fix, der ein Conversion-Element abschaltet, waere schlimmer als der Fehler, den er behebt.
// Geprueft wird deshalb an mehreren Scroll-Tiefen, ob die Leiste sichtbar UND klickbar ist
// (opacity + pointer-events, gemessen am gerenderten Stil, nicht am Markup).

import { chromium } from 'playwright'

const BASE = process.env.EP_BASE || 'https://claimondo.de'
const PFAD = process.env.EP_PFAD || '/'
const VP = { width: Number(process.env.EP_W || 1440), height: Number(process.env.EP_H || 900) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: VP, locale: 'de-DE' })
await page.goto(BASE + PFAD, { waitUntil: 'networkidle', timeout: 90_000 })
await page.waitForTimeout(2000)

const seitenhoehe = await page.evaluate(() => document.body.scrollHeight)
console.log(`\n${BASE}${PFAD} @ ${VP.width}x${VP.height} — Seite ${seitenhoehe}px\n`)
console.log('  Scroll-Position     Leiste            CTA im Bild?')

// Die Leiste wird ueber ihren Anruf-Button gefunden — der traegt den sichtbaren Text.
const zustand = async () => page.evaluate(() => {
  const alle = Array.from(document.querySelectorAll('a,button'))
  const anruf = alle.find((e) => /sofort anrufen/i.test(e.textContent || ''))
  if (!anruf) return { da: false }
  // Der fixed-Container ist der naechste Vorfahre mit position:fixed.
  let el = anruf
  while (el && getComputedStyle(el).position !== 'fixed') el = el.parentElement
  const s = el ? getComputedStyle(el) : null
  const cta = document.querySelector('[data-tracking^="lead-form"] button[type="submit"]')
  const r = cta?.getBoundingClientRect()
  return {
    da: true,
    opacity: s?.opacity,
    pointerEvents: s?.pointerEvents,
    sichtbar: s ? Number(s.opacity) > 0.5 && s.pointerEvents !== 'none' : false,
    ctaImBild: r ? r.bottom > 0 && r.top < window.innerHeight : false,
  }
})

const positionen = [0, 400, 900, 2000, 5000, 10000, Math.max(0, seitenhoehe - VP.height - 200)]
let sichtbarZaehler = 0
for (const y of positionen) {
  await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y)
  await page.waitForTimeout(400)
  const z = await zustand()
  if (!z.da) { console.log(`  y=${String(y).padStart(6)}         (Leiste nicht im DOM)`); continue }
  if (z.sichtbar) sichtbarZaehler++
  console.log(`  y=${String(y).padStart(6)}         ${z.sichtbar ? '✅ sichtbar' : '⬜ weicht  '} (opacity=${z.opacity}, pe=${z.pointerEvents})   ${z.ctaImBild ? 'ja' : 'nein'}`)
}

console.log(`\n=> Leiste an ${sichtbarZaehler} von ${positionen.length} Positionen aktiv`)
console.log(sichtbarZaehler === 0
  ? '   🔴 DAUERHAFT WEG — der Fix hat ein Conversion-Element abgeschaltet.'
  : sichtbarZaehler === positionen.length
    ? '   ⚠ IMMER da — sie weicht nie, der Fix greift nicht.'
    : '   ✅ Sie weicht situativ: da, wo sie gebraucht wird; weg, wo sie im Weg waere.')

await browser.close()
