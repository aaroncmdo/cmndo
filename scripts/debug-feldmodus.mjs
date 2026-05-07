// 2026-05-07: Tiefer Debug für /gutachter/feldmodus.
// Lädt Production, loggt DOM-State, Map-Canvas, Errors.
//
// MSYS_NO_PATHCONV=1 node scripts/debug-feldmodus.mjs

import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.split('=')[1] ?? 'https://cmndo.vercel.app'
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? 'Test1234!'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const errors = []
const networkFails = []
page.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message, stack: e.stack?.slice(0, 800) }))
page.on('console', m => {
  if (m.type() === 'error') errors.push({ type: 'console-error', text: m.text() })
})
page.on('response', r => {
  if (r.status() >= 400 && (r.url().includes('cmndo') || r.url().includes('mapbox') || r.url().includes('cesium') || r.url().includes('googleapis'))) {
    networkFails.push({ status: r.status(), url: r.url().slice(0, 200) })
  }
})

console.log('Login…')
await page.goto(`${BASE}/login`)
await page.locator('button:has-text("E-Mail")').first().click().catch(() => {})
await page.locator('input[type="email"]').fill('test-sv@claimondo.de')
await page.locator('input[type="password"]').fill(PASSWORD)
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 })

console.log('Navigate to feldmodus…')
await page.goto(`${BASE}/gutachter/feldmodus`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(15000)

const dom = await page.evaluate(() => {
  const map = document.querySelector('.mapboxgl-map')
  const canvas = document.querySelector('.mapboxgl-canvas')
  const dGl = document.querySelector('canvas[id^="deckgl"], canvas[data-deck]')
  const allCanvas = Array.from(document.querySelectorAll('canvas')).map(c => ({
    id: c.id, width: c.width, height: c.height, displayWidth: c.clientWidth, displayHeight: c.clientHeight,
    classList: c.className.slice(0, 100),
  }))
  const aside = document.querySelector('aside')
  return {
    mapExists: !!map,
    mapBox: map ? { width: map.clientWidth, height: map.clientHeight, classList: map.className.slice(0, 100) } : null,
    canvasExists: !!canvas,
    canvasBox: canvas ? { width: canvas.width, height: canvas.height, displayWidth: canvas.clientWidth, displayHeight: canvas.clientHeight } : null,
    deckGlExists: !!dGl,
    allCanvases: allCanvas,
    asideClass: aside?.className?.slice(0, 200) ?? null,
    asideVisible: aside ? getComputedStyle(aside).display !== 'none' : null,
    bodyHtmlLength: document.body.innerHTML.length,
    sessionStatusGuess: document.querySelector('[class*="navy"]')?.textContent?.slice(0, 80) ?? null,
  }
})

console.log('\n=== DOM ===')
console.log(JSON.stringify(dom, null, 2))
console.log('\n=== ERRORS ===')
errors.forEach(e => console.log('  ❌', e.type, '·', (e.text ?? e.message ?? '').slice(0, 300)))
if (errors.length === 0) console.log('  (keine)')
console.log('\n=== NETWORK-FAILS (cmndo|mapbox|cesium|google) ===')
networkFails.forEach(n => console.log(`  ⚠ ${n.status} ${n.url}`))
if (networkFails.length === 0) console.log('  (keine)')

console.log(`\nFinal URL: ${page.url()}`)
await browser.close()
