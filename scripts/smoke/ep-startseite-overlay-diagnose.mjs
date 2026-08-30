// Diagnose: WAS genau liegt auf der Startseite ueber dem Absende-Button?
//
// Die Sammelmessung (ep-overlay-nach-auswahl.mjs) meldete dort nach dem Fix zwar "0 Vorschlaege
// offen" (der Fix greift), aber der Klick traefe ein Element mit LEEREM Text. Das kann zweierlei
// sein: ein echtes zweites Overlay — oder ein Messartefakt, weil der Button ausserhalb des
// sichtbaren Bereichs liegt und elementFromPoint dann etwas anderes zurueckgibt.
//
// Hier wird deshalb ZUERST geprueft, ob der Button ueberhaupt im Viewport steht, dann die
// komplette Elementkette an der Klickstelle ausgelesen.

import { chromium } from 'playwright'

const BASE = process.env.EP_BASE || 'https://claimondo.de'
const EINGABE = 'Domkloster 4, 50667 Köln'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 })
await page.waitForTimeout(2000)

const ort = page.locator('input[type="text"]:visible, input:not([type]):visible').last()
await ort.click()
await ort.fill('')
await ort.type(EINGABE, { delay: 55 })
await page.waitForTimeout(2500)

const vorschlaege = page.locator('button[type="button"].text-left')
console.log('Vorschlaege angeboten:', await vorschlaege.count())
if (await vorschlaege.count()) {
  console.log('gewaehlt:', (await vorschlaege.first().innerText()).trim())
  await vorschlaege.first().click()
}
await page.waitForTimeout(1500)
console.log('Vorschlaege nach Auswahl:', await vorschlaege.count())

const submit = page.locator('button[type="submit"]:visible').first()
const diag = await submit.evaluate((btn) => {
  const r = btn.getBoundingClientRect()
  const vh = window.innerHeight, vw = window.innerWidth
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const imViewport = cy >= 0 && cy <= vh && cx >= 0 && cx <= vw

  // Elementkette an der Klickstelle — elementsFromPoint gibt ALLE uebereinander.
  const kette = (document.elementsFromPoint(cx, cy) || []).slice(0, 6).map((el) => ({
    tag: el.tagName,
    klasse: (el.className || '').toString().slice(0, 70),
    id: el.id || null,
    text: (el.textContent || '').trim().slice(0, 40),
    pos: getComputedStyle(el).position,
    z: getComputedStyle(el).zIndex,
    pe: getComputedStyle(el).pointerEvents,
  }))

  return {
    button: { text: btn.textContent?.trim().slice(0, 40), top: Math.round(r.top), height: Math.round(r.height) },
    viewport: { h: vh, w: vw },
    klickpunkt: { x: Math.round(cx), y: Math.round(cy) },
    imViewport,
    kette,
  }
})

console.log('\nButton:', JSON.stringify(diag.button))
console.log('Viewport:', JSON.stringify(diag.viewport), '| Klickpunkt:', JSON.stringify(diag.klickpunkt), '| im Viewport:', diag.imViewport)
console.log('\nElementkette an der Klickstelle (oberstes zuerst):')
for (const [i, e] of diag.kette.entries()) {
  console.log(`  ${i}: <${e.tag}> pos=${e.pos} z=${e.z} pointer-events=${e.pe}`)
  console.log(`      class="${e.klasse}" id=${e.id} text="${e.text}"`)
}

// Zweite Messung: nach dem Scrollen in den sichtbaren Bereich.
await submit.scrollIntoViewIfNeeded()
await page.waitForTimeout(600)
const nachScroll = await submit.evaluate((btn) => {
  const r = btn.getBoundingClientRect()
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return { frei: el === btn || btn.contains(el), tag: el?.tagName, text: (el?.textContent || '').trim().slice(0, 50) }
})
console.log('\nNACH scrollIntoView:', nachScroll.frei ? '✅ Button frei' : `🔴 verdeckt von <${nachScroll.tag}> "${nachScroll.text}"`)

await page.screenshot({ path: 'scripts/smoke/.ep-shots/startseite-overlay-diagnose.png', fullPage: false })
await browser.close()
