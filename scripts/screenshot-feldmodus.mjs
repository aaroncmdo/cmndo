#!/usr/bin/env node
// 2026-05-08: Dedizierter Screenshot-Runner für den Feldmodus / Fokus-Modus.
//
// Was er macht:
//   1. Loggt sich als gewählter SV ein (Default: test-sv@claimondo.de).
//   2. Mockt die Browser-Geolocation auf einen konfigurierbaren GPS-Punkt.
//   3. Navigiert zu /gutachter/heute, falls eine aktive Session da ist
//      direkt weiter zu /gutachter/feldmodus.
//   4. Wartet bis Mapbox die Tiles geladen hat (canvas-Pixel-Check).
//   5. Schießt eine Folge von Screenshots in 4 Phasen:
//        - 01_arrival        Initial-Map mit SV-Pin + Stop-Pin
//        - 02_navi_tbt       Nach „Losfahren" (Camera-Follow + TbT)
//        - 03_blitzer_zone   GPS auf einen Blitzer-naheen Punkt geschoben
//        - 04_arrived        GPS auf den Stop geschoben (Geofence-Trigger)
//   6. Sammelt Console-Logs + Page-Errors in ein .log neben den PNGs.
//   7. Schreibt eine INDEX.md mit Mini-Vorschau-Tabelle + Console-Auszug.
//
// Aufruf:
//   node scripts/screenshot-feldmodus.mjs
//   FELDMODUS_EMAIL=aaron.sprafke@claimondo.de \
//   FELDMODUS_PASSWORD=… \
//   FELDMODUS_BASE_URL=https://cmndo.vercel.app \
//   FELDMODUS_VIEWPORT=mobile \
//   node scripts/screenshot-feldmodus.mjs
//
// Voraussetzung: `npx playwright install chromium` einmalig.

import { chromium } from 'playwright'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE_URL = process.env.FELDMODUS_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.FELDMODUS_EMAIL ?? 'test-sv@claimondo.de'
const PASSWORD = process.env.FELDMODUS_PASSWORD ?? 'Test1234!'
const VIEWPORT_NAME = process.env.FELDMODUS_VIEWPORT ?? 'desktop'

// Test-Daten: Höninger Weg 100, 50969 Köln (Termin den Aaron geseedet hat)
const STOP = { lat: 50.916214, lng: 6.941144, label: 'Höninger Weg 100' }
// 2026-05-08: Aarons echter Standort = Mediapark (Köln-Neustadt-Nord).
// Vorher war der Mock auf 50.929, 6.932 (~Köln-Sülz-Süd) was nichts mit
// Aarons real-life Setup zu tun hatte und im Smoke verwirrend war.
const START_GPS = { lat: 50.9522, lng: 6.9430, label: 'Mediapark Köln' }
// Mid-Route zwischen Mediapark und Höninger Weg — knapp 4 km Richtung
// Süden. Hier dürfte ein Blitzer in der Atudo-API auftauchen.
const MID_GPS = { lat: 50.9335, lng: 6.9410 }
// Innerhalb 50 m vom Stop — Geofence-Trigger.
const ARRIVAL_GPS = {
  lat: STOP.lat + 0.0002,
  lng: STOP.lng + 0.0002,
}

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 2 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3 },
}
const VP = VIEWPORTS[VIEWPORT_NAME]
if (!VP) {
  console.error(`Unbekannter Viewport: ${VIEWPORT_NAME}. Erlaubt: desktop|tablet|mobile`)
  process.exit(2)
}

const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT_DIR = join(
  'docs',
  'portals-review',
  'screenshots',
  'feldmodus',
  `${STAMP}_${VIEWPORT_NAME}`,
)
const LOG_FILE = join(OUT_DIR, 'browser.log')
const INDEX_FILE = join(OUT_DIR, 'INDEX.md')

const screenshots = [] // {name, path, note}
const consoleEntries = [] // {type, text}
const pageErrors = []

async function logLine(line) {
  await appendFile(LOG_FILE, `${new Date().toISOString()} ${line}\n`).catch(() => {})
}

async function waitForMap(page, label) {
  await page.waitForFunction(
    () => {
      const c = document.querySelector('.mapboxgl-canvas')
      if (!c) return false
      const rect = c.getBoundingClientRect()
      return rect.width > 100 && rect.height > 100
    },
    { timeout: 30_000 },
  )
  // Tiles brauchen ein paar Frames bis die Buildings „voll" sind.
  await page.waitForTimeout(2_500)
  await logLine(`map ready: ${label}`)
}

async function shoot(page, slot, note) {
  const fname = `${slot}.png`
  const fpath = join(OUT_DIR, fname)
  await page.screenshot({ path: fpath, fullPage: false })
  screenshots.push({ name: slot, path: fname, note })
  await logLine(`screenshot saved: ${slot} (${note})`)
}

/**
 * 2026-05-08: Animations-Burst — schießt mehrere Screenshots in
 * `intervalMs` Abstand. Damit sieht man fade-in / pulse-cycles /
 * countdown-bars wie sie sich bewegen. Slot-Namen werden mit `_a`,
 * `_b`, `_c` Suffix abgelegt.
 */
async function shootBurst(page, slot, note, frames = 3, intervalMs = 600) {
  const labels = ['a', 'b', 'c', 'd', 'e']
  for (let i = 0; i < frames; i++) {
    const subSlot = `${slot}_${labels[i] ?? i}`
    await shoot(page, subSlot, `${note} — frame ${i + 1}/${frames}`)
    if (i < frames - 1) await page.waitForTimeout(intervalMs)
  }
}

async function setGps(context, { lat, lng }) {
  await context.setGeolocation({ latitude: lat, longitude: lng, accuracy: 5 })
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([
    page.waitForURL(/\/gutachter|\/admin|\/dispatch/, { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ])
  await logLine(`logged in as ${EMAIL}`)
}

async function gotoHeute(page) {
  await page.goto(`${BASE_URL}/gutachter/heute`, { waitUntil: 'domcontentloaded' })
  // Tagesroute-Map braucht ein paar Frames bis sie ihre Tiles fertig hat,
  // plus async fetchMultiStopRoute + Atudo + HERE Hazards/Flow ~3-5s.
  await page.waitForTimeout(6_000)
  await logLine('heute reached')
}

async function startTagesmodus(page) {
  const triggers = [
    'text=Feldmodus starten',
    'text=Tagesroute starten',
    'text=Tagesmodus starten',
    'text=Fokus-Modus',
    'a[href="/gutachter/feldmodus"]',
  ]
  for (const sel of triggers) {
    const el = page.locator(sel).first()
    if (await el.count()) {
      await el.click().catch(() => {})
      await logLine(`clicked: ${sel}`)
      break
    }
  }
  await page.waitForURL(/\/gutachter\/feldmodus/, { timeout: 10_000 }).catch(async () => {
    await logLine('Tagesmodus-Trigger nicht gefunden, navigiere direkt')
    await page.goto(`${BASE_URL}/gutachter/feldmodus`, { waitUntil: 'domcontentloaded' })
  })
  await logLine('feldmodus reached')
}

async function tryCollapseSheet(page) {
  // 2026-05-08: Mobile-Bottom-Sheet zuklappen damit die Map sichtbar wird.
  // Toggle-Button ist ein <button> mit aria-label „Stops einklappen".
  const sel = 'button[aria-label="Stops einklappen"]'
  const el = page.locator(sel).first()
  if (await el.count()) {
    await el.click().catch(() => {})
    await logLine(`collapsed sheet: ${sel}`)
    return true
  }
  return false
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(LOG_FILE, `# Feldmodus-Screenshots ${STAMP}\nViewport: ${VIEWPORT_NAME} ${VP.width}x${VP.height}\nBase: ${BASE_URL}\nUser: ${EMAIL}\n\n`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: VP.width, height: VP.height },
    deviceScaleFactor: VP.deviceScaleFactor,
    isMobile: VIEWPORT_NAME === 'mobile',
    hasTouch: VIEWPORT_NAME !== 'desktop',
    geolocation: { latitude: START_GPS.lat, longitude: START_GPS.lng, accuracy: 5 },
    userAgent:
      VIEWPORT_NAME === 'mobile'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    locale: 'de-DE',
  })

  const page = await context.newPage()
  page.on('console', (msg) => {
    consoleEntries.push({ type: msg.type(), text: msg.text() })
    if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('[sv-car-three') || msg.text().includes('[FeldmodusMap]') || msg.text().includes('[heute-map]')) {
      logLine(`[browser:${msg.type()}] ${msg.text()}`).catch(() => {})
    }
  })
  page.on('pageerror', (err) => {
    pageErrors.push(String(err))
    logLine(`[pageerror] ${err}`).catch(() => {})
  })
  page.on('requestfailed', (req) => {
    logLine(`[req-failed] ${req.url()} ${req.failure()?.errorText ?? ''}`).catch(() => {})
  })

  // GPS-Permission MUSS vor dem ersten goto() für die Origin gegranted
  // sein, sonst sieht useWatchPosition `permissionState=prompt` und
  // timeoutet. Origin-spezifisch statt global, damit nicht versehentlich
  // andere Domains reingrantet werden (sicherer).
  await context.grantPermissions(['geolocation'], { origin: BASE_URL })

  // 2026-05-08: LocalStorage „Mein Gebiet auf Karte"-Toggle aktivieren
  // damit der Hub das Isochrone-Polygon im Smoke rendert.
  await context.addInitScript(() => {
    try { window.localStorage.setItem('claimondo_show_gebiet_in_hub', '1') } catch { /* noop */ }
  })

  try {
    await login(page)

    // Phase 00: /gutachter/heute Hub VOR dem Tagesmodus-Start.
    // Zeigt die Tagesroute-Map, die Stop-Liste, den „Tagesmodus starten"-
    // CTA und alle Hub-Widgets. Aaron-Anforderung 2026-05-08: er will
    // auch diese Ansicht im Smoke-Lauf sehen — der Feldmodus ist nicht
    // der einzige relevante Screen.
    await gotoHeute(page)
    await shoot(page, '00_heute_hub', 'Heute-Hub mit Tagesroute-Map vor dem Tagesmodus-Start')

    // Phase 01: Tagesmodus starten → Feldmodus erreicht
    await startTagesmodus(page)
    await waitForMap(page, 'feldmodus-arrival')
    // Burst capture damit fade-in der NaviHud + Card-Slide-In sichtbar wird
    await shootBurst(page, '01_feldmodus_start', 'Feldmodus initial — fade-in der Glass-Cards', 3, 500)

    // Phase 02: Mobile-Sheet einklappen damit Map sichtbar ist (Desktop:
    // Sheet existiert nicht, Aufruf ist no-op).
    if (await tryCollapseSheet(page)) {
      await page.waitForTimeout(700)
      await shoot(page, '02_map_visible', 'Bottom-Sheet eingeklappt — Map + TbT + Stau-Linien sichtbar')
    } else {
      await logLine('Kein Sheet-Toggle (Desktop oder Layout-Variante)')
      await shoot(page, '02_map_visible', 'Map vollständig sichtbar (kein Sheet zu kollabieren)')
    }

    // Phase 03: GPS auf Mid-Route → Reroute-Toast countdown captured
    await setGps(context, MID_GPS)
    await page.waitForTimeout(1_500)
    // Burst: 4 frames × 1.5s = 6s — sollte den 10s-Reroute-Countdown
    // durchlaufen lassen, plus Maneuver-Updates capturen
    await shootBurst(page, '03_blitzer_zone', 'Mid-Route — NaviHud Reroute-Countdown / Maneuver-Updates', 4, 1500)

    // Phase 04: GPS innerhalb Geofence → arrived state
    await setGps(context, ARRIVAL_GPS)
    await page.waitForTimeout(3_500) // Geofence (50m) braucht 1-2 Render-Cycles
    await shoot(page, '04_arrived', 'Geofence-Trigger — angekommen-State')
    await page.waitForTimeout(1_500)
    await shoot(page, '04b_arrived_settled', 'angekommen-State 1.5s später (Hero-Pin-Pulse-Cycle)')
  } catch (err) {
    await logLine(`[fatal] ${err?.stack ?? err}`)
    console.error('Lauf abgebrochen:', err?.message ?? err)
  } finally {
    await writeIndex()
    await browser.close()
  }

  console.log(`\nScreenshots: ${OUT_DIR}`)
  console.log(`Log: ${LOG_FILE}`)
  console.log(`Index: ${INDEX_FILE}`)
}

async function writeIndex() {
  const lines = []
  lines.push(`# Feldmodus-Smoke ${STAMP}`)
  lines.push('')
  lines.push(`Viewport: \`${VIEWPORT_NAME}\` (${VP.width}x${VP.height} @${VP.deviceScaleFactor}x)`)
  lines.push(`Base-URL: \`${BASE_URL}\``)
  lines.push(`User: \`${EMAIL}\``)
  lines.push(`GPS-Start: \`${START_GPS.lat}, ${START_GPS.lng}\``)
  lines.push(`Stop: \`${STOP.label}\` (${STOP.lat}, ${STOP.lng})`)
  lines.push('')
  lines.push('## Screenshots')
  lines.push('')
  for (const s of screenshots) {
    lines.push(`### ${s.name}`)
    lines.push(`${s.note}`)
    lines.push('')
    lines.push(`![${s.name}](${s.path})`)
    lines.push('')
  }
  lines.push('## Browser-Console')
  lines.push('')
  const errors = consoleEntries.filter((e) => e.type === 'error')
  const warnings = consoleEntries.filter((e) => e.type === 'warning')
  lines.push(`- Errors: **${errors.length}**`)
  lines.push(`- Warnings: **${warnings.length}**`)
  lines.push(`- Page-Errors: **${pageErrors.length}**`)
  lines.push('')
  if (errors.length || warnings.length || pageErrors.length) {
    lines.push('### Auszug (max 30)')
    lines.push('```')
    let count = 0
    for (const e of [...errors, ...warnings]) {
      if (count++ >= 30) break
      lines.push(`[${e.type}] ${e.text}`)
    }
    for (const e of pageErrors.slice(0, 10)) {
      lines.push(`[pageerror] ${e}`)
    }
    lines.push('```')
  }
  await writeFile(INDEX_FILE, lines.join('\n'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
