import { test, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-902 Vollstaendige Strecken-Smoke (14.05.2026):
// Start am Marketing-Auftritt, durch Karte, Mini-Wizard, Magic-Link,
// SA-Signatur, Account, Onboarding, Termin, bis Termin-Verlegung.
// Jeder Step bekommt einen Screenshot — wo es bricht, dokumentieren wir
// den Stopper. Realistisch durchklicken wie ein echter Nutzer.

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

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const TEST_EMAIL = `anna-smoke-${RUN_ID}@claimondo.de`
const TEST_TELEFON = '+49 221 1234567'
const TEST_VORNAME = 'Anna'
const TEST_PASSWORD = 'Smoke1234!'

let stepIdx = 400
async function shot(page: Page, name: string) {
  stepIdx += 1
  const filename = `${String(stepIdx).padStart(3, '0')}-${name}.png`
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: true,
  })
  console.log(`[SHOT] ${filename}`)
}

async function dismissCookieBanner(page: Page) {
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
}

async function paintCanvas(page: Page) {
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) {
    console.log('[STOPPER] kein canvas gefunden')
    return false
  }
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

test.describe.configure({ mode: 'serial' })

test('VOLLSTRECKE: Marketing → Mini-Wizard → SA → Onboarding → Termin verlegen', async ({ page, context }) => {
  test.setTimeout(360_000)

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (m) => {
    const t = m.type()
    if (t === 'error') console.log(`[BROWSER error] ${m.text()}`)
  })

  // ═══ PHASE 1: Marketing-Landing ════════════════════════════════════════
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissCookieBanner(page)
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '01-marketing-landing')

  // ═══ PHASE 2: Navigation zu /gutachter-finden ══════════════════════════
  // Auf der Landing gibt es einen CTA "Gutachter finden" oder wir gehen direkt.
  const gutachterCta = page.locator('a[href="/gutachter-finden"]').first()
  if (await gutachterCta.isVisible().catch(() => false)) {
    await gutachterCta.click()
  } else {
    await page.goto('/gutachter-finden')
  }
  await page.waitForLoadState('domcontentloaded')
  await dismissCookieBanner(page)
  await page.waitForTimeout(3_000)
  await shot(page, '02-karte-mini-wizard')

  // ═══ PHASE 3: Mini-Wizard ausfuellen ═══════════════════════════════════
  await page.locator('#vorname').first().fill(TEST_VORNAME)
  await page.locator('#unfallort').first().fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#telefon').first().fill(TEST_TELEFON)
  await page.locator('#email').first().fill(TEST_EMAIL)
  const dsgvo = page.locator('[data-slot="checkbox"]').first()
  await dsgvo.scrollIntoViewIfNeeded()
  await dsgvo.click()
  await shot(page, '03-wizard-ausgefuellt')

  await page
    .getByRole('button', { name: /login-link erhalten/i })
    .first()
    .click()
  await page.waitForURL(/\/schaden-melden\/prototyp\/link-versendet/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '04-bestaetigung-link-versendet')

  // ═══ PHASE 4: Token aus DB holen + Magic-Link-Klick simulieren ════════
  // Wir kennen die Email — der zuletzt erstellte Lead unter dieser Email
  // ist unserer. Statt Email zu lesen, fragen wir die DB direkt (das
  // simuliert den Nutzer der den Link aus seiner Mailbox klickt).
  // Retry-Loop fuer Token-Lookup — flow_link wird in der gleichen Server-
  // Action erstellt aber Email-Versand kann sich noch ziehen, also Polling.
  let token: string | null = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.waitForTimeout(1_500)
    const tokenLookup = await page.evaluate(async (email) => {
      const r = await fetch(`/api/dev/lookup-token?email=${encodeURIComponent(email)}`)
      const body = await r.json().catch(() => null)
      return { status: r.status, body }
    }, TEST_EMAIL)
    if (tokenLookup.status === 200 && tokenLookup.body?.token) {
      token = tokenLookup.body.token as string
      console.log(`[TOKEN-LOOKUP] hit at attempt ${attempt + 1}: ${token}`)
      break
    }
    console.log(
      `[TOKEN-LOOKUP] attempt ${attempt + 1}: status=${tokenLookup.status} body=${JSON.stringify(tokenLookup.body)}`,
    )
  }
  if (!token) {
    // Fallback: Smoke kennt keinen dev-route — wir setzen manuell via Test-Env
    console.log('[STOPPER] /api/dev/lookup-token nicht verfuegbar — Smoke kann Magic-Link nicht ohne Email-Reader klicken')
    await shot(page, '05-stopper-token-lookup')
    return
  }

  console.log(`[TOKEN] ${token}`)
  await page.goto(`/flow/${token}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '06-flow-token-landing')

  // ═══ PHASE 5: FlowWizardKfz durchklicken ═══════════════════════════════
  // 4 Steps: zusammenfassung → gutachter → sa → account.
  // An jedem Step die jeweils erforderlichen Checkboxes + Weiter-Button.
  for (let step = 0; step < 8; step += 1) {
    await page.waitForTimeout(1_000)
    await shot(page, `07-flow-step-${String(step + 1).padStart(2, '0')}`)

    // Alle Datenschutz / SA / SV-Akzeptanz Checkboxes anchecken
    const checkboxes = page.locator('[data-slot="checkbox"]:not([data-state="checked"])')
    const cbCount = await checkboxes.count()
    for (let i = 0; i < cbCount; i += 1) {
      const cb = checkboxes.nth(i)
      if (await cb.isVisible().catch(() => false)) {
        await cb.click().catch(() => {})
        await page.waitForTimeout(150)
      }
    }

    // Falls Canvas (SA-Pad) sichtbar: zeichnen
    const canvas = page.locator('canvas').first()
    if (await canvas.isVisible().catch(() => false)) {
      console.log(`[FLOW] Step ${step + 1}: canvas detected, signing`)
      await paintCanvas(page)
      await page.waitForTimeout(300)
      await shot(page, `07-flow-step-${String(step + 1).padStart(2, '0')}-signed`)
    }

    // Weiter-Button suchen
    const nextBtn = page
      .getByRole('button', {
        name: /weiter|jetzt absenden|absenden|beauftragen|annehmen|fortfahren|konto erstellen|account erstellen|jetzt bestaetigen/i,
      })
      .filter({ hasNot: page.locator('[disabled]') })
      .first()
    const visible = await nextBtn.isVisible().catch(() => false)
    if (!visible) {
      // Suche ohne disabled-Filter
      const anyBtn = page.getByRole('button', { name: /weiter|absenden|beauftragen/i }).first()
      const isDisabled = await anyBtn.getAttribute('disabled').catch(() => 'true')
      if (isDisabled !== null) {
        console.log(`[STOPPER] Step ${step + 1}: Weiter-Button disabled — break`)
        await shot(page, `07-flow-step-${String(step + 1).padStart(2, '0')}-stopper`)
        break
      }
    }

    const beforeUrl = page.url()
    await nextBtn.scrollIntoViewIfNeeded().catch(() => {})
    await nextBtn.click().catch((e) => console.log(`[FLOW] click fail: ${e.message}`))
    await page.waitForTimeout(2_500)

    if (page.url().includes('/kunde')) {
      console.log(`[FLOW] Auf /kunde gelandet (step ${step + 1})`)
      await shot(page, '08-kunde-landed')
      break
    }
    if (page.url() === beforeUrl) {
      console.log(`[FLOW] URL stabil ${page.url()} — vermutlich Form-Step`)
    } else {
      console.log(`[FLOW] ${beforeUrl} → ${page.url()}`)
    }
  }

  // ═══ PHASE 6: /kunde Onboarding ═══════════════════════════════════════
  await page.waitForTimeout(1_500)
  if (!page.url().includes('/kunde')) {
    console.log('[STOPPER] Wir sind nicht auf /kunde — Magic-Link-Strecke unvollstaendig')
    await shot(page, '09-stopper-vor-kunde')
    return
  }

  await shot(page, '10-kunde-landung')

  // Wenn /kunde/onboarding redirected hat, durchklicken
  if (page.url().includes('/onboarding')) {
    for (let step = 0; step < 10; step += 1) {
      await page.waitForTimeout(1_500)
      await shot(page, `11-onboarding-step-${String(step + 1).padStart(2, '0')}`)

      const next = page
        .getByRole('button', { name: /weiter|fertig|onboarding|abschliessen|absenden|naechst/i })
        .filter({ hasNot: page.locator('[disabled]') })
        .first()
      if (!(await next.isVisible().catch(() => false))) {
        console.log(`[ONBOARDING] step ${step + 1} kein Weiter`)
        break
      }
      await next.scrollIntoViewIfNeeded().catch(() => {})
      await next.click().catch(() => {})
      await page.waitForTimeout(1_500)
      if (page.url().includes('/faelle/') || !page.url().includes('/onboarding')) {
        console.log('[ONBOARDING] verlassen — fertig')
        break
      }
    }
  }

  await shot(page, '12-nach-onboarding')

  // ═══ PHASE 7: Fallakte + Termin verlegen ═══════════════════════════════
  // Wenn wir auf einer Faelle-Detail-Page sind, suche Termin-Verlegen-Action
  if (!page.url().includes('/faelle/')) {
    // Navigiere zur ersten Fallakte des Kunden-Portals
    await page.goto('/kunde')
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  await shot(page, '13-kunde-portal-mit-fall')

  // Versuchen, einen "Termin verlegen" / "Verlegen" Button zu finden
  const verlegenBtn = page
    .getByRole('button', { name: /termin verlegen|verlegen|umtermin/i })
    .or(page.getByRole('link', { name: /termin verlegen|verlegen|umtermin/i }))
    .first()

  if (await verlegenBtn.isVisible().catch(() => false)) {
    await verlegenBtn.click()
    await page.waitForTimeout(1_500)
    await shot(page, '14-termin-verlegen-drawer')
  } else {
    console.log('[STOPPER] Kein Termin-Verlegen-Button auf der Fallakte gefunden')
    await shot(page, '14-stopper-kein-termin-verlegen')
  }

  console.log(`[FINAL] URL: ${page.url()}, Email: ${TEST_EMAIL}`)
})
