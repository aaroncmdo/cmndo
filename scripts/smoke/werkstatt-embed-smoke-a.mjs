// Regel-4-Smoke A v2 — Werkstatt-Embed P1+P2 auf prod (read-only, KEIN Absenden).
// v2: Netzwerk-Sniffing der Server-Action-POSTs (Status+Dauer), 30s-Pin-Polls,
// case-INsensitive Text-Checks (uppercase-CSS-Falle), bis Step 3.
import { chromium } from '@playwright/test'

const OUT = process.env.SMOKE_OUT || '.'
const URL = process.env.SMOKE_URL || 'https://app.claimondo.de/embed/werkstatt-finder?plz=50937'
const R = []
const ok = (n, c) => { R.push(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) process.exitCode = 1 }
const info = (n) => R.push(`INFO  ${n}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  geolocation: { latitude: 50.9375, longitude: 6.9603 },
  permissions: ['geolocation'],
})
const page = await ctx.newPage()
page.on('pageerror', (e) => info(`pageerror: ${String(e).slice(0, 140)}`))

// Server-Action-POSTs beobachten (Next Server Actions POSTen auf die Seiten-URL)
const t0 = Date.now()
page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().includes('werkstatt-finder')) {
    info(`POST -> ${req.url().split('?')[0].slice(-40)} @${((Date.now() - t0) / 1000).toFixed(1)}s`)
  }
})
page.on('response', async (resp) => {
  const req = resp.request()
  if (req.method() === 'POST' && resp.url().includes('werkstatt-finder')) {
    let size = '-'
    try { size = String((await resp.body()).length) } catch { /* streamed */ }
    info(`POST <- ${resp.status()} (${size}B) @${((Date.now() - t0) / 1000).toFixed(1)}s`)
  }
})

async function pollPins(maxSec, label) {
  let pins = 0
  for (let i = 0; i < maxSec / 2; i++) {
    pins = await page.locator('.mapboxgl-marker').count()
    if (pins >= 2) break
    await page.waitForTimeout(2000)
  }
  info(`${label}: ${pins} Marker @${((Date.now() - t0) / 1000).toFixed(1)}s`)
  return pins
}

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(5000)
  const body = await page.locator('body').innerText()
  ok('Step 1 sichtbar', /wo steht das fahrzeug/i.test(body))
  ok('Karte gerendert', (await page.locator('.mapboxgl-canvas').count()) > 0)

  const pinsInit = await pollPins(30, 'Pins nach ?plz-Init')
  ok('plz-Init zeigt Anker+Treffer (>=2 Marker)', pinsInit >= 2)
  await page.screenshot({ path: `${OUT}/smoke-a-1-load.png` })

  // Places
  const input = page.locator('input[type="text"]:visible').first()
  await input.click()
  await input.pressSequentially('Aachener Straße 100, Köln', { delay: 40 })
  let pac = 0
  for (let i = 0; i < 10; i++) {
    pac = await page.locator('.pac-item:visible').count()
    if (pac > 0) break
    await page.waitForTimeout(1000)
  }
  ok('Places-Vorschlaege', pac > 0)
  if (pac > 0) await page.locator('.pac-item:visible').first().click()

  const pinsPick = await pollPins(30, 'Pins nach Places-Pick')
  ok('Treffer-Pins nach Standort-Pick (>=2 Marker)', pinsPick >= 2)
  await page.screenshot({ path: `${OUT}/smoke-a-2-standort.png` })

  // Step 2
  await page.locator('button:has-text("Weiter"):visible').first().click()
  await page.waitForTimeout(1200)
  const b2 = await page.locator('body').innerText()
  ok('Step 2 Fahrzeug erreichbar', /hersteller/i.test(b2) && /pkw/i.test(b2))
  await page.locator('input[placeholder*="BMW" i]').first().fill('BMW').catch(() => {})
  await page.screenshot({ path: `${OUT}/smoke-a-3-fahrzeug.png` })

  // Step 3
  await page.locator('button:has-text("Weiter"):visible').first().click()
  await page.waitForTimeout(1200)
  const b3 = await page.locator('body').innerText()
  ok('Step 3 Schaden erreichbar', /beschreib|foto|gewerk|schaden/i.test(b3))
  await page.screenshot({ path: `${OUT}/smoke-a-4-schaden.png` })
  await page.waitForTimeout(6000) // letzte Chance fuer spaete Action-Responses im Log
} catch (e) {
  ok(`Ablauf ohne Exception (${String(e).slice(0, 130)})`, false)
  await page.screenshot({ path: `${OUT}/smoke-a-error.png` }).catch(() => {})
} finally {
  console.log(R.join('\n'))
  await browser.close()
}
