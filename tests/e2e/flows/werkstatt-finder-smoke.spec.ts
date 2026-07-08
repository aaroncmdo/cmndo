import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Werkstatt-Finder Prod-Smoke (Aaron 08.07. "alle Szenarien von vorne bis hinten, mit Test-SVs
// + einer Test-Werkstatt"). Fährt gegen PROD (PLAYWRIGHT_BASE_URL) mit den vom Seed-Script
// (scripts/smoke/werkstatt-finder-seed.mjs) angelegten isolierten Testdaten.
//
// SICHERHEIT (nicht verhandelbar): Es wird AUSSCHLIESSLICH die Karte "SMOKE Werkstatt (Test)"
// angeklickt. Nie eine echte Werkstatt -> assignReparaturWerkstatt/notify trifft nur
// werkstatt-smoke@claimondo.de (intern) + den Smoke-Kunden (telefon=NULL -> kein WhatsApp).
//
// Lauf:  CI=1 RUN_WF_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//        npx playwright test werkstatt-finder-smoke --project=chromium --reporter=line

// SEED erzeugt das Seed-Script (--> .werkstatt-finder-seed.json, nicht committet). Fehlt die Datei
// (z.B. in CI, wo dieser opt-in-Smoke via RUN_WF_SMOKE ohnehin skippt), NICHT beim Collect werfen.
const SEED_PATH = path.resolve(__dirname, '../../../scripts/smoke/.werkstatt-finder-seed.json')
const SEED: Record<string, string> = existsSync(SEED_PATH)
  ? JSON.parse(readFileSync(SEED_PATH, 'utf8'))
  : {}
const SMOKE_WERKSTATT_NAME = 'SMOKE Werkstatt (Test)'
const WERKSTATT_LOGIN = { email: 'werkstatt-smoke@claimondo.de', pw: 'SmokeWerkstatt-2026!' }

// --- service-role DB-Client zum Verifizieren (env aus .env.local) ---
function db() {
  const raw = readFileSync(path.resolve(__dirname, '../../../.env.local'), 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const l = line.replace(/\r$/, '')
    if (!l.includes('=') || l.trimStart().startsWith('#')) continue
    const i = l.indexOf('=')
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function login(page: Page, email: string, pw: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

/** Klickt den "Auswählen"-Button GENAU in der Smoke-Werkstatt-Karte (nie eine echte). */
async function clickSmokeWerkstatt(page: Page) {
  const item = page.getByRole('listitem').filter({ hasText: SMOKE_WERKSTATT_NAME }).first()
  await expect(item, 'Smoke-Werkstatt-Karte muss im Finder erscheinen').toBeVisible({ timeout: 15_000 })
  const btn = item.getByRole('button', { name: /Auswählen|Wählen|Beauftragen/i }).first()
  await expect(btn, '"Auswählen"-Button der Smoke-Werkstatt').toBeVisible({ timeout: 5_000 })
  await btn.click()
}

test.beforeAll(() => {
  test.skip(!process.env.RUN_WF_SMOKE, 'set RUN_WF_SMOKE=1 to run this prod smoke')
})

// ---------------------------------------------------------------------------
// Szenario 1 — Kunde-Fallakte (fiktive Abrechnung): Finder MUSS erscheinen (#3922-Fix)
// ---------------------------------------------------------------------------
test('1) Kunde-Fallakte fiktiv: Werkstatt-Finder sichtbar + Auswahl der Smoke-Werkstatt', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, SEED.kundeEmail, SEED.kundePw)
  console.log('[fallakte] nach Login gelandet:', page.url())

  await page.goto(SEED.fallakteUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  console.log('[fallakte] Fallakte-URL:', page.url())
  await page.screenshot({ path: 'test-results/wf-fallakte-1-before.png', fullPage: true }).catch(() => {})

  // Der Finder muss erscheinen (fiktiv-Gate). Wir belegen: Smoke-Werkstatt ist wählbar.
  await clickSmokeWerkstatt(page)
  await page.waitForTimeout(2500) // assign + revalidate
  await page.screenshot({ path: 'test-results/wf-fallakte-2-after.png', fullPage: true }).catch(() => {})

  // DB-Verify: Claim traegt jetzt die Smoke-Werkstatt.
  const { data } = await db().from('claims').select('reparatur_werkstatt_id, werkstatt_id').eq('id', SEED.claimId).single()
  console.log('[fallakte] claim nach Auswahl:', JSON.stringify(data))
  const zugewiesen = data?.reparatur_werkstatt_id ?? data?.werkstatt_id
  expect(zugewiesen, 'Claim muss der Smoke-Werkstatt zugewiesen sein').toBe(SEED.smokeWerkstattId)
})

// ---------------------------------------------------------------------------
// Szenario 2 — Flow Self-Service (/flow/[token]): Werkstatt-Step im Wizard
// ---------------------------------------------------------------------------
test('2) Flow Self-Service: Werkstatt-Step erreichbar + Auswahl (oder Flag-Befund)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(SEED.flowUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  console.log('[flow] geöffnet:', page.url())

  // Wizard vorwärts navigieren, bis der Werkstatt-Step erscheint (oder wir hängenbleiben).
  // 'Unfallgegner' zuerst: der Schuld-Step ("Wer hat den Unfall verursacht?") hat KEIN "Weiter",
  // sondern Auswahl-Buttons -> unverschuldet (Gegner) = Standard-Haftpflicht-Pfad, Werkstatt-Step bleibt.
  const FORWARD = ['Unfallgegner', 'Weiter', 'Los geht', 'Fortfahren', 'Verstanden', 'Bestätigen', 'Zur Werkstatt', 'Überspringen']
  let reached = false
  for (let i = 0; i < 14; i++) {
    const headings = await page.locator('h1, h2, h3').allInnerTexts().catch(() => [])
    const buttons = await page.getByRole('button').allInnerTexts().catch(() => [])
    console.log(`[flow] step ${i}: headings=${JSON.stringify(headings)} buttons=${JSON.stringify(buttons)}`)
    const smokeVisible = await page.getByText(SMOKE_WERKSTATT_NAME, { exact: false }).first().isVisible().catch(() => false)
    const werkstattHeading = headings.some((h) => /Wähle deine Werkstatt|Partner-Werkstätten|Werkstatt finden/i.test(h))
    if (smokeVisible || werkstattHeading) { reached = true; break }

    // Pflicht-Checkboxen (z.B. Datenschutz-Zustimmung) ankreuzen — sonst blockt "Weiter" stumm.
    const boxes = page.getByRole('checkbox')
    for (let b = 0; b < (await boxes.count().catch(() => 0)); b++) {
      const box = boxes.nth(b)
      if ((await box.isVisible().catch(() => false)) && !(await box.isChecked().catch(() => true))) {
        await box.check().catch(() => box.click().catch(() => {}))
      }
    }
    // Leere Pflicht-Textareas (Schadensbeschreibung/Unfallhergang) füllen.
    const areas = page.locator('textarea')
    for (let a = 0; a < (await areas.count().catch(() => 0)); a++) {
      const ta = areas.nth(a)
      if ((await ta.isVisible().catch(() => false)) && !(await ta.inputValue().catch(() => 'x'))) {
        await ta.fill('Auffahrunfall — Smoke-Test, bitte ignorieren.').catch(() => {})
      }
    }
    // nächsten Vorwärts-Button klicken (NICHT Überspringen, wenn wir schon am Werkstatt-Step wären — oben geprüft)
    let clicked = false
    for (const label of FORWARD) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first()
      if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
        await btn.click().catch(() => {})
        await page.waitForTimeout(1200)
        clicked = true
        break
      }
    }
    if (!clicked) { console.log('[flow] kein Vorwärts-Button mehr — Stop.'); break }
  }
  await page.screenshot({ path: 'test-results/wf-flow-step.png', fullPage: true }).catch(() => {})

  if (!reached) {
    console.log('[flow] BEFUND: Werkstatt-Step NICHT erreicht — wahrscheinlich CANONICAL_FLOWLINK_ENABLED!=true auf Prod ODER blockierender Vorstep.')
  }
  expect(reached, 'Werkstatt-Step im Flow erreichbar (sonst Flag-Befund, s. Log)').toBeTruthy()

  await clickSmokeWerkstatt(page)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'test-results/wf-flow-after.png', fullPage: true }).catch(() => {})

  const { data } = await db().from('leads').select('reparatur_werkstatt_id, werkstatt_id').eq('id', SEED.leadId).single()
  console.log('[flow] lead nach Auswahl:', JSON.stringify(data))
  const zugewiesen = data?.reparatur_werkstatt_id ?? data?.werkstatt_id
  expect(zugewiesen, 'Lead muss der Smoke-Werkstatt zugewiesen sein').toBe(SEED.smokeWerkstattId)
})

// ---------------------------------------------------------------------------
// Szenario 3 — Werkstatt-Seite: der zugewiesene Auftrag erscheint im Werkstatt-Portal
// ---------------------------------------------------------------------------
test('3) Werkstatt-Portal: neuer Auftrag sichtbar', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, WERKSTATT_LOGIN.email, WERKSTATT_LOGIN.pw)
  console.log('[werkstatt] nach Login:', page.url())
  await page.goto('/werkstatt/auftraege', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: 'test-results/wf-werkstatt-auftraege.png', fullPage: true }).catch(() => {})
  const body = await page.locator('body').innerText().catch(() => '')
  console.log('[werkstatt] auftraege-Seite (Auszug):', body.slice(0, 600))
  // Loses Assert: die Seite rendert + zeigt mindestens einen Auftrag/Bezug (Köln / Smoke / Reparatur).
  expect(/Köln|Smoke|Reparatur|Auftrag|Fiktiv|fiktiv/i.test(body), 'Auftrags-Bezug auf der Werkstatt-Seite').toBeTruthy()
})
