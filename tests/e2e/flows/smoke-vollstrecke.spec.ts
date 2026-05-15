import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Vollstrecke-Smoke 2026-05-15 — Mandanten-End-to-End gegen staging.claimondo.de.
// Lead-Start als Kunde via /gutachter-finden → SV-Termin → Verlegung → Dispatch
// übernimmt → SV-Feldmodus → Gutachten-Upload → KB-View → XC-Audit.
//
// Daten aus docs/PICS/Gutachten Alexander Miljkovic RS IL 88.pdf (smoke-vollstrecke-daten.json).
// SV-Identität wird auf "Aaron Test-Sprafke" gesetzt (NICHT Hasan Cakmak aus dem PDF).
//
// Run:
//   STAGING_BASIC_PASS='ClaimondoSuperuser123789!!' \
//     npx playwright test smoke-vollstrecke --headed --workers=1

const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '15.05.2026',
  'vollstrecke-smoke',
  'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const DATA = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'smoke-vollstrecke-daten.json'), 'utf-8'),
)

// Default: lokaler Dev-Server. Override mit PLAYWRIGHT_BASE_URL für Staging-Run.
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const BASIC_USER = process.env.STAGING_BASIC_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_PASS ?? ''
const IS_LOCAL = BASE.startsWith('http://localhost') || BASE.startsWith('http://127.')
const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const SMOKE_PREFIX = `SMOKE-${RUN_ID}`

let stepIdx = 0
async function shot(page: Page, name: string) {
  stepIdx += 1
  const f = `${String(stepIdx).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, f), fullPage: true })
  console.log(`[SHOT] ${f}`)
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
    BASIC_PASS && !IS_LOCAL
      ? { username: BASIC_USER, password: BASIC_PASS }
      : undefined,
  viewport: { width: 1400, height: 900 },
})

test.describe.configure({ mode: 'serial' })

// Wizard rendert 2x im DOM (Desktop-Sidebar + Mobile-Sheet) — die sichtbare nehmen.
function field(page: Page, key: string) {
  return page.locator(`[data-testid="feld-${key}"]:visible`).first()
}
function fieldOption(page: Page, key: string, value: string) {
  return page.locator(`[data-testid="feld-${key}-opt-${value}"]:visible`).first()
}
async function clickWeiter(page: Page) {
  await page.locator('[data-testid="wizard-weiter"]:visible').first().click()
  await page.waitForTimeout(500)
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

test('Phase 1: /gutachter-finden Wizard → Anfrage submitten', async ({ page }) => {
  test.setTimeout(240_000)
  if (!IS_LOCAL && !BASIC_PASS) test.skip(true, 'STAGING_BASIC_PASS nicht gesetzt')

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[BROWSER console.error] ${msg.text()}`)
  })

  console.log(`[smoke] RUN_ID=${RUN_ID} PREFIX=${SMOKE_PREFIX}`)
  // Aaron-Anweisung: WA + Email müssen an AARONS Test-Empfänger gehen,
  // NICHT an den echten Kunden aus dem PDF (Miljkovic 017632851069).
  // Plus-Adressierung damit Aaron im Inbox nach „+kunde…" filtern kann.
  const smokeEmail = `aaron.sprafke+kunde-${RUN_ID}@claimondo.de`
  console.log(`[smoke] email=${smokeEmail}`)

  // 1. /gutachter-finden
  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await shot(page, 'gutachter-finden-initial')

  // Mobile-Bottom-Sheet öffnen falls Desktop-Sidebar nicht direkt sichtbar
  // (Wizard wird immer gerendert, aber auf mobilem Viewport hinter Sheet)
  // → Bei 1400x900 sollte der Wizard direkt da sein.

  // Self-Dispatch-Fix-Verify: simulieren Marker-Klick auf SV "Schmidt
  // Sachverständige Köln" (test-sv, sv_id=1da11741…). Das popup-CTA macht
  // dasselbe via inline-onclick. Nach Fix muss zugeordneter_sv_id in der
  // Anfrage gesetzt sein + convertLeadToClaim erzeugt Auftrag+Termin+WA.
  const testSvId = '1da11741-a406-45ce-a27b-c041576cccbb'
  await page.evaluate((svId) => {
    document.dispatchEvent(
      new CustomEvent('claimondo:open-wizard', { detail: { svId } }),
    )
  }, testSvId)
  await page.waitForTimeout(500)
  await shot(page, 'p0-sv-preselected')

  // 2. Phase 10 standort: besichtigungsort
  await field(page, 'besichtigungsort').fill('Westen 63a, 42855 Remscheid')
  await shot(page, 'p1-standort-ausgefuellt')
  await clickWeiter(page)
  await shot(page, 'p2-termin-erscheint')

  // 3. Phase 20 termin: wunschtermin_wann + wunschtermin (slot)
  await fieldOption(page, 'wunschtermin_wann', 'tage').click()
  await page.waitForTimeout(1500) // Slot-Picker render
  await shot(page, 'p2-wann-tage-gewaehlt')

  // Erster verfügbarer Tag im Slot-Picker
  const firstDayBtn = page
    .locator('[data-testid^="feld-wunschtermin-tag-"]:visible')
    .first()
  await firstDayBtn.waitFor({ state: 'visible', timeout: 15_000 })
  await firstDayBtn.click()
  await page.waitForTimeout(800)

  const firstSlotBtn = page
    .locator('[data-testid^="feld-wunschtermin-slot-"]:visible')
    .first()
  await firstSlotBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await firstSlotBtn.click()
  await shot(page, 'p2-slot-ausgewaehlt')
  await clickWeiter(page)
  await shot(page, 'p3-service-erscheint')

  // 4. Phase 25 service_typ: nur_gutachter (Aaron-Anweisung: nicht 'komplett',
  // sonst pushMandatToKanzlei feuert bei jedem Smoke → LexDrive-Spam)
  await fieldOption(page, 'service_typ', 'nur_gutachter').click()
  await shot(page, 'p3-nur-gutachter-gewaehlt')
  await clickWeiter(page)
  await shot(page, 'p4-nach-service')

  // Phase 27 kanzlei wird bei 'nur_gutachter' übersprungen (conditional_on).
  // Falls sie trotzdem erscheint: 'keine_kanzlei' setzen.
  const kanzleiVisible = await fieldOption(page, 'kanzlei_wunsch', 'keine_kanzlei')
    .isVisible({ timeout: 2_000 })
    .catch(() => false)
  if (kanzleiVisible) {
    await fieldOption(page, 'kanzlei_wunsch', 'keine_kanzlei').click()
    await shot(page, 'p4-keine-kanzlei')
    await clickWeiter(page)
  }
  await shot(page, 'p5-kontakt-erscheint')

  // 6. Phase 30 kontakt: Miljkovic-Daten
  await field(page, 'vorname').fill(DATA.anspruchsteller.vorname)
  await field(page, 'nachname').fill(DATA.anspruchsteller.nachname)
  // Aaron-Anweisung: NIE PDF-Telefon (Miljkovic 017632851069). Test-Empfänger:
  await field(page, 'telefon').fill('+491633628571')
  await field(page, 'email').fill(smokeEmail)
  await fieldOption(page, 'bevorzugter_kanal', 'whatsapp').click()
  await shot(page, 'p5-kontakt-ausgefuellt')

  // DSGVO + Unterschrift
  await field(page, 'dsgvo_zustimmung').click()
  await page.waitForTimeout(300)

  // Signature: Canvas-Maus-Stroke (3 Punkte = einfache Linie)
  const sigCanvas = field(page, 'unterschrift')
  await sigCanvas.waitFor({ state: 'visible', timeout: 5_000 })
  const box = await sigCanvas.boundingBox()
  if (box) {
    await page.mouse.move(box.x + 30, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 5 })
    await page.mouse.move(box.x + 180, box.y + box.height / 2 + 10, { steps: 5 })
    await page.mouse.up()
  }
  await page.waitForTimeout(500)
  await shot(page, 'p5-unterschrift-gemalt')

  // 7. Submit (= Termin buchen, weil letzte Phase)
  await page.locator('[data-testid="wizard-weiter"]:visible').first().click()
  await page.waitForTimeout(5000) // Server-Action + Redirect
  await shot(page, 'p6-nach-submit')

  // 8. Erfolgs-Indikator suchen (URL-Wechsel oder Bestätigungs-Text)
  const currentUrl = page.url()
  const erfolgssichtbar = await page
    .getByText(/erfolgreich|gebucht|bestätig|magic.link/i)
    .first()
    .isVisible({ timeout: 3_000 })
    .catch(() => false)
  console.log(`[1] URL nach Submit: ${currentUrl}`)
  console.log(`[1] Erfolgs-Indikator sichtbar: ${erfolgssichtbar}`)

  // 9. Self-Service-CTA: muss jetzt sichtbar sein (Bug-Fix Verify)
  const cta = page.locator('[data-testid="self-service-cta"]').first()
  const ctaVisible = await cta.isVisible({ timeout: 5_000 }).catch(() => false)
  console.log(`[1] Self-Service-CTA sichtbar: ${ctaVisible}`)

  if (ctaVisible) {
    const ctaHref = await cta.getAttribute('href')
    console.log(`[1] CTA-Href: ${ctaHref}`)
    await shot(page, 'p7-erfolg-mit-cta')
    await cta.click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await shot(page, 'p8-login-page')
    console.log(`[1] URL nach CTA-Click: ${page.url()}`)
  } else {
    await shot(page, 'p7-erfolg-CTA-FEHLT')
    console.log('[1] BUG: CTA fehlt — Erfolgsscreen ohne Self-Service-Pfad')
  }
})

// Lead-ID aus DB für Phase 4 — wird per ENV oder Most-Recent-Miljkovic gesucht
const MILJKOVIC_LEAD_ID = process.env.SMOKE_LEAD_ID

test('Phase 4: Dispatch übernimmt Lead → SV-Zuweisung (NICHT Hasan Cakmak)', async ({ page }) => {
  test.setTimeout(180_000)

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[BROWSER console.error] ${msg.text()}`)
  })

  // 1. Login als test-dispatch
  await login(page, 'test-dispatch@claimondo.de', 'Test1234!')
  await shot(page, 'p4-dispatch-eingeloggt')
  console.log(`[4] URL nach Login: ${page.url()}`)

  // 2. /dispatch öffnen
  await page.goto('/dispatch', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await shot(page, 'p4-dispatch-uebersicht')

  // 3. Lead-Liste / Leads-Tab finden
  // Versuche zuerst direkte Navigation zu /dispatch/leads
  await page.goto('/dispatch/leads', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot(page, 'p4-leads-liste')

  // 4. Miljkovic-Lead-Row finden + den ganzen Row klicken (oder den → Detail-Link)
  const miljkovicRow = page.getByRole('row').filter({ hasText: /Miljkovic/i }).first()
  const visible = await miljkovicRow.isVisible({ timeout: 5_000 }).catch(() => false)
  console.log(`[4] Miljkovic-Row sichtbar: ${visible}`)

  if (!visible) {
    console.log('[4] Miljkovic-Lead nicht via Liste gefunden — Spec endet hier zum Debugging')
    return
  }

  // Versuche zuerst Link/Anchor innerhalb der Row, sonst die Row selbst
  const detailLink = miljkovicRow.locator('a[href*="/dispatch/leads/"]').first()
  const linkCount = await detailLink.count()
  if (linkCount > 0) {
    await detailLink.click()
  } else {
    await miljkovicRow.click()
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot(page, 'p4-lead-detail')
  console.log(`[4] URL nach Lead-Click: ${page.url()}`)

  // 5. SV-Zuweisung suchen
  await shot(page, 'p4-lead-detail-full')

  // 6. Auf Phase 2 (Termin) wechseln
  const phase2Tab = page
    .getByRole('button', { name: /^\s*2\b|2[.\s]+Termin/i })
    .or(page.getByText(/^\s*2[.\s]+Termin/i))
    .first()
  await phase2Tab.click({ timeout: 5000 }).catch(async () => {
    // Fallback: jeder klickbare Tab mit "Termin"
    await page.getByText(/Termin/i).first().click()
  })
  await page.waitForTimeout(1500)
  await shot(page, 'p4-phase2-termin-tab')

  // 7. Screenshot der Termin-Phase — SV-Auswahl finden
  console.log(`[4] URL Phase 2: ${page.url()}`)
})
