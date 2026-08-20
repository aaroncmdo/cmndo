import { test, expect, type Page } from '@playwright/test'

// Termine-Hub Smoke — Phase 1 (Kunde) + Phase 2 (Flotte).
// Deckt den Regel-4-Smoke-Plan aus PR #4584 + #4589 ab.
//
// Run (prod, Regel-4):
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//   KUNDE_EMAIL=test-kunde@claimondo.de KUNDE_PASS=... \
//   FLOTTE_EMAIL=... FLOTTE_PASS=... \
//   npx playwright test tests/e2e/flows/termine-hub-smoke.spec.ts --project=chromium --reporter=list
// Run (staging): zusaetzlich STAGING_BASIC=1 STAGING_BASIC_PASS=... und PLAYWRIGHT_BASE_URL=https://app.staging.claimondo.de
//
// ✅ SEED STEHT (19.07., prod, via Gegner-Flow angelegt): Test-Flotte GmbH (Smoke) /
//   flotte.test@claimondo.de hat Fahrzeug B-FL 101 + Claim CLM-2026-00935 + Termin am
//   27.07.2026 10:00 (kb_beratung, bestaetigt) -> /flotte/termine zeigt eine "Beratung"-Zeile
//   im Kommend-Block. FLOTTE_PASS kommt aus env (Passwort im Coordination-Marker, nicht im Repo).
// ⚠ nachbesichtigung_mit_datum = 0 -> der Nachbesichtigung-Badge bleibt vorerst nicht daten-testbar.
//   Der 403-Guard-Negativtest braucht ein FOREIGN_TERMIN_ID (Termin, der NICHT zur Flotten-Firma gehoert).
// ⚠ Erstlauf gegen STAGING fahren — die Selektoren sind aus dem Komponenten-Markup abgeleitet, aber
//   ungetestet gegen die Live-App; Screenshots pruefen, dann prod.

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const BASIC_AUTH = process.env.STAGING_BASIC
  ? { username: 'aaroncmdo', password: process.env.STAGING_BASIC_PASS ?? '' }
  : undefined

// `test-kunde@` gibt es seit dem Golive-Accounts-Cleanup nicht mehr — Konto s.
// tests/e2e/flows/_golden-path-lib.ts (ROLES). Der leere Passwort-Default bleibt Absicht:
// er haelt den Test opt-in (die Selektoren sind laut Header noch ungeprueft, s. o.).
const KUNDE = { email: process.env.KUNDE_EMAIL ?? 'smoke-kunde@claimondo.de', pass: process.env.KUNDE_PASS ?? '' }
const FLOTTE = { email: process.env.FLOTTE_EMAIL ?? 'flotte.test@claimondo.de', pass: process.env.FLOTTE_PASS ?? '' }

// Labels aus src/lib/termine/termin-typ.ts (i18n kunde.termine.typ.*) — de.
const TYP_BADGES = /Besichtigung|Nachbesichtigung|Reparatur|Beratung|Konfrontation/

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForURL((u: URL) => !u.pathname.includes('/login'), { timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
  return errors
}

test.describe('Termine-Hub Smoke', () => {
  test('Kunde: /kunde/termine — Timeline, Typ-Badges, Liste/Kalender-Toggle', async ({ browser }) => {
    test.skip(!KUNDE.pass, 'KUNDE_PASS nicht gesetzt')
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, httpCredentials: BASIC_AUTH })
    const page = await ctx.newPage()
    const errors = trackErrors(page)

    await login(page, KUNDE.email, KUNDE.pass)
    await page.goto(`${BASE}/kunde/termine`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2000)

    // Seite rendert echten Content (keine leere Redirect-Stub-Shell).
    await expect(page.getByText('Meine Termine').first()).toBeVisible({ timeout: 15_000 })

    // Toggle vorhanden + funktioniert (Kalender <-> Liste).
    const kalender = page.getByRole('button', { name: 'Kalender' }).first()
    await expect(kalender).toBeVisible()
    await kalender.click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Liste' }).first().click()
    await page.waitForTimeout(500)

    // Typ-Badges, falls Termine existieren; sonst legitimer Empty-State.
    const badges = await page.getByText(TYP_BADGES).count()
    console.log(`[Kunde] Typ-Badges sichtbar: ${badges}`)
    if (badges > 0) {
      const detail = page.getByText('Details öffnen').first()
      if ((await detail.count()) > 0) {
        await detail.click()
        await page.waitForLoadState('networkidle').catch(() => {})
        expect(page.url()).toMatch(/\/kunde\/(termine|faelle)\//)
      }
    } else {
      console.log('[Kunde] keine Termine -> Empty-State (ok)')
    }

    expect(errors, `Console/Page-Errors:\n${errors.join('\n')}`).toEqual([])
    await ctx.close()
  })

  test('Flotte: Nav-Eintrag + /flotte/termine rendert', async ({ browser }) => {
    test.skip(!FLOTTE.email || !FLOTTE.pass, 'FLOTTE_EMAIL/PASS nicht gesetzt (Flottenmanager-Konto provisionieren)')
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, httpCredentials: BASIC_AUTH })
    const page = await ctx.newPage()
    const errors = trackErrors(page)

    await login(page, FLOTTE.email, FLOTTE.pass)

    // Nav-Eintrag "Termine" im Flotten-Portal.
    await page.goto(`${BASE}/flotte/flotte`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByRole('link', { name: 'Termine' })).toBeVisible({ timeout: 15_000 })

    // /flotte/termine rendert (Timeline ODER Empty-State — prod-Flotte hat evtl. 0 Claims).
    await page.goto(`${BASE}/flotte/termine`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2000)
    await expect(page.getByText('Flotten-Termine').first()).toBeVisible({ timeout: 15_000 })
    console.log(`[Flotte] Typ-Badges sichtbar: ${await page.getByText(TYP_BADGES).count()} (0 ok bei Flotte ohne Claims)`)

    expect(errors, `Console/Page-Errors:\n${errors.join('\n')}`).toEqual([])
    await ctx.close()
  })

  test('Flotte: 403 auf fremden Termin (Owner-Guard-Negativtest)', async ({ browser }) => {
    const foreign = process.env.FOREIGN_TERMIN_ID
    test.skip(!FLOTTE.email || !FLOTTE.pass || !foreign, 'FLOTTE creds + FOREIGN_TERMIN_ID noetig')
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ httpCredentials: BASIC_AUTH })
    const page = await ctx.newPage()
    await login(page, FLOTTE.email, FLOTTE.pass)
    // page.request teilt die Auth-Cookies des Kontexts.
    const res = await page.request.post(`${BASE}/api/kunde/termin/verschieben`, {
      data: { termin_id: foreign },
    })
    console.log(`[Flotte-Negativ] Status: ${res.status()} (erwartet 403)`)
    expect(res.status()).toBe(403)
    await ctx.close()
  })
})
