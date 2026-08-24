// Reparatur-WEG E2E-Smoke — operatives Soll des Selbstzahler-Reparatur-Wegs, VOLL per UI.
// Zwei Rollen (Werkstatt + Kunde) in je eigenem BrowserContext. Ausgangszustand (vermittelt,
// kva_erst, VOR KVA) kommt aus scripts/smoke/reparatur-weg-e2e-seed.mjs. Ab hier JEDER
// Zustandsuebergang = echter UI-Klick (kein DB-Seed). DB-Endbeweis via `--assert`.
//
// Run: CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test reparatur-weg-e2e-smoke --project=chromium
import { test, expect, type Page, type Locator, type BrowserContext } from '@playwright/test'
import { join } from 'node:path'
import { ladeSeedFixture } from '../lib/seed-fixture'
import { basicAuthFuerZiel } from '../lib/ziel'

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

// Hydration-robust: der Button ist SSR-sichtbar, aber sein onClick haengt erst nach der Client-
// Hydration an (das Modal-Primitive ist zusaetzlich auf mounted+open gegatet). goto/reload mit
// waitUntil:'domcontentloaded' resolved VOR der Hydration -> ein Sofort-Klick verpufft auf langsamer
// CI (Klick landet, Handler fehlt noch) und der Dialog oeffnet nie. toPass re-klickt idempotent (nur
// wenn noch KEIN Dialog im DOM -> das Modal rendert null wenn zu, kein versehentliches Schliessen),
// bis der Dialog sichtbar ist. .first() am Button-Locator toleriert Namensgleichheit (Trigger +
// Dialog-Submit tragen z.B. beide "Reparatur abschliessen").
async function oeffneDialog(page: Page, button: Locator): Promise<Locator> {
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    if ((await dialog.count()) === 0) await button.click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  return dialog
}

test('Selbstzahler-Reparatur-Weg end-to-end per UI (Werkstatt + Kunde)', async ({ browser }) => {
  test.setTimeout(180_000)
  let wsCtx: BrowserContext | undefined
  let kdCtx: BrowserContext | undefined
  try {
    // httpCredentials: staging liegt hinter nginx-Basic-Auth. Ein selbst gebauter
    // Kontext erbt die Option aus playwright.config NICHT — ohne sie lief dieser
    // Test im Journey-Gate in einen 180-s-Timeout im Schritt "Logins".
    wsCtx = await browser.newContext({ httpCredentials: basicAuthFuerZiel() })
    kdCtx = await browser.newContext({ httpCredentials: basicAuthFuerZiel() })
    const ws = await wsCtx.newPage()
    const kd = await kdCtx.newPage()

    await test.step('Logins (Werkstatt + Kunde)', async () => {
      await login(ws, seed.werkstattEmail, seed.werkstattPw)
      await login(kd, seed.kundeEmail, seed.kundePw)
    })

    await test.step('1) Werkstatt lädt KVA hoch (mit Betrag + Termin-Vorschlag)', async () => {
      await ws.goto(`/werkstatt/auftraege/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      const dialog = await oeffneDialog(ws, ws.getByRole('button', { name: 'Kostenvoranschlag hochladen' }))
      await ws.locator('#auftrag-kva-datei').setInputFiles(PDF)
      // Betrag Pflicht für Kunde-Sichtbarkeit (kvaSichtbar = kvaNetto||kvaBrutto)
      await ws.locator('input[name="auftrag-kva-brutto"]').fill('2500')
      // Termin-Vorschlag Pflicht (datetime-local, zukünftig)
      await ws.locator('#auftrag-kva-termin').fill('2026-09-15T10:00')
      const save = dialog.getByRole('button', { name: 'Speichern' })
      await expect(save).toBeEnabled({ timeout: 20_000 })
      await save.click()
      await expect(dialog).toBeHidden({ timeout: 20_000 })
    })

    await test.step('2) Kunde gibt KVA frei (Signatur + Reparaturauftrag erteilen)', async () => {
      await kd.goto(`/kunde/faelle/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      await kd.reload({ waitUntil: 'domcontentloaded' }) // Realtime: WS-KVA einlesen
      const erteilen = kd.getByRole('button', { name: 'Reparaturauftrag erteilen' })
      await expect(erteilen).toBeVisible({ timeout: 20_000 })
      await erteilen.scrollIntoViewIfNeeded()
      // Signatur: zeichnen bis der Button aktiv wird. signature_pad lädt async (dyn. import)
      // → endStroke feuert erst wenn das Pad bereit ist; toPass wiederholt den Strich.
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
      await expect(erteilen).toBeHidden({ timeout: 20_000 }) // Block verschwindet nach Freigabe
    })

    await test.step('3) Kunde bestätigt den Reparatur-Termin ("Passt")', async () => {
      await kd.reload({ waitUntil: 'domcontentloaded' })
      const passt = kd.getByRole('button', { name: 'Passt', exact: true })
      await expect(passt).toBeVisible({ timeout: 20_000 })
      await passt.click()
      await expect(passt).toBeHidden({ timeout: 20_000 })
    })

    await test.step('4) Werkstatt schließt ab (Schlussrechnung)', async () => {
      await ws.reload({ waitUntil: 'domcontentloaded' })
      const dialog = await oeffneDialog(ws, ws.getByRole('button', { name: 'Reparatur abschließen' }).first())
      await ws.locator('#reparatur-abschluss-datei').setInputFiles(PDF)
      await dialog.getByRole('button', { name: 'Reparatur abschließen' }).click()
      await expect(ws.locator('[data-sonner-toast]').filter({ hasText: 'Reparatur abgeschlossen' })).toBeVisible({ timeout: 25_000 })
    })

    await test.step('5) Kunde sieht Beleg + Fall "abgeschlossen"', async () => {
      await kd.goto(`/kunde/faelle/${seed.claimId}`, { waitUntil: 'domcontentloaded' })
      await kd.reload({ waitUntil: 'domcontentloaded' })
      await expect(kd.locator('#zone-status').getByText(/abgeschlossen/i).first()).toBeVisible({ timeout: 20_000 })
      await expect(kd.locator('#zone-doksTermine').getByText('Schlussrechnung').first()).toBeVisible({ timeout: 20_000 })
    })
  } finally {
    await wsCtx?.close()
    await kdCtx?.close()
  }
})
