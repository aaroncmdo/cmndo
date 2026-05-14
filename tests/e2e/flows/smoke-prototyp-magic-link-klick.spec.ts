import { test, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-902 Prototyp: Live-Durchklicken des Magic-Links den der Mini-Wizard
// erzeugt hat. Token aus dem Aaron-Strecken-Smoke direkt hartcodiert. Wir
// gehen so weit es geht — bei Eingabefeldern fuellen wir nur was wir muessen,
// bei SA-Signatur wird das Canvas-Pad bedient. Account-Anlage findet wirklich
// statt (echter Auth-User auf aaron.sprafke@claimondo.de).

const TOKEN = 'ade1a1c1e71744a8892ecc7a937d4538'

const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'prototyp-mini-wizard',
  'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

let stepIdx = 300
async function shot(page: Page, name: string) {
  stepIdx += 1
  const filename = `${String(stepIdx).padStart(3, '0')}-magic-${name}.png`
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: true,
  })
  console.log(`[SHOT] ${filename}`)
}

async function paintSignature(page: Page, canvasSelector: string) {
  const box = await page.locator(canvasSelector).first().boundingBox()
  if (!box) throw new Error(`Canvas not found: ${canvasSelector}`)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  // Simulierte Aaron-Unterschrift: drei kurze Striche
  await page.mouse.move(box.x + 30, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - 20)
  await page.mouse.move(box.x + box.width - 30, cy + 10)
  await page.mouse.up()
  await page.mouse.move(box.x + 50, cy + 25)
  await page.mouse.down()
  await page.mouse.move(cx - 20, cy + 5)
  await page.mouse.move(cx + 50, cy + 25)
  await page.mouse.up()
}

test('AARON Magic-Link live durchklicken', async ({ page }) => {
  test.setTimeout(180_000)

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (m) => {
    const t = m.type()
    if (t === 'error' || t === 'warning') console.log(`[BROWSER ${t}] ${m.text()}`)
  })

  await page.goto(`/flow/${TOKEN}`, { waitUntil: 'domcontentloaded' })
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '01-flow-landing')

  // Step 1: FlowWizardKfz rendert. Schauen wir was sichtbar ist und
  // klicken uns von hier durch. Wir versuchen breit ueber generische
  // Selektoren ("Weiter"-Buttons) durchzugehen.
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(800)
    const beforeUrl = page.url()
    await shot(page, `step-${String(i + 2).padStart(2, '0')}`)

    // Check ob ein Signatur-Canvas sichtbar ist
    const canvases = page.locator('canvas')
    const canvasCount = await canvases.count()
    if (canvasCount > 0) {
      const visible = await canvases.first().isVisible().catch(() => false)
      if (visible) {
        console.log(`[FLOW] Canvas detected at step ${i + 2}, signing`)
        await paintSignature(page, 'canvas')
        await page.waitForTimeout(300)
        await shot(page, `step-${String(i + 2).padStart(2, '0')}-signed`)
      }
    }

    // Naechster-Step-Button finden (verschiedene Labels)
    const nextBtn = page
      .getByRole('button', { name: /weiter|zustimmen|jetzt|annehmen|absenden|fortfahren|account|unterschreiben|jetzt absenden/i })
      .filter({ hasNot: page.locator('[disabled]') })
      .first()
    const nextVisible = await nextBtn.isVisible().catch(() => false)
    if (!nextVisible) {
      console.log(`[FLOW] Kein Weiter-Button sichtbar an Step ${i + 2} — Abbruch`)
      break
    }
    await nextBtn.scrollIntoViewIfNeeded()
    await nextBtn.click().catch((e) => console.log(`[FLOW] Klick fail: ${e.message}`))
    await page.waitForTimeout(1_500)
    const afterUrl = page.url()
    if (afterUrl === beforeUrl) {
      // Form-step ohne Navigation — okay, weiter zur naechsten Iteration
      console.log(`[FLOW] Step ${i + 2}: gleiche URL ${afterUrl}`)
    } else {
      console.log(`[FLOW] Step ${i + 2}: ${beforeUrl} → ${afterUrl}`)
    }

    // Wenn wir auf /kunde gelandet sind, Abbruch
    if (afterUrl.includes('/kunde')) {
      console.log('[FLOW] Auf /kunde gelandet — fertig')
      await shot(page, `step-${String(i + 2).padStart(2, '0')}-kunde`)
      break
    }
  }

  await page.waitForTimeout(1_000)
  await shot(page, 'final')
  console.log(`[FLOW] Final URL: ${page.url()}`)
})
