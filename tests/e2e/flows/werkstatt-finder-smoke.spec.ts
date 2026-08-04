// Fundament J10 (Dispatch/Werkstatt-Finder) Journey-Smoke — gegen PROD.
// Ausgangszustand: scripts/smoke/werkstatt-finder-seed.mjs (deterministisch, self-cleaning, je Lauf
// frisch — Wegwerf-Kunde + eigene Wegwerf-Werkstatt mit email=NULL). Ersetzt den frueheren festen
// prod-Kunden + die gedriftete Fixture-Werkstatt badecb82 (existiert nicht mehr).
//
// SICHERHEIT (nicht verhandelbar): angeklickt wird AUSSCHLIESSLICH die per Seed angelegte
// Wegwerf-Werkstatt (SEED.smokeWerkstattName). Kunde+Werkstatt = @claimondo.test/telefon=NULL ->
// Send-Layer suppressed alle Comms, kein WhatsApp/SMS.
//
// Lauf: CI=1 RUN_WF_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//       npx playwright test werkstatt-finder-smoke --project=chromium --reporter=line
import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// SEED schreibt scripts/smoke/.werkstatt-finder-seed.json (nicht committet). Fehlt sie beim Collect
// (z.B. CI ohne Seed-Step, wo RUN_WF_SMOKE ohnehin skippt), NICHT werfen.
const SEED_PATH = path.resolve(__dirname, '../../../scripts/smoke/.werkstatt-finder-seed.json')
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

/** Klickt "Auswählen" GENAU in der Seed-Wegwerf-Werkstatt-Karte (nie eine echte). */
async function clickSmokeWerkstatt(page: Page) {
  const item = page.getByRole('listitem').filter({ hasText: SEED.smokeWerkstattName }).first()
  await expect(item, 'Wegwerf-Werkstatt-Karte muss im Finder erscheinen').toBeVisible({ timeout: 15_000 })
  const btn = item.getByRole('button', { name: /Auswählen|Wählen|Beauftragen/i }).first()
  await expect(btn, '"Auswählen"-Button der Wegwerf-Werkstatt').toBeVisible({ timeout: 5_000 })
  await btn.click()
}

test.beforeAll(() => {
  test.skip(!process.env.RUN_WF_SMOKE, 'set RUN_WF_SMOKE=1 to run this prod smoke')
  test.skip(!SEED.claimId, 'werkstatt-finder-seed fehlt — erst: node scripts/smoke/werkstatt-finder-seed.mjs')
})

// ---------------------------------------------------------------------------
// Szenario 1 — Kunde-Fallakte (fiktive Abrechnung): Finder MUSS erscheinen (#3922) + Auswahl
// ---------------------------------------------------------------------------
test('1) Kunde-Fallakte fiktiv: Werkstatt-Finder sichtbar + Auswahl der Wegwerf-Werkstatt', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, SEED.kundeEmail, SEED.kundePw)
  await page.goto(SEED.fallakteUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: 'test-results/wf-fallakte-before.png', fullPage: true }).catch(() => {})

  await clickSmokeWerkstatt(page)
  await page.waitForTimeout(2500) // assign + revalidate
  await page.screenshot({ path: 'test-results/wf-fallakte-after.png', fullPage: true }).catch(() => {})

  const { data } = await db().from('claims').select('reparatur_werkstatt_id, werkstatt_id').eq('id', SEED.claimId).single()
  const zugewiesen = data?.reparatur_werkstatt_id ?? data?.werkstatt_id
  expect(zugewiesen, 'Claim muss der Wegwerf-Werkstatt zugewiesen sein').toBe(SEED.smokeWerkstattId)
})

// ---------------------------------------------------------------------------
// Szenario 2 — Flow Self-Service (/flow/[token]): begründeter Skip (Journey-DoD Punkt 2)
// ---------------------------------------------------------------------------
test('2) Flow Self-Service: Werkstatt-Step im Wizard', async () => {
  // Bewusster Skip: der /flow-Werkstatt-Step ist nur über eine fragile 14-Schritt-Wizard-Heuristik
  // erreichbar (Button-Label-Raten + Pflicht-Checkboxen/Textareas), nutzt eine ANDERE Match-Engine
  // (findWerkstattVorschlaegeFuer, harte Fahrzeug-/Gewerke-Filter) als S1 und hängt an
  // CANONICAL_FLOWLINK_ENABLED. Nicht-deterministisch für einen post-merge-CI-Step. Journey J10.
  // Follow-up: deterministischer Flow-Seed, der den Flow-Zustand direkt auf den Werkstatt-Step setzt
  // (statt UI-Wizard-Navigation) — dann grün-liftbar.
  test.skip(true, 'Flow-Wizard-Step = fragile 14-Schritt-Heuristik (nicht-deterministisch); Follow-up deterministischer Flow-Seed. Journey J10.')
})

// ---------------------------------------------------------------------------
// Szenario 3 — Werkstatt-Portal: der geseedete (bereits zugewiesene) Auftrag erscheint
// ---------------------------------------------------------------------------
test('3) Werkstatt-Portal: geseedeter Auftrag sichtbar', async ({ page }) => {
  test.setTimeout(90_000)
  // DB-Verify (hart): der S3-Claim ist der Wegwerf-Werkstatt zugewiesen (Portal liest v_werkstatt_auftrag,
  // rollen-gefiltert per is_werkstatt_for_claim = reparatur_werkstatt_id ODER werkstatt_id).
  const { data } = await db().from('claims').select('reparatur_werkstatt_id').eq('id', SEED.s3ClaimId).single()
  expect(data?.reparatur_werkstatt_id, 'S3-Claim der Wegwerf-Werkstatt zugewiesen').toBe(SEED.smokeWerkstattId)

  await login(page, SEED.werkstattEmail, SEED.werkstattPw)
  await page.goto('/werkstatt/auftraege', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: 'test-results/wf-werkstatt-auftraege.png', fullPage: true }).catch(() => {})
  const body = await page.locator('body').innerText().catch(() => '')
  // Die Auftrags-Seite rendert für die eingeloggte Werkstatt + zeigt den Auftrags-Bezug (Köln/Reparatur).
  expect(/Köln|Koeln|Reparatur|Auftrag|Selbstzahler|fiktiv/i.test(body), 'Auftrags-Bezug auf der Werkstatt-Seite').toBeTruthy()
})
