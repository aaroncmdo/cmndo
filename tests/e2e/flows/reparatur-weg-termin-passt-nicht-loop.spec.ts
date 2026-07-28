// Regressions-Test (operatives Soll, Unhappy-Path): der Reparatur-Termin-"Passt nicht"-Loop SCHLIESST sich.
// Werkstatt schlägt Termin vor (via KVA) → Kunde "Passt nicht" + Rückruf-Wunschzeit → Werkstatt sieht
// "Kunde bittet um Rückruf" + schlägt einen NEUEN Termin vor → Kunde "Passt". Operatives Soll: der Fall
// hängt nicht, beide kommen zu einem Termin (kein Deadlock). Anders als die KVA-Loops ist dieser Loop
// bestehender Prod-Code — der Smoke BEWEIST, dass er end-to-end trägt (aktionOffen bei 'anruf_erbeten' +
// Rückruf-Hinweis + Neu-Vorschlag). Ausgangszustand aus scripts/smoke/reparatur-weg-e2e-seed.mjs.
//
// Run: CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test reparatur-weg-termin-passt-nicht-loop --project=chromium
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.reparatur-weg-e2e-seed.json'), 'utf8'))
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

// WunschterminPicker (Chip-Picker, keine datetime-local): ersten Datums-Chip klicken. Chips laden async
// (useEffect nach Mount). Ein Datums-Chip setzt Datum + Default-Zeit 10:00 → der Absende-Button aktiviert.
// Zeit-Chips ("08:00") matchen den dd.mm.-Regex NICHT (":" statt "."), nur Datums-Chips.
async function waehleErstenDatumsChip(page: Page) {
  const chip = page.locator('button').filter({ hasText: /\d{2}\.\d{2}\./ }).first()
  await expect(chip).toBeVisible({ timeout: 15_000 })
  await chip.click()
}

test('Termin-"Passt nicht"-Loop: Kunde lehnt Termin ab → Werkstatt schlägt neu vor → Kunde bestätigt', async ({ browser }) => {
  test.setTimeout(220_000)
  let wsCtx: BrowserContext | undefined
  let kdCtx: BrowserContext | undefined
  try {
    wsCtx = await browser.newContext()
    kdCtx = await browser.newContext()
    const ws = await wsCtx.newPage()
    const kd = await kdCtx.newPage()
    await login(ws, seed.werkstattEmail, seed.werkstattPw)
    await login(kd, seed.kundeEmail, seed.kundePw)

    await test.step('1) Werkstatt lädt KVA hoch (Betrag + Termin-Vorschlag)', async () => {
      await ws.goto(`/werkstatt/auftraege/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      await ladeKva(ws, 2500)
    })

    await test.step('2) Kunde gibt KVA frei (Signatur + Reparaturauftrag erteilen)', async () => {
      await kd.goto(`/kunde/faelle/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      await kd.reload({ waitUntil: 'domcontentloaded' }) // Realtime: WS-KVA einlesen
      const erteilen = kd.getByRole('button', { name: 'Reparaturauftrag erteilen' })
      await expect(erteilen).toBeVisible({ timeout: 30_000 })
      await erteilen.scrollIntoViewIfNeeded()
      // Signatur: signature_pad lädt async → zeichnen bis der Button aktiv wird (toPass wiederholt).
      const canvas = kd.locator('#zone-geld canvas').first()
      await expect(canvas).toBeVisible()
      await expect(async () => {
        const box = await canvas.boundingBox()
        if (!box) throw new Error('Signatur-Canvas ohne boundingBox')
        await kd.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5)
        await kd.mouse.down()
        await kd.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 10 })
        await kd.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 10 })
        await kd.mouse.up()
        await expect(erteilen).toBeEnabled({ timeout: 2_000 })
      }).toPass({ timeout: 25_000 })
      await erteilen.click()
      await expect(erteilen).toBeHidden({ timeout: 20_000 })
    })

    await test.step('3) Kunde: Termin "Passt nicht" + Rückruf-Wunschzeit buchen', async () => {
      await kd.reload({ waitUntil: 'domcontentloaded' })
      const passtNicht = kd.getByRole('button', { name: 'Passt nicht', exact: true })
      await expect(passtNicht).toBeVisible({ timeout: 20_000 })
      await passtNicht.click()
      // Rückruf-Wunschzeit wählen → setzt rueckruf_wunschzeit → triggert den WS-Hinweis
      await waehleErstenDatumsChip(kd)
      await kd.getByRole('button', { name: 'Rückruf buchen' }).click()
      await expect(kd.locator('[data-sonner-toast]').filter({ hasText: /Werkstatt ruft dich zurück/ }))
        .toBeVisible({ timeout: 20_000 })
    })

    await test.step('4) Werkstatt sieht Rückruf-Wunsch + schlägt einen NEUEN Termin vor', async () => {
      await ws.reload({ waitUntil: 'domcontentloaded' })
      // Beweis 1: Werkstatt sieht den Rückruf-Wunsch (Status 'anruf_erbeten' + Wunschzeit) — kein Deadlock
      await expect(ws.getByText(/Kunde bittet um Rückruf/i)).toBeVisible({ timeout: 20_000 })
      // Beweis 2: bei 'anruf_erbeten' bleiben die Aktionen offen (aktionOffen) → neu vorschlagen
      const neuVorschlagen = ws.getByRole('button', { name: 'Anderen Termin vorschlagen' })
      await expect(neuVorschlagen).toBeVisible({ timeout: 20_000 })
      await neuVorschlagen.click()
      await waehleErstenDatumsChip(ws)
      await ws.getByRole('button', { name: 'Vorschlag senden' }).click()
      await expect(ws.locator('[data-sonner-toast]').filter({ hasText: /Terminvorschlag gesendet/ }))
        .toBeVisible({ timeout: 20_000 })
    })

    await test.step('5) Kunde bestätigt den neuen Termin ("Passt") — Loop geschlossen', async () => {
      await kd.goto(`/kunde/faelle/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      await kd.reload({ waitUntil: 'domcontentloaded' })
      const passt = kd.getByRole('button', { name: 'Passt', exact: true })
      await expect(passt).toBeVisible({ timeout: 20_000 })
      await passt.click()
      await expect(passt).toBeHidden({ timeout: 20_000 })
    })
  } finally {
    await wsCtx?.close()
    await kdCtx?.close()
  }
})
