// Smoke B / Etappe 1 — Embed-Wizard KOMPLETT auf prod: Standort -> Fahrzeug (gewerblich) ->
// Schaden (Text-KI) -> Kontakt (INTERNE Mail, telefon LEER) -> "Werkstatt anfragen" -> /flow-Redirect.
// Isolation: smoke-embed-e2e@claimondo.test (istInterneEmail), Marker SMOKE-E2E-1607 in der Beschreibung.
import { chromium } from '@playwright/test'

const OUT = process.env.SMOKE_OUT || '.'
const URL = process.env.SMOKE_URL || 'https://app.claimondo.de/embed/werkstatt-finder'
const R = []
const ok = (n, c) => { R.push(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) process.exitCode = 1 }
const info = (n) => R.push(`INFO  ${n}`)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const t0 = Date.now()
page.on('response', async (r) => {
  if (r.request().method() === 'POST' && r.url().includes('werkstatt-finder')) {
    info(`POST <- ${r.status()} @${((Date.now() - t0) / 1000).toFixed(1)}s`)
  }
})
page.on('pageerror', (e) => info(`pageerror: ${String(e).slice(0, 120)}`))

const weiter = async () => {
  await page.locator('button:has-text("Weiter"):visible').first().click()
  await page.waitForTimeout(900)
}

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(4000)

  // Step 1 — Standort via Places
  const addr = page.locator('input[type="text"]:visible').first()
  await addr.click()
  await addr.pressSequentially('Aachener Straße 100, Köln', { delay: 35 })
  await page.locator('.pac-item:visible').first().waitFor({ timeout: 12000 })
  await page.locator('.pac-item:visible').first().click()
  await page.waitForTimeout(3500)
  ok('Standort gesetzt (Places)', /Aachener/i.test(await page.locator('body').innerText()))
  await weiter()

  // Step 2 — Fahrzeug: BMW / PKW (default) / GEWERBLICH / Modell 320d
  await page.locator('input[placeholder*="BMW" i]').first().fill('BMW')
  await page.locator('button:has-text("Gewerblich"):visible').first().click()
  await page.locator('input[placeholder*="3er" i]').first().fill('320d').catch(() => {})
  await page.screenshot({ path: `${OUT}/b1-2-fahrzeug.png` })
  await weiter()

  // Step 3 — Schaden: Beschreibung -> Text-KI
  const ta = page.locator('textarea:visible').first()
  await ta.fill('SMOKE-E2E-1607: Kratzer und Delle im Lack an der Beifahrertuer, Stossstange hinten gerissen')
  await ta.blur()
  // Text-KI-Klassifikation abwarten (Claude-Latenz) — bis 30s auf "Erkannt"/Chips
  let erkannt = false
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000)
    const b = await page.locator('body').innerText()
    if (/erkannt/i.test(b) || /lackier|karosserie/i.test(b)) { erkannt = true; break }
  }
  ok('Text-KI hat Gewerke erkannt', erkannt)
  await page.screenshot({ path: `${OUT}/b1-3-schaden.png` })
  await weiter()

  // Step 4 — Kontakt + Werkstatt-Pick + Absenden
  const b4 = await page.locator('body').innerText()
  ok('Step 4 Kontakt erreichbar', /mail/i.test(b4))
  await page.locator('input[type="email"]:visible, input[placeholder*="mail" i]:visible').first().fill('smoke-embed-e2e@claimondo.test')
  const texts = page.locator('input[type="text"]:visible')
  // Vorname/Nachname (erste zwei Text-Inputs im Kontakt-Step) — best effort
  const n = await texts.count()
  if (n >= 2) { await texts.nth(0).fill('Smoke'); await texts.nth(1).fill('E2E-Embed') }
  // Werkstatt waehlen (erste Treffer-Karte — Suelzer ist am naechsten)
  await page.locator('text=/Sülzer|Autoservice|Werkstatt/i').first().click().catch(() => info('kein Werkstatt-Pick moeglich'))
  await page.screenshot({ path: `${OUT}/b1-4-kontakt.png` })
  const submit = page.locator('button:has-text("anfragen"):visible, button:has-text("Absenden"):visible').first()
  await submit.click()

  // Redirect auf /flow/<token>
  await page.waitForURL(/\/flow\//, { timeout: 45000 })
  const flowUrl = page.url()
  ok('Redirect auf /flow/<token>', /\/flow\//.test(flowUrl))
  console.log('FLOW_URL=' + flowUrl)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/b1-5-flow.png` })
} catch (e) {
  ok(`Ablauf ohne Exception (${String(e).slice(0, 140)})`, false)
  await page.screenshot({ path: `${OUT}/b1-error.png` }).catch(() => {})
} finally {
  console.log(R.join('\n'))
  await browser.close()
}
