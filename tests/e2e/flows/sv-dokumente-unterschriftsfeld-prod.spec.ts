import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import os from 'node:os'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { ladeSeedFixture } from '../lib/seed-fixture'
import { serviceClient } from './_golden-path-lib'

// Regel-4-Prod-Smoke: „SV-Dokumente brauchen ein gesetztes Unterschriftsfeld, Basic holt den
// Partnervertrag nach" (21.09.2026).
//
// Soll (Aaron, 20.09.2026 wörtlich): „1 ja oder haben wir dafür schon was? 2. ja aber as
// unterschriftfeld muss gesetzt werden. 3 ja"
//
// Gemessen vor dem Bau (prod, 20.09.): 0 Zeilen `fall_dokumente` mit kategorie='vertrag-signiert'
// seit es die Funktion gibt, 0 Klick-Konfigs unter /admin/vertraege, 16 von 22 freigeschalteten
// Basic-Konten ohne Partnervertrag.
//
// Journey: J3 (Unterschriften — Soll-Delta 20.09.) + J8 (Onboarding — Soll-Delta 20.09.).
// Soll-Blatt: memory/abnahmen/2026-09-20-sv-dokumente-unterschriftsfeld-und-partnervertrag.md
//
// Ausgangszustand (Seed = der Stand nach dem Basic-Onboarding: Konto freigeschaltet, KEIN
// Partnervertrag, KEIN Dokument; dazu ein Test-Lead mit FlowLink und gebuchtem Termin):
//   node --env-file=<abs>/.env.local scripts/smoke/sv-dokumente-unterschriftsfeld-seed.mjs create
// Lauf:
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/sv-dokumente-unterschriftsfeld-prod.spec.ts --workers=1
// Danach:
//   node --env-file=<abs>/.env.local scripts/smoke/sv-dokumente-unterschriftsfeld-seed.mjs cleanup
//
// Alles ab dem ersten Login läuft per UI: echter Login, echter Upload, echter Klick ins PDF,
// echte Kunden-Unterschrift auf dem Canvas. DB-Reads sind die Gegenprobe, nie der Ersatz.

type Seed = {
  runId: string
  email: string
  password: string
  kundenEmail: string
  uid: string
  svId: string
  leadId: string
  token: string
  terminId: string
}

const fixture = ladeSeedFixture<Seed>(
  '.sv-dokumente-unterschriftsfeld-seed.json',
  'scripts/smoke/sv-dokumente-unterschriftsfeld-seed.mjs',
  { ciErzeugt: false },
)
const seed = fixture.daten

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SHOTS = process.env.ABNAHME_SHOTS_DIR ?? join(os.tmpdir(), 'abnahme-sv-dokumente')
const SLOT = 'sv_sicherungsabtretung'

test.describe.configure({ mode: 'serial' })
test.beforeEach(() => fixture.guard())

let aktuellesPasswort: string | null = null

async function beleg(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {})
}

/**
 * Zweiseitiges A4-PDF mit einer sichtbaren Unterschriftslinie auf Seite 2 — genau das, was ein
 * Gutachter als Sicherungsabtretung hochlädt. Zwei Seiten sind Absicht: nur so beweist der
 * spätere Vergleich, dass KEINE Anhangseite entstanden ist (2 Seiten vorher, 2 Seiten nachher).
 */
async function baueZweiseitigesPdf(): Promise<string> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const s1 = pdf.addPage([595, 842])
  s1.drawText('Sicherungsabtretung (Abnahme-Smoke)', { x: 60, y: 780, size: 16, font, color: rgb(0.05, 0.1, 0.25) })
  s1.drawText('Seite 1 von 2 — Bedingungen', { x: 60, y: 750, size: 11, font, color: rgb(0.3, 0.3, 0.4) })
  const s2 = pdf.addPage([595, 842])
  s2.drawText('Seite 2 von 2', { x: 60, y: 780, size: 11, font, color: rgb(0.3, 0.3, 0.4) })
  s2.drawText('Unterschrift des Kunden:', { x: 60, y: 300, size: 11, font, color: rgb(0.2, 0.2, 0.3) })
  s2.drawLine({ start: { x: 60, y: 250 }, end: { x: 300, y: 250 }, thickness: 1, color: rgb(0.5, 0.55, 0.65) })
  const pfad = join(os.tmpdir(), `smoke-sicherungsabtretung-${seed.runId}.pdf`)
  writeFileSync(pfad, await pdf.save())
  return pfad
}

async function loginSvPerUi(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  if (aktuellesPasswort == null) {
    const { data } = await serviceClient()
      .from('profiles')
      .select('force_password_change')
      .eq('id', seed.uid)
      .maybeSingle()
    if (data && data.force_password_change === false) aktuellesPasswort = `${seed.password}-Neu1!`
  }
  const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1200 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(seed.email)
  await page.locator('input[type="password"]').first().fill(aktuellesPasswort ?? seed.password)
  await page.locator('button[type="submit"]').first().click()
  try {
    await page.waitForURL(/\/gutachter|\/passwort-aendern/, { timeout: 30_000 })
  } catch {
    aktuellesPasswort = `${seed.password}-Neu1!`
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"], input[name="email"]').first().fill(seed.email)
    await page.locator('input[type="password"]').first().fill(aktuellesPasswort)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL(/\/gutachter|\/passwort-aendern/, { timeout: 45_000 })
  }
  if (/\/passwort-aendern/.test(page.url())) {
    const neu = `${seed.password}-Neu1!`
    await page.getByPlaceholder('Mindestens 12 Zeichen').fill(neu)
    await page.getByPlaceholder('Passwort wiederholen').fill(neu)
    await page.getByRole('button', { name: 'Passwort ändern' }).click()
    await page.waitForURL(/\/gutachter/, { timeout: 45_000 })
    aktuellesPasswort = neu
  }
  return { ctx, page }
}

async function dokumentZeile() {
  const { data } = await serviceClient()
    .from('pflichtdokumente')
    .select('status, dokument_url, signatur_position')
    .eq('sv_id', seed.svId)
    .eq('dokument_typ', SLOT)
    .maybeSingle()
  return data as { status: string | null; dokument_url: string | null; signatur_position: unknown } | null
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// E7 · Der Partnervertrag holt sich den Gutachter EINMAL ab — und lässt ihn dann in Ruhe
// (Aaron: „3 ja", einmalig und nicht blockierend). Muss vor allem anderen laufen: der Marker
// wird beim ERSTEN Portal-Aufruf gesetzt.
// ───────────────────────────────────────────────────────────────────────────────────────────
test('E7 · Basic ohne Partnervertrag wird beim ersten Login genau einmal zur Unterschrift geführt', async ({ browser }) => {
  test.setTimeout(4 * 60_000)

  const vorher = await serviceClient()
    .from('sachverstaendige')
    .select('partnervertrag_hinweis_am, vertrag_unterschrieben')
    .eq('id', seed.svId)
    .maybeSingle()
  expect(vorher.data?.partnervertrag_hinweis_am, 'Ausgangszustand: Hinweis noch nie gezeigt').toBeNull()
  expect(vorher.data?.vertrag_unterschrieben, 'Ausgangszustand: kein Vertrag').toBeFalsy()

  const { ctx, page } = await loginSvPerUi(browser)
  try {
    await page.goto('/gutachter/heute', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await beleg(page, 'e7-erste-umleitung')

    expect(page.url(), 'erster Portal-Aufruf landet auf der Vertragsseite').toContain('/gutachter/vertrag')
    await expect(page.getByText('Ihr Partnervertrag fehlt noch')).toBeVisible({ timeout: 20_000 })

    const nachher = await serviceClient()
      .from('sachverstaendige')
      .select('partnervertrag_hinweis_am')
      .eq('id', seed.svId)
      .maybeSingle()
    expect(nachher.data?.partnervertrag_hinweis_am, 'Marker gesetzt → kein zweites Mal').not.toBeNull()

    // „Später erledigen" darf nichts kosten.
    await page.getByRole('button', { name: 'Später erledigen' }).click()
    await page.waitForURL(/\/gutachter(?!\/vertrag)/, { timeout: 30_000 })

    // Zweiter Aufruf: keine Umleitung mehr, aber das stille Hinweisband führt zurück.
    await page.goto('/gutachter/heute', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    expect(page.url(), 'zweiter Aufruf bleibt im Portal').not.toContain('/gutachter/vertrag')
    await expect(page.getByText('Ihr Partnervertrag ist noch nicht unterschrieben.')).toBeVisible({ timeout: 20_000 })
    await beleg(page, 'e7-hinweisband')
  } finally {
    await ctx.close()
  }
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// E1 · Upload ohne Feld wirkt NICHT im Kundenflow (Aaron: „das Unterschriftsfeld muss gesetzt
// werden") — und der Gutachter sieht das auch.
// ───────────────────────────────────────────────────────────────────────────────────────────
test('E1 · Hochgeladene Sicherungsabtretung wartet sichtbar auf das Unterschriftsfeld', async ({ browser }) => {
  test.setTimeout(5 * 60_000)
  const pdfPfad = await baueZweiseitigesPdf()

  const { ctx, page } = await loginSvPerUi(browser)
  try {
    await page.goto('/gutachter/verifizierung', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    const zeile = page.locator(`[data-slot-id="${SLOT}"]`)
    await expect(zeile, 'Slot Sicherungsabtretung ist auf der Nachweise-Seite').toBeVisible({ timeout: 20_000 })
    await expect(zeile).toHaveAttribute('data-slot-zustand', 'leer')

    await zeile.locator('input[type="file"]').setInputFiles(pdfPfad)
    await expect(zeile).toHaveAttribute('data-slot-zustand', 'feld_fehlt', { timeout: 45_000 })
    await expect(zeile.getByText('Unterschriftsfeld fehlt')).toBeVisible({ timeout: 20_000 })
    await beleg(page, 'e1-feld-fehlt')

    const row = await dokumentZeile()
    expect(row?.dokument_url, 'Datei liegt im Storage').toBeTruthy()
    expect(row?.status, 'wartet auf das Feld, daher NICHT im Kundenflow').toBe('ausstehend')
    expect(row?.signatur_position, 'noch keine Position').toBeNull()
  } finally {
    await ctx.close()
  }
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// E2 · Der Gutachter setzt das Feld per Klick ins Dokument → der Slot wird aktiv.
// ───────────────────────────────────────────────────────────────────────────────────────────
test('E2 · Klick ins PDF setzt das Unterschriftsfeld und aktiviert das Dokument', async ({ browser }) => {
  test.setTimeout(5 * 60_000)

  const { ctx, page } = await loginSvPerUi(browser)
  try {
    await page.goto('/gutachter/verifizierung', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    await page.getByTestId(`unterschriftsfeld-knopf-${SLOT}`).click()
    const editor = page.getByTestId('unterschriftsfeld-editor')
    await expect(editor, 'Editor öffnet sich').toBeVisible({ timeout: 30_000 })

    // Auf Seite 2 wechseln — dort steht im Testdokument die Unterschriftslinie.
    await page.getByRole('button', { name: 'Nächste Seite' }).click()
    await expect(page.getByText('Seite 2 von 2')).toBeVisible({ timeout: 15_000 })

    // Echter Klick ins Dokument: untere linke Hälfte, wo die Linie liegt.
    const overlay = page.getByTestId('unterschriftsfeld-overlay')
    const box = await overlay.boundingBox()
    if (!box) throw new Error('Klick-Overlay ohne BoundingBox')
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.68)
    await expect(page.getByTestId('unterschriftsfeld-box'), 'Feld sichtbar gesetzt').toBeVisible({ timeout: 10_000 })
    await beleg(page, 'e2-feld-gesetzt')

    await page.getByRole('button', { name: 'Unterschriftsfeld speichern' }).click()
    await expect(page.getByRole('button', { name: 'Gespeichert' })).toBeVisible({ timeout: 30_000 })

    const row = await dokumentZeile()
    expect(row?.status, 'jetzt im Kundenflow').toBe('hochgeladen')
    const pos = row?.signatur_position as Record<string, number> | null
    expect(pos, 'Position gespeichert').toBeTruthy()
    expect(pos?.page, 'auf Seite 2 gesetzt (0-basiert)').toBe(1)
    expect(pos?.seiten, 'Seitenzahl des Dokuments mitgeschrieben').toBe(2)
    expect(pos?.x, 'x innerhalb der Seite').toBeGreaterThanOrEqual(0)
    expect(pos?.y, 'y innerhalb der Seite').toBeGreaterThanOrEqual(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator(`[data-slot-id="${SLOT}"]`)).toHaveAttribute('data-slot-zustand', 'aktiv', { timeout: 20_000 })
    await beleg(page, 'e2-slot-aktiv')
  } finally {
    await ctx.close()
  }
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// E5 · Der Kunde unterschreibt im FlowLink — und seine Unterschrift landet IM Dokument,
// nicht auf einer Anhangseite. Das ist der Punkt, der auf prod noch nie funktioniert hat.
// ───────────────────────────────────────────────────────────────────────────────────────────
test('E5 · Kunde unterschreibt → signiertes Dokument mit unveränderter Seitenzahl', async ({ browser }) => {
  test.setTimeout(8 * 60_000)

  const vorher = await serviceClient()
    .from('fall_dokumente')
    .select('id', { count: 'exact', head: true })
    .eq('kategorie', 'vertrag-signiert')
  const anzahlVorher = vorher.count ?? 0

  const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/flow/${seed.token}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await beleg(page, 'e5-flow-start')

    // Bis zum Unterschrifts-Schritt klicken. Die Strecke ist am 21.09. gegen prod ausgemessen
    // worden und hat mit diesem Seed drei Klicks:
    //   1 „Hallo …"        Zusammenfassung, Datenschutz-Häkchen → Weiter
    //   2 „Ihr persönlicher Gutachter"  zeigt den geseedeten Termin → Weiter
    //     (der Termin-Schritt entfällt genau deshalb — der Seed hat ihn vorbelegt)
    //   3 „Wählen Sie Ihre Werkstatt"   → Überspringen
    //   4 „Beauftragung unterzeichnen"  Canvas
    // Die Schleife bleibt trotzdem allgemein: sie hakt vor jedem Schritt alle sichtbaren
    // Zustimmungen an und nimmt den ersten passenden Knopf.
    const canvas = page.locator('canvas').first()
    for (let runde = 0; runde < 8; runde += 1) {
      if (await canvas.isVisible().catch(() => false)) break
      const boxen = page.locator('input[type="checkbox"]:visible')
      const anzahl = await boxen.count()
      for (let i = 0; i < anzahl; i += 1) {
        const box = boxen.nth(i)
        if (!(await box.isChecked().catch(() => true))) await box.check({ force: true }).catch(() => {})
      }
      const weiter = page
        .getByRole('button', { name: /^(Weiter|Fortfahren|Bestätigen|Überspringen)/ })
        .first()
      if (!(await weiter.isVisible().catch(() => false))) break
      if (await weiter.isDisabled().catch(() => false)) break
      await weiter.click()
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(1500)
    }
    await expect(canvas, 'Signatur-Feld erreicht').toBeVisible({ timeout: 30_000 })

    // Der Unterschrifts-Schritt verlangt eine Wahl: Abrechnungsweg und Serviceumfang. Ohne sie
    // bleibt „Beauftragung unterschreiben" deaktiviert.
    for (const wahl of ['Reparatur (in der Werkstatt)', 'Komplettservice']) {
      const knopf = page.getByRole('button', { name: new RegExp(`^${wahl}`) }).first()
      if (await knopf.isVisible().catch(() => false)) {
        await knopf.click().catch(() => {})
        await page.waitForTimeout(500)
      }
    }

    const box = await canvas.boundingBox()
    if (!box) throw new Error('Signatur-Canvas ohne BoundingBox')
    const cy = box.y + box.height / 2
    await page.mouse.move(box.x + 30, cy)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.4, cy - 20, { steps: 8 })
    await page.mouse.move(box.x + box.width * 0.75, cy + 15, { steps: 8 })
    await page.mouse.up()
    await beleg(page, 'e5-unterschrift-gezeichnet')

    const absenden = page.getByRole('button', { name: 'Beauftragung unterschreiben' })
    await expect(absenden, 'Absenden ist freigegeben').toBeEnabled({ timeout: 20_000 })
    await absenden.click()
    await page.waitForTimeout(10_000) // Konversion Lead → Fall + SA-Tool-Merge

    // Gegenprobe in der Datenbank: entstand ein signiertes Dokument für diesen Slot?
    const db = serviceClient()
    const { data: claim } = await db.from('claims').select('id').eq('lead_id', seed.leadId).maybeSingle()
    expect(claim?.id, 'Lead wurde zum Fall konvertiert').toBeTruthy()

    let dok: { storage_path: string } | null = null
    for (let versuch = 0; versuch < 10 && !dok; versuch += 1) {
      const { data } = await db
        .from('fall_dokumente')
        .select('storage_path, beschreibung')
        .eq('fall_id', claim!.id)
        .eq('kategorie', 'vertrag-signiert')
        .like('storage_path', `%${SLOT}%`)
        .maybeSingle()
      dok = (data as { storage_path: string } | null) ?? null
      if (!dok) await page.waitForTimeout(3000)
    }
    expect(dok?.storage_path, 'signierte Sicherungsabtretung erzeugt').toBeTruthy()

    const nachher = await db
      .from('fall_dokumente')
      .select('id', { count: 'exact', head: true })
      .eq('kategorie', 'vertrag-signiert')
    expect(nachher.count ?? 0, 'Zahl signierter Dokumente ist gestiegen').toBeGreaterThan(anzahlVorher)

    // Der eigentliche Beweis: gleiche Seitenzahl wie das Original = keine Anhangseite.
    const { data: blob } = await db.storage.from('fall-dokumente').download(dok!.storage_path)
    expect(blob, 'signiertes PDF ist lesbar').toBeTruthy()
    const geladen = await PDFDocument.load(new Uint8Array(await blob!.arrayBuffer()), { ignoreEncryption: true })
    expect(
      geladen.getPageCount(),
      'Unterschrift steht IM Dokument — eine Anhangseite hätte 3 Seiten ergeben',
    ).toBe(2)
  } finally {
    await ctx.close()
  }
})

// ───────────────────────────────────────────────────────────────────────────────────────────
// E8 · Der Gutachter holt den Partnervertrag nach → PDF und Vertragszeile entstehen.
// ───────────────────────────────────────────────────────────────────────────────────────────
test('E8 · Partnervertrag nachgeholt → Vertragszeile mit PDF im Bucket', async ({ browser }) => {
  test.setTimeout(5 * 60_000)

  const { ctx, page } = await loginSvPerUi(browser)
  try {
    await page.goto('/gutachter/vertrag', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByText('Ihr Partnervertrag fehlt noch')).toBeVisible({ timeout: 20_000 })

    await page.getByRole('checkbox').first().check()
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    await canvas.scrollIntoViewIfNeeded()
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Signatur-Canvas ohne BoundingBox')
    const cy = box.y + box.height / 2
    await page.mouse.move(box.x + 30, cy)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5, cy - 18, { steps: 8 })
    await page.mouse.move(box.x + box.width - 40, cy + 12, { steps: 8 })
    await page.mouse.up()
    await beleg(page, 'e8-vertrag-gezeichnet')

    await page.getByRole('button', { name: 'Partnervertrag unterzeichnen' }).click()
    await expect(page.getByText('Partnervertrag unterzeichnet')).toBeVisible({ timeout: 45_000 })
    await beleg(page, 'e8-vertrag-unterschrieben')

    const db = serviceClient()
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('vertrag_unterschrieben, vertrag_unterschrieben_am')
      .eq('id', seed.svId)
      .maybeSingle()
    expect(sv?.vertrag_unterschrieben, 'Flag gesetzt').toBe(true)

    const { data: vertrag } = await db
      .from('vertraege_unterzeichnet')
      .select('id, vorlage_typ, pdf_storage_path, unterschrift_name')
      .eq('sv_id', seed.svId)
      .eq('vorlage_typ', 'sv_basic_partnervertrag')
      .maybeSingle()
    expect(vertrag?.id, 'Vertragszeile existiert — vorher hatte KEIN Basic-Konto eine').toBeTruthy()
    expect(vertrag?.pdf_storage_path, 'PDF-Pfad hinterlegt').toBeTruthy()

    const { data: pdfBlob } = await db.storage.from('vertraege').download(vertrag!.pdf_storage_path as string)
    expect(pdfBlob, 'Vertrags-PDF liegt wirklich im Bucket').toBeTruthy()

    // Das Hinweisband ist weg, und die Seite leitet nicht mehr um.
    await page.goto('/gutachter/heute', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByText('Ihr Partnervertrag ist noch nicht unterschrieben.')).toHaveCount(0)
    await beleg(page, 'e8-hinweisband-weg')
  } finally {
    await ctx.close()
  }
})
