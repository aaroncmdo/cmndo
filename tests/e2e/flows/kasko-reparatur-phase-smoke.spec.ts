// Fundament J5 (Kasko/Selbstzahler-Reparatur-Phase) Journey-Smoke — READ-only gegen PROD.
// Soll (Journey j05): die interne Fallakte eines Kasko-Claims mit GESETZTER Werkstatt zeigt die
// Reparatur-Lane (subPhase reparatur_terminfindung -> interner Stepper "Terminfindung"), NICHT den
// Lead-Fallback "SA-Unterschrift offen" (der #4471-Fix). Ausgangszustand: bei jedem Lauf frisch
// geseedet via scripts/smoke/kasko-reparatur-seed.mjs — ersetzt den frueher fest verdrahteten
// prod-Claim 39734007, der zustandsgedriftet ist (werkstatt_id inzwischen NULL).
//
// Login: loginContextOrSkip('admin') (aal2 via TEST_ADMIN_TOTP_SECRET falls der Account einen
// TOTP-Faktor traegt; sonst aal1). skipIfAuthWall degradiert graceful an einer 2FA-Wand.
//
// Run: CI=1 RUN_KASKO_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//      npx playwright test kasko-reparatur-phase-smoke --project=chromium --reporter=line
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loginContextOrSkip, skipIfAuthWall } from './_golden-path-lib'

// Seed schreibt scripts/smoke/.kasko-reparatur-seed.json (nicht committet). Fehlt sie beim Collect
// (z.B. CI ohne Seed-Step, wo RUN_KASKO_SMOKE ohnehin skippt), NICHT werfen.
const SEED_PATH = join(process.cwd(), 'scripts/smoke/.kasko-reparatur-seed.json')
const SEED: Record<string, string> = existsSync(SEED_PATH)
  ? JSON.parse(readFileSync(SEED_PATH, 'utf8'))
  : {}

test.beforeAll(() => {
  test.skip(!process.env.RUN_KASKO_SMOKE, 'set RUN_KASKO_SMOKE=1 to run this prod smoke')
})

test('Kasko-Fallakte zeigt Reparatur-Lane statt "SA-Unterschrift offen"', async ({ browser }) => {
  test.setTimeout(90_000)
  test.skip(!SEED.claimId, 'kasko-reparatur-seed fehlt — erst: node scripts/smoke/kasko-reparatur-seed.mjs')
  const ctx = await loginContextOrSkip(browser, 'admin')
  try {
    const page = await ctx.newPage()
    await page.goto(`/faelle/${SEED.claimId}`, { waitUntil: 'domcontentloaded' })
    skipIfAuthWall(page) // interne 2FA-Wand -> skip statt fail (aal1 ohne TOTP-Secret)
    await page.waitForLoadState('networkidle').catch(() => {})
    const body = page.locator('body')
    // Kern-Assertion: Reparatur-Lane (Kasko + Werkstatt gesetzt) statt Lead-Fallback.
    await expect(body).not.toContainText(/SA-Unterschrift offen/i)
    // Reparatur-Lane-Indikator: interner Stepper "Terminfindung"/"Werkstattwahl" ODER loses "Reparatur".
    await expect(body).toContainText(/Terminfindung|Werkstattwahl|Reparatur/i)
  } finally {
    await ctx.close()
  }
})
