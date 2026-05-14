import { test, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-905 Vollstaendig-Smoke: ab Startseite bis "Termin von SV wahrgenommen".
// Ein einziger durchgehender Test, der so weit kommt wie technisch moeglich.
// Wo es haengt (z.B. /flow/[token] erwartet zugewiesenen SV den der Mini-
// Wizard nicht hat), dokumentieren wir mit Stopper-Screenshot.

const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'aar897-final-smoke',
  'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const EMAIL = `smoke-voll-${RUN_ID}@claimondo.de`
const PASSWORD = 'SmokeVoll1234!'

let stepIdx = 100
async function shot(page: Page, name: string) {
  stepIdx += 1
  const f = `${String(stepIdx).padStart(3, '0')}-voll-${name}.png`
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

async function paintCanvas(page: Page): Promise<boolean> {
  const canvas = page.locator('canvas').first()
  if (!(await canvas.isVisible().catch(() => false))) return false
  const box = await canvas.boundingBox()
  if (!box) return false
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
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
  return true
}

test('Vollstaendig: Startseite → Termin gebucht (so weit es geht)', async ({ page }) => {
  test.setTimeout(300_000)
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[BROWSER error] ${m.text()}`)
  })

  // ═══ PHASE 1: Startseite ════════════════════════════════════════════
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '01-startseite')

  // CTA "Schaden melden"
  await page.locator('a[href="/schaden-melden"]').first().click()
  await page.waitForURL(/\/schaden-melden$|\/schaden-melden\?/, { timeout: 15_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '02-mini-wizard-leer')

  // ═══ PHASE 2: Mini-Wizard ausfuellen ═══════════════════════════════
  await page.locator('#unfallort').fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#vorname').fill('AnnaSmoke')
  await page.locator('#nachname').fill('SmokeTest')
  await page.locator('#telefon').fill('+49 221 1234567')
  await page.locator('#email').fill(EMAIL)
  await page.locator('[data-slot="checkbox"]').first().click()
  await shot(page, '03-mini-wizard-ausgefuellt')

  await page.getByRole('button', { name: /login-link erhalten/i }).click()
  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 25_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '04-bestaetigung')

  // ═══ PHASE 3: Magic-Link-Token aus DB holen ═════════════════════════
  let token: string | null = null
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(1_000)
    const r = await page.evaluate(async (e) => {
      const res = await fetch(`/api/dev/lookup-token?email=${encodeURIComponent(e)}`)
      return { s: res.status, b: await res.json().catch(() => null) }
    }, EMAIL)
    if (r.s === 200 && r.b?.token) {
      token = r.b.token
      console.log(`[TOKEN] ${token}`)
      break
    }
  }
  if (!token) {
    await shot(page, '05-STOPPER-kein-token')
    test.fail()
    return
  }

  // ═══ PHASE 4: /flow/[token] aufrufen ═══════════════════════════════
  await page.goto(`/flow/${token}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '06-flow-token-landing')

  // ═══ PHASE 5: FlowWizardKfz durchklicken (4 Steps) ══════════════════
  // Steps: zusammenfassung → gutachter → sa → account
  // Bei Mini-Wizard-Lead (kein SV zugewiesen) wird "gutachter"-Step
  // vermutlich Stopper werfen.
  //
  // AAR-906: Nachname kommt jetzt aus dem Mini-Wizard — kein Nachreichen mehr noetig.

  for (let step = 0; step < 6; step += 1) {
    await page.waitForTimeout(1_000)
    await shot(page, `07-flow-step-${String(step + 1).padStart(2, '0')}`)

    // Alle Datenschutz/SV-Akzeptanz/SA-Checkboxes anchecken — sowohl
    // Base-UI Components ([data-slot="checkbox"]) als auch Standard
    // HTML-Checkboxes (input[type="checkbox"]).
    const baseuiCbs = page.locator('[data-slot="checkbox"]:not([data-state="checked"])')
    const baseuiN = await baseuiCbs.count()
    for (let i = 0; i < baseuiN; i += 1) {
      const cb = baseuiCbs.nth(i)
      if (await cb.isVisible().catch(() => false)) {
        await cb.click({ force: true }).catch(() => {})
        await page.waitForTimeout(200)
      }
    }
    const htmlCbs = page.locator('input[type="checkbox"]:not(:checked)')
    const htmlN = await htmlCbs.count()
    for (let i = 0; i < htmlN; i += 1) {
      const cb = htmlCbs.nth(i)
      if (await cb.isVisible().catch(() => false)) {
        await cb.click({ force: true }).catch(() => {})
        await page.waitForTimeout(200)
      }
    }

    // Signatur-Pad falls sichtbar
    const signed = await paintCanvas(page)
    if (signed) {
      await page.waitForTimeout(400)
      await shot(page, `07-flow-step-${String(step + 1).padStart(2, '0')}-signed`)
    }

    // Weiter-Button (umfassend: SA unterzeichnen, beauftragen, weiter, …)
    const nextBtn = page
      .getByRole('button', {
        name: /weiter|jetzt absenden|beauftragen|konto erstellen|account erstellen|fortfahren|annehmen|sa unterzeichnen|unterzeichnen|absenden/i,
      })
      .filter({ hasNot: page.locator('[disabled]') })
      .first()
    const visible = await nextBtn.isVisible().catch(() => false)
    if (!visible) {
      console.log(`[STOPPER] Step ${step + 1}: kein aktiver Weiter-Button`)
      await shot(page, `08-STOPPER-step-${String(step + 1).padStart(2, '0')}-no-weiter`)
      break
    }

    const beforeUrl = page.url()
    const btnText = (await nextBtn.textContent())?.trim() ?? ''
    console.log(`[FLOW] Step ${step + 1} klicke "${btnText}"`)
    await nextBtn.scrollIntoViewIfNeeded().catch(() => {})
    await nextBtn.click().catch((e) => console.log(`[FLOW] click fail: ${e.message}`))
    // Gap-3-Fix: SA-Submit + Account-Anlage brauchen 5-8s server-side
    // (uploadFlowSignatur + signSAandCreateFall + createKundeAccount).
    const longWait = /unterzeichnen|absenden|account/i.test(btnText)
    await page.waitForTimeout(longWait ? 10_000 : 2_500)

    if (page.url().includes('/kunde')) {
      console.log(`[FLOW] /kunde erreicht nach step ${step + 1}`)
      await shot(page, '09-kunde-erreicht')
      break
    }
    if (page.url() === beforeUrl) {
      console.log(`[FLOW] Step ${step + 1}: URL stabil — vermutlich Form-Step`)
    } else {
      console.log(`[FLOW] ${beforeUrl} → ${page.url()}`)
    }
  }

  // ═══ PHASE 6: /kunde Onboarding ═══════════════════════════════════
  await page.waitForTimeout(1_500)
  if (!page.url().includes('/kunde')) {
    console.log('[STOPPER] /kunde nicht erreicht — Magic-Link-Strecke unvollstaendig')
    await shot(page, '10-STOPPER-vor-kunde')
    return
  }
  await shot(page, '11-kunde-landung')

  if (page.url().includes('/onboarding')) {
    for (let s = 0; s < 8; s += 1) {
      await page.waitForTimeout(1_500)
      await shot(page, `12-onboarding-step-${String(s + 1).padStart(2, '0')}`)

      const next = page
        .getByRole('button', {
          name: /weiter|fertig|abschliessen|absenden|los geht|jetzt buchen|termin/i,
        })
        .filter({ hasNot: page.locator('[disabled]') })
        .first()
      if (!(await next.isVisible().catch(() => false))) {
        console.log(`[ONBOARDING] step ${s + 1} kein Weiter`)
        await shot(page, `13-STOPPER-onboarding-step-${String(s + 1).padStart(2, '0')}`)
        break
      }
      await next.scrollIntoViewIfNeeded().catch(() => {})
      await next.click().catch(() => {})
      await page.waitForTimeout(1_500)
      if (page.url().includes('/faelle/') || !page.url().includes('/onboarding')) {
        console.log('[ONBOARDING] verlassen')
        break
      }
    }
  }

  await shot(page, '14-nach-onboarding')

  // ═══ PHASE 7: Fallakte ═══════════════════════════════════════════════
  await page.goto('/kunde').catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '15-kunde-portal-final')

  console.log('[FINAL] URL:', page.url())
})
