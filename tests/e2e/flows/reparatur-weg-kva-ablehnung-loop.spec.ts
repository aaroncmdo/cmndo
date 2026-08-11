// Regressions-Test (operatives Soll, Unhappy-Path): der KVA-Ablehnung-Loop SCHLIESST sich.
// Kunde lehnt KVA ab → Werkstatt sieht "abgelehnt" (kvaStatus='abgelehnt', via kva_abgelehnt_am
// in v_werkstatt_auftrag) + reicht einen NEUEN KVA ein → Kunde gibt frei. Vorher (Gap 27.07.):
// die Werkstatt sah "wartet auf Freigabe" + hatte keinen Re-Upload-Button → stiller Deadlock.
// Ausgangszustand aus scripts/smoke/reparatur-weg-e2e-seed.mjs.
//
// Run: CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test reparatur-weg-kva-ablehnung-loop --project=chromium
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { join } from 'node:path'
import { ladeSeedFixture } from '../lib/seed-fixture'

// Seed crash-sicher laden (Begruendung + skip-vs-fail-Regel: tests/e2e/lib/seed-fixture.ts).
// ciErzeugt: der e2e-Job legt die Datei im Step "Seed reparatur-weg E2E-Fixture" an.
const fixture = ladeSeedFixture(
  '.reparatur-weg-e2e-seed.json',
  'scripts/smoke/reparatur-weg-e2e-seed.mjs',
  { ciErzeugt: true },
)
const seed = fixture.daten
test.beforeEach(() => fixture.guard())
const PDF = join(process.cwd(), 'tests/e2e/fixtures/test-upload.pdf')

async function login(page: Page, email: string, pw: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

async function ladeKva(ws: Page, betrag: number) {
  await ws.getByRole('button', { name: 'Kostenvoranschlag hochladen' }).click()
  const dialog = ws.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await ws.locator('#auftrag-kva-datei').setInputFiles(PDF)
  await expect(ws.getByText('KVA wird ausgelesen')).toBeHidden({ timeout: 40_000 })
  await ws.locator('input[name="auftrag-kva-brutto"]').fill(String(betrag))
  await ws.locator('#auftrag-kva-termin').fill('2026-09-15T10:00')
  await dialog.getByRole('button', { name: 'Speichern' }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

test('KVA-Ablehnung-Loop: Kunde lehnt ab → Werkstatt neu → Kunde gibt frei', async ({ browser }) => {
  test.setTimeout(200_000)
  let wsCtx: BrowserContext | undefined
  let kdCtx: BrowserContext | undefined
  try {
    wsCtx = await browser.newContext()
    kdCtx = await browser.newContext()
    const ws = await wsCtx.newPage()
    const kd = await kdCtx.newPage()
    await login(ws, seed.werkstattEmail, seed.werkstattPw)
    await login(kd, seed.kundeEmail, seed.kundePw)

    await test.step('1) Werkstatt lädt ersten KVA hoch (2500)', async () => {
      await ws.goto(`/werkstatt/auftraege/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      await ladeKva(ws, 2500)
    })

    await test.step('2) Kunde lehnt den KVA ab', async () => {
      await kd.goto(`/kunde/faelle/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      const ablehnen = kd.getByRole('button', { name: 'Kostenvoranschlag ablehnen' })
      await expect(ablehnen).toBeVisible({ timeout: 45_000 })
      await ablehnen.scrollIntoViewIfNeeded()
      await ablehnen.click()
      await kd.getByPlaceholder(/Grund/).fill('SMOKE: zu teuer, bitte Zweitmeinung')
      await kd.getByRole('button', { name: 'Ablehnung senden' }).click()
      await expect(kd.locator('[data-sonner-toast]').filter({ hasText: 'abgelehnt' }))
        .toBeVisible({ timeout: 20_000 })
    })

    await test.step('3) Werkstatt sieht "abgelehnt" + reicht einen NEUEN KVA ein', async () => {
      await ws.reload({ waitUntil: 'domcontentloaded' })
      // FIX: Werkstatt sieht den abgelehnt-State (nicht mehr fälschlich "wartet auf Freigabe")
      await expect(ws.getByText(/Kunde hat den Kostenvoranschlag abgelehnt|Vom Kunden abgelehnt/i).first())
        .toBeVisible({ timeout: 20_000 })
      // FIX: Re-Upload-Button da (ladeKva matcht "…Kostenvoranschlag hochladen" per Substring)
      await ladeKva(ws, 2000)
    })

    await test.step('4) Kunde sieht den neuen KVA + kann freigeben — Loop geschlossen', async () => {
      await kd.goto(`/kunde/faelle/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      await expect(kd.getByRole('button', { name: 'Reparaturauftrag erteilen' }))
        .toBeVisible({ timeout: 30_000 })
    })
  } finally {
    await wsCtx?.close()
    await kdCtx?.close()
  }
})
