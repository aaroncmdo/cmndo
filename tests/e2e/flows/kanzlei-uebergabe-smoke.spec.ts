// Fundament J6 (Kanzlei-Übergabe) Journey-Smoke — gegen PROD, externer Wegwerf-Kunde-Login.
// Soll (Journey j06): der Kunde übergibt seinen Fall an die eigene Kanzlei ("Kanzleipaket versenden")
// → versendeKanzleiPaketAnEigeneKanzlei schreibt claims.operative_status='an_externe_kanzlei_uebergeben'
// + kanzlei_uebergeben_am. Ausgangszustand: scripts/smoke/kanzlei-uebergabe-seed.mjs (deterministisch,
// self-cleaning). Externer Kunde @claimondo.test/telefon=NULL → kein Auth-Wall, kein Comms-Kollateral.
//
// Lauf: CI=1 RUN_KANZLEI_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//       npx playwright test kanzlei-uebergabe-smoke --project=chromium --reporter=line
import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SEED_PATH = path.resolve(__dirname, '../../../scripts/smoke/.kanzlei-uebergabe-seed.json')
const SEED: Record<string, string> = existsSync(SEED_PATH) ? JSON.parse(readFileSync(SEED_PATH, 'utf8')) : {}

// --- service-role DB-Client zum Verifizieren (env process.env-first — CI hat kein .env.local) ---
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (process.env)')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function login(page: Page, email: string, pw: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test.beforeAll(() => {
  test.skip(!process.env.RUN_KANZLEI_SMOKE, 'set RUN_KANZLEI_SMOKE=1 to run this prod smoke')
  test.skip(!SEED.claimId, 'kanzlei-uebergabe-seed fehlt — erst: node scripts/smoke/kanzlei-uebergabe-seed.mjs')
})

test('Kanzlei-Übergabe: Kunde versendet Kanzleipaket → an_externe_kanzlei_uebergeben', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, SEED.kundeEmail, SEED.kundePw)
  await page.goto(SEED.fallakteUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: 'test-results/kanzlei-before.png', fullPage: true }).catch(() => {})

  // "Kanzleipaket versenden" (EigeneKanzleiPaketCard) — rendert nur im übergabe-bereiten Zustand
  // (eigene_kanzlei + Ansprechpartner-Mail + freigegebenes Erstgutachten + kanzlei_uebergeben_am NULL).
  const sendBtn = page.getByRole('button', { name: /Kanzleipaket versenden/i })
  await expect(sendBtn, '"Kanzleipaket versenden"-Button').toBeVisible({ timeout: 20_000 })
  await sendBtn.scrollIntoViewIfNeeded()
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 })
  await sendBtn.click()

  // DB-Verify (SSoT): der Klick startet versendeKanzleiPaketAnEigeneKanzlei (generiert das Kanzleipaket-PDF
  // + mailt → der Button steht solange auf "Wird versendet…"). Poll den Terminal-Write, statt fix zu warten.
  await expect(async () => {
    const { data } = await db().from('claims').select('operative_status, kanzlei_uebergeben_am').eq('id', SEED.claimId).maybeSingle()
    expect(data?.operative_status, 'Claim muss an externe Kanzlei übergeben sein').toBe('an_externe_kanzlei_uebergeben')
    expect(data?.kanzlei_uebergeben_am, 'kanzlei_uebergeben_am muss gesetzt sein').not.toBeNull()
  }).toPass({ timeout: 45_000 })
  await page.screenshot({ path: 'test-results/kanzlei-after.png', fullPage: true }).catch(() => {})
})
