import { test, type Page, type Locator } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Vollstrecke-Smoke 2026-05-16 — Mandanten-End-to-End gegen staging.claimondo.de.
//
// Aaron-Vorgabe: VOR + NACH jedem Klick ein Screenshot, jede Option durchklicken
// auf UI-Erreichbarkeit, slowMo damit der Ablauf live mitlesbar ist.
//
// Soll-Ablauf:
//   A  Kunde /gutachter-finden — Adresse, find-best-SV, Termin, SA-Signatur
//   B  Kunde Portal — Magic-Link, Willkommen, Passwort, dynamisches Onboarding
//   C  SV verschiebt Termin → Kunde nimmt Verlegung an
//   D  SV Tagesmodus-Anfahrt + Gutachten-Upload
//
// Run:
//   PLAYWRIGHT_BASE_URL=https://staging.claimondo.de \
//   STAGING_BASIC_PASS='...' npx playwright test smoke-vollstrecke --headed --workers=1

const SCREENSHOT_DIR = path.resolve(
  __dirname, '..', '..', '..', 'docs', '16.05.2026', 'vollstrecke-smoke', 'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const DATA = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'smoke-vollstrecke-daten.json'), 'utf-8'),
)

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const BASIC_USER = process.env.STAGING_BASIC_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_PASS ?? ''
const IS_LOCAL = BASE.startsWith('http://localhost') || BASE.startsWith('http://127.')
const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)

let stepIdx = 0
async function shot(page: Page, name: string) {
  stepIdx += 1
  const f = `${String(stepIdx).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, f), fullPage: true }).catch(() => {})
  console.log(`[SHOT] ${f}`)
}

// Aaron-Vorgabe: VOR + NACH jedem Klick. clickShot kapselt das.
async function clickShot(page: Page, locator: Locator, name: string) {
  await shot(page, `${name}-VOR`)
  await locator.click({ timeout: 15_000 })
  await page.waitForTimeout(1000)
  await shot(page, `${name}-NACH`)
}

async function dismissCookie(page: Page) {
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
}

test.use({
  baseURL: BASE,
  httpCredentials:
    BASIC_PASS && !IS_LOCAL ? { username: BASIC_USER, password: BASIC_PASS } : undefined,
  viewport: { width: 1400, height: 900 },
  // slowMo: jeder Playwright-Schritt 600ms verlangsamt → live mitlesbar.
  launchOptions: { slowMo: 600 },
})

test.describe.configure({ mode: 'serial' })

function field(page: Page, key: string) {
  return page.locator(`[data-testid="feld-${key}"]:visible`).first()
}
function fieldOption(page: Page, key: string, value: string) {
  return page.locator(`[data-testid="feld-${key}-opt-${value}"]:visible`).first()
}
function weiterBtn(page: Page) {
  return page.locator('[data-testid="wizard-weiter"]:visible').first()
}

test('Phase A: Kunde /gutachter-finden — Adresse → best-SV → Termin → SA', async ({ page }) => {
  test.setTimeout(360_000)
  if (!IS_LOCAL && !BASIC_PASS) test.skip(true, 'STAGING_BASIC_PASS nicht gesetzt')

  const findings: string[] = []
  page.on('pageerror', (e) => {
    console.log(`[BROWSER pageerror] ${e.message}`)
    findings.push(`pageerror: ${e.message}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[BROWSER console.error] ${msg.text()}`)
      findings.push(`console.error: ${msg.text()}`)
    }
  })

  const smokeEmail = `aaron.sprafke+kunde-${RUN_ID}@claimondo.de`
  console.log(`[smoke] RUN_ID=${RUN_ID} email=${smokeEmail}`)

  // ─── A0: /gutachter-finden laden ──────────────────────────────────────
  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await shot(page, 'A0-finder-geladen')

  // ─── A1: Marker-SV vorselektieren (simuliert Karten-Klick) ────────────
  // Aktueller Stand: echter Marker-Klick ist AAR-932 (Highlight/Zoom/Vorname).
  // Bis dahin via Event — verifiziert den Self-Dispatch-Pfad.
  const testSvId = '1da11741-a406-45ce-a27b-c041576cccbb'
  await shot(page, 'A1-vor-sv-select')
  await page.evaluate((svId) => {
    document.dispatchEvent(new CustomEvent('claimondo:open-wizard', { detail: { svId } }))
  }, testSvId)
  await page.waitForTimeout(1000)
  await shot(page, 'A1-nach-sv-select')

  // ─── A2: Phase standort — besichtigungsort eingeben ───────────────────
  await field(page, 'besichtigungsort').fill('Westen 63a, 42855 Remscheid')
  await shot(page, 'A2-adresse-eingetippt')
  await clickShot(page, weiterBtn(page), 'A2-weiter-zu-termin')

  // ─── A3: Phase termin — Dringlichkeit + Slot ──────────────────────────
  await clickShot(page, fieldOption(page, 'wunschtermin_wann', 'tage'), 'A3-dringlichkeit-tage')
  await page.waitForTimeout(1500)

  const firstDay = page.locator('[data-testid^="feld-wunschtermin-tag-"]:visible').first()
  await firstDay.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await clickShot(page, firstDay, 'A3-tag-gewaehlt')

  const firstSlot = page.locator('[data-testid^="feld-wunschtermin-slot-"]:visible').first()
  await firstSlot.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await clickShot(page, firstSlot, 'A3-slot-gewaehlt')
  await clickShot(page, weiterBtn(page), 'A3-weiter-zu-service')

  // ─── A4: Phase service — nur_gutachter (kein LexDrive-Spam) ───────────
  await clickShot(page, fieldOption(page, 'service_typ', 'nur_gutachter'), 'A4-service-nur-gutachter')
  await clickShot(page, weiterBtn(page), 'A4-weiter')

  // Kanzlei-Phase bei nur_gutachter conditional übersprungen — falls doch da:
  const kanzleiOpt = fieldOption(page, 'kanzlei_wunsch', 'keine_kanzlei')
  if (await kanzleiOpt.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await clickShot(page, kanzleiOpt, 'A4-keine-kanzlei')
    await clickShot(page, weiterBtn(page), 'A4-weiter-nach-kanzlei')
  }

  // ─── A5: Phase kontakt — Daten + Kanal ────────────────────────────────
  await shot(page, 'A5-kontakt-leer')
  await field(page, 'vorname').fill(DATA.anspruchsteller.vorname)
  await field(page, 'nachname').fill(DATA.anspruchsteller.nachname)
  await field(page, 'telefon').fill('+491633628571')
  await field(page, 'email').fill(smokeEmail)
  await shot(page, 'A5-kontakt-ausgefuellt')
  await clickShot(page, fieldOption(page, 'bevorzugter_kanal', 'whatsapp'), 'A5-kanal-whatsapp')
  await clickShot(page, field(page, 'dsgvo_zustimmung'), 'A5-dsgvo')

  // ─── A6: Unterschrift (Canvas) ────────────────────────────────────────
  const sig = field(page, 'unterschrift')
  await sig.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  await shot(page, 'A6-unterschrift-leer')
  const box = await sig.boundingBox()
  if (box) {
    await page.mouse.move(box.x + 30, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 110, box.y + box.height / 2, { steps: 6 })
    await page.mouse.move(box.x + 200, box.y + box.height / 2 + 12, { steps: 6 })
    await page.mouse.up()
  }
  await page.waitForTimeout(600)
  await shot(page, 'A6-unterschrift-gemalt')

  // ─── A7: Submit ───────────────────────────────────────────────────────
  await shot(page, 'A7-vor-submit')
  await weiterBtn(page).click({ timeout: 15_000 })
  await page.waitForTimeout(6000) // Server-Action konvertiereAnfrageZuFall
  await shot(page, 'A7-nach-submit')

  // ─── A8: Erfolgsscreen + Self-Service-CTA ─────────────────────────────
  const cta = page.locator('[data-testid="self-service-cta"]').first()
  const ctaVisible = await cta.isVisible({ timeout: 6_000 }).catch(() => false)
  console.log(`[A] Self-Service-CTA sichtbar: ${ctaVisible}`)
  if (ctaVisible) {
    const href = await cta.getAttribute('href')
    console.log(`[A] CTA-Href: ${href}`)
    await clickShot(page, cta, 'A8-self-service-cta')
    console.log(`[A] URL nach CTA: ${page.url()}`)
  } else {
    await shot(page, 'A8-CTA-FEHLT')
    findings.push('BLOCKER: Self-Service-CTA fehlt auf Erfolgsscreen')
  }

  console.log(`[A] ===== FINDINGS (${findings.length}) =====`)
  findings.forEach((f) => console.log(`[A]   ${f}`))
})
