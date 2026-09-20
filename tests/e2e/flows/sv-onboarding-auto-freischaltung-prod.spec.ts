import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { ladeSeedFixture } from '../lib/seed-fixture'
import { loginContextOrSkip, serviceClient, skipIfAuthWall } from './_golden-path-lib'
import { CLAIMS } from '../../../scripts/test-fixtures/ids'

// Regel-4-Prod-Smoke: „SV-Onboarding von überall — Freischaltung automatisch" (19.09.2026).
//
// Soll (Aaron, wörtlich): „ob die Freischaltung automatisch passiert … ich möchte nicht mehr
// verifizieren und … nicht mehr nachhalten müssen, ob die Dokumente fehlen … wenn Dokumente
// fehlen, soll der Sachverständige trotzdem angezeigt werden und sogar auch buchbar sein.
// Allerdings muss er die Dokumente hochladen können im Onboarding … Damit soll er wirklich
// verifiziert und buchbar sein."
//
// Journey: J8 A (Onboarding SV), berührt J1 (Finder) und J3 (SV-Dokumente in der Unterschrift).
// Soll-Blatt: memory/abnahmen/2026-09-19-sv-onboarding-auto-freischaltung-ueberall.md
//
// Ausgangszustand (Seed = der Zustand NACH /sv/registrieren: Konto existiert, Telefon bestätigt,
// portal=false, verifiziert=false, KEIN Dokument, KEINE Isochrone):
//   node --env-file=<abs>/.env.local scripts/smoke/sv-onboarding-auto-freischaltung-seed.mjs create
// Lauf:
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test sv-onboarding-auto-freischaltung --workers=1
// Danach:
//   node --env-file=<abs>/.env.local scripts/smoke/sv-onboarding-auto-freischaltung-seed.mjs cleanup
//
// Alles ab dem ersten Login läuft per UI (echter Login, echte Klicks, echter Upload, echte
// Unterschrift). DB-Reads sind die Gegenprobe, nie der Ersatz.

type Seed = { runId: string; email: string; password: string; uid: string; svId: string; plz: string }

const fixture = ladeSeedFixture<Seed>(
  '.sv-onboarding-auto-freischaltung-seed.json',
  'scripts/smoke/sv-onboarding-auto-freischaltung-seed.mjs',
  { ciErzeugt: false },
)
const seed = fixture.daten

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

test.describe.configure({ mode: 'serial' })
test.beforeEach(() => fixture.guard())

// Minimal gültiges PDF (eine leere Seite) — reicht dem Slot-Katalog (application/pdf, < 15 MB).
const MINI_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n' +
    '0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n',
)

// Das Einmalpasswort aus der Registrierung muss beim ersten Login geändert werden
// (Portal-Guard → /passwort-aendern). Das ist ein echter Schritt des Nutzerwegs, kein
// Test-Artefakt: der Gutachter setzt sein Passwort, DANN beginnt der Wizard. Das neue
// Passwort gilt für alle späteren Logins dieses Laufs (Re-Visit E12/E21).
let aktuellesPasswort: string | null = null

// Belege fürs Auge (Regel 5): je Zelle ein Screenshot — NICHT nach test-results/ (Playwright
// leert das Verzeichnis bei jedem Lauf), sondern in ABNAHME_SHOTS_DIR bzw. das System-Temp.
const SHOTS = process.env.ABNAHME_SHOTS_DIR ?? os.tmpdir()
async function beleg(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {})
}

async function loginSvPerUi(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  // Hat ein früherer Test (anderer Worker → Modul-State weg) das Einmalpasswort schon
  // geändert, steht force_password_change=false — dann gilt das abgeleitete Passwort.
  if (aktuellesPasswort == null) {
    const { data } = await serviceClient().from('profiles').select('force_password_change').eq('id', seed.uid).maybeSingle()
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
    // Ein früherer Lauf hat das Einmalpasswort schon geändert (neuer Worker → Modul-State weg):
    // mit dem abgeleiteten neuen Passwort erneut anmelden.
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

async function weiter(page: Page) {
  const btn = page.getByTestId('wizard-weiter')
  await expect(btn).toBeEnabled({ timeout: 20_000 })
  await btn.click()
}

async function unterschreiben(page: Page) {
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15_000 })
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signatur-Canvas ohne BoundingBox')
  const cy = box.y + box.height / 2
  await page.mouse.move(box.x + 30, cy)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, cy - 20, { steps: 8 })
  await page.mouse.move(box.x + box.width * 0.7, cy + 15, { steps: 8 })
  await page.mouse.move(box.x + box.width - 30, cy - 5, { steps: 8 })
  await page.mouse.up()
}

test('E1 · Basic-Wizard bis zur Unterschrift → sofort freigeschaltet, verifiziert, ohne Admin-Klick', async ({ browser }) => {
  test.setTimeout(6 * 60_000)
  const { ctx, page } = await loginSvPerUi(browser)
  try {
    // portal_zugang_freigeschaltet=false → das Layout führt in den Wizard.
    await page.goto('/gutachter/willkommen', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Willkommen bei Claimondo')).toBeVisible({ timeout: 30_000 })

    let dokumentHochgeladen = false
    let fertig = false
    for (let i = 0; i < 10 && !fertig; i++) {
      // Abschluss-Bildschirm?
      if (await page.getByText('Geschafft!').isVisible().catch(() => false)) { fertig = true; break }

      const text = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ')
      // Die Schritt-Erkennung hängt am Feld, das es NUR in diesem Schritt gibt (Regel-4-Skill:
      // kein generischer Text, kein `.first()` auf ein Element, das auch die Navigation hat —
      // im 2. Lauf traf `textarea.first()` eine unsichtbare Support-Textarea, die Kurzbeschreibung
      // blieb leer, der Wizard meldete „Pflichtfeld").
      const kurzbeschreibung = page.getByPlaceholder('Worauf sind Sie spezialisiert?')
      if (await kurzbeschreibung.isVisible().catch(() => false)) {
        await kurzbeschreibung.fill(
          `E2E-Wegwerf-Gutachter (Lauf ${seed.runId}) — prüft die automatische Freischaltung ohne Dokumentenprüfung.`,
        )
        await expect(kurzbeschreibung).toHaveValue(/E2E-Wegwerf-Gutachter/)
        await weiter(page)
      } else if (/Kalender verbinden/.test(text)) {
        await page.getByText('Ich nutze keines dieser Tools').first().click()
        await page.getByRole('button', { name: 'Weiter ohne Kalender' }).click()
        await weiter(page)
      } else if (/Ihr Widget/.test(text)) {
        await page.getByPlaceholder('z. B. Kfz-Gutachter Müller').fill(`E2E Widget ${seed.runId}`)
        await page.getByRole('button', { name: 'Ich habe noch keine Website' }).click()
        // Self-persisting: erst wenn das Widget angelegt ist, gibt der Wizard „Weiter" frei.
        await expect(page.getByTestId('wizard-weiter')).toBeEnabled({ timeout: 30_000 })
        await weiter(page)
      } else if (/Ihre Dokumente/.test(text)) {
        // Der NEUE Schritt: optional, ein Upload läuft, „Weiter" ist auch ohne Upload frei.
        await expect(page.getByText('Alles optional')).toBeVisible()
        await expect(page.getByTestId('wizard-weiter')).toBeEnabled()
        await page
          .locator('input[aria-label="Berufshaftpflicht hochladen"]')
          .setInputFiles({ name: 'berufshaftpflicht.pdf', mimeType: 'application/pdf', buffer: MINI_PDF })
        await expect(page.locator('[data-slot-status="hochgeladen"]').first()).toBeVisible({ timeout: 30_000 })
        dokumentHochgeladen = true
        await weiter(page)
      } else if (/Vertrag/.test(text) && (await page.locator('canvas').count()) > 0) {
        await unterschreiben(page)
        await weiter(page)
        // Nach finalize ersetzt der Server den Wizard per revalidate durch den
        // Abschluss-Bildschirm. Zeigt der Client zwischendurch seinen eigenen
        // Completed-Screen, hilft ein Reload — der Zustand liegt in der DB.
        const geschafft = page.getByText('Geschafft!')
        try {
          await expect(geschafft).toBeVisible({ timeout: 45_000 })
        } catch {
          await page.goto('/gutachter/willkommen', { waitUntil: 'domcontentloaded' })
          await expect(geschafft).toBeVisible({ timeout: 45_000 })
        }
        fertig = true
      } else if (/Ihr Standort/.test(text)) {
        await weiter(page)
      } else {
        await page.waitForTimeout(1_500)
      }
      // Dem Wizard Zeit geben, den nächsten Schritt zu rendern — sonst liest die nächste
      // Runde noch den alten Schritt und klickt zweimal.
      await page.waitForTimeout(800)
    }
    expect(fertig, 'Wizard erreicht den Abschluss-Bildschirm').toBe(true)
    expect(dokumentHochgeladen, 'der Dokumenten-Schritt war im Wizard und nahm einen Upload an').toBe(true)

    // Soll 1c/3: „Ihr Profil ist freigeschaltet" — kein „wir prüfen", kein 48h.
    await expect(page.getByText('Ihr Profil ist freigeschaltet')).toBeVisible({ timeout: 30_000 })

    // DB-Gegenprobe (Regel 4: ergänzt den Klick, ersetzt ihn nicht).
    const db = serviceClient()
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('portal_zugang_freigeschaltet, ist_aktiv, verifiziert, verifiziert_am, onboarding_status, verifizierung_frist_bis, isochrone_polygon, basic_onboarding_abgeschlossen_am, vertrag_unterschrieben')
      .eq('id', seed.svId)
      .single()
    expect(sv).toMatchObject({
      portal_zugang_freigeschaltet: true,
      ist_aktiv: true,
      verifiziert: true,
      onboarding_status: 'abgeschlossen',
      verifizierung_frist_bis: null,
      vertrag_unterschrieben: true,
    })
    expect(sv?.verifiziert_am).toBeTruthy()
    expect(sv?.isochrone_polygon, 'Isochrone von der Freigabe nachberechnet').toBeTruthy()
    expect(sv?.basic_onboarding_abgeschlossen_am).toBeTruthy()

    const { data: doc } = await db.from('pflichtdokumente').select('status, dokument_url').eq('sv_id', seed.svId).eq('dokument_typ', 'sv_berufshaftpflicht').maybeSingle()
    expect(doc?.status).toBe('hochgeladen')

    const { data: offeneTasks } = await db.from('tasks').select('id, typ, titel').eq('entity_id', seed.svId).in('status', ['offen', 'in-bearbeitung'])
    expect(offeneTasks ?? [], 'keine Admin-Aufgabe „prüfen/freigeben" — weder Freigabe noch Dokument').toEqual([])

    const { data: vertrag } = await db.from('vertraege_unterzeichnet').select('vorlage_typ').eq('sv_id', seed.svId)
    expect((vertrag ?? []).map((v) => v.vorlage_typ)).toContain('sv_basic_partnervertrag')
  } finally {
    await ctx.close()
  }
})

test('E15/E16 · anon sieht ihn (Karten-Policy), sv-in-naehe listet ihn (MCP-Pfad), Engine-Filter enthält ihn', async ({ request }) => {
  test.setTimeout(8 * 60_000)
  // Karten-Policy: dieselbe Menge, die das Finder-Embed lädt.
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: anonRows, error: anonErr } = await anon.from('sachverstaendige').select('id').eq('id', seed.svId)
  expect(anonErr).toBeNull()
  expect(anonRows?.length, 'anon-Policy lässt den frisch freigeschalteten Gutachter durch').toBe(1)

  // Engine-Filter (applyDispatchableFilter) als SQL-Gegenprobe über den Service-Client.
  const db = serviceClient()
  const { data: dispatchbar } = await db
    .from('sachverstaendige')
    .select('id')
    .eq('id', seed.svId)
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true)
    .eq('ist_testaccount', false)
    .is('gesperrt_seit', null)
    .is('geloescht_am', null)
  expect(dispatchbar?.length).toBe(1)

  // MCP-/LLM-Pfad: /api/v1/sv-in-naehe liefert Tier-1 bewusst OHNE id (Privacy-Projektion:
  // stadt, Initiale, Spezialisierungen, Bewertung, entfernung_km). Der Nachweis läuft deshalb
  // über die Entfernung: VOR der Freischaltung gemessen (20.09. 04:5x UTC, plz=25849&radius=60):
  // gesamt 47, tier1 0, tier1 unter 5 km 0. Pellworm hat keinen anderen Partner-Gutachter — ein
  // Tier-1-Treffer unter 5 km ist unser SV. Route cached 5 Minuten in-process → bis 7 Min pollen.
  const deadline = Date.now() + 7 * 60_000
  let gefunden = false
  let letzterStand = ''
  while (Date.now() < deadline && !gefunden) {
    const res = await request.get(`${APP}/api/v1/sv-in-naehe?plz=${seed.plz}&radius=60`)
    if (res.ok()) {
      const json = (await res.json()) as { sv_liste?: Array<{ tier?: number; entfernung_km?: number }> }
      const liste = json.sv_liste ?? []
      const tier1Nah = liste.filter((s) => s.tier === 1 && (s.entfernung_km ?? 99) <= 5)
      letzterStand = `gesamt=${liste.length} tier1=${liste.filter((s) => s.tier === 1).length} tier1<=5km=${tier1Nah.length}`
      gefunden = tier1Nah.length >= 1
    }
    if (!gefunden) await new Promise((r) => setTimeout(r, 30_000))
  }
  console.log(`[E15] sv-in-naehe Pellworm nachher: ${letzterStand} (vorher: tier1=0)`)
  expect(gefunden, `sv-in-naehe (MCP-Pfad) listet einen Partner-Gutachter unter 5 km bei Pellworm — ${letzterStand}`).toBe(true)
})

test('E12/E21 · Re-Visit: Portal ohne Frist-Banner, Nachweise zeigen den Upload (RLS-Positivkontrolle)', async ({ browser }) => {
  const { ctx, page } = await loginSvPerUi(browser)
  try {
    await page.goto('/gutachter', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/willkommen/)
    await expect(page.getByText('Wird geladen')).toHaveCount(0, { timeout: 30_000 })
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    expect(body).not.toMatch(/pausieren wir Ihre Fälle|Fälle sind pausiert|Frist überschritten/)
    await beleg(page, 'e12-portal-ohne-frist-banner')

    await page.goto('/gutachter/verifizierung', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('nachweise-zaehler')).toContainText('1 von', { timeout: 30_000 })
    await expect(page.locator('[data-slot-id="sv_berufshaftpflicht"][data-slot-status="hochgeladen"]')).toBeVisible()
    const seite = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    expect(seite).not.toMatch(/14-Tage-Frist|Dispatch-Zugang|Prüf-Task/)
    expect(seite).toMatch(/Alles optional/)
    await beleg(page, 'e21-nachweise-upload-sichtbar')
  } finally {
    await ctx.close()
  }
})

test('E10/E20 · Admin: Akte zeigt „Im Finder sichtbar", keine Freigabe-Warteschlange für ihn', async ({ browser }) => {
  // DB-Gegenprobe zuerst — sie läuft auch ohne Admin-Login (TOTP-Secret liegt nur in CI):
  // die Warteschlange filtert paket=basic + portal=false; der frisch freigeschaltete SV
  // darf dort nicht mehr auftauchen.
  const db = serviceClient()
  const { data: queue } = await db
    .from('sachverstaendige')
    .select('id')
    .eq('id', seed.svId)
    .eq('paket', 'basic')
    .eq('portal_zugang_freigeschaltet', false)
  expect(queue ?? [], 'Basic-Freigabe-Warteschlange enthält den SV nicht mehr').toEqual([])

  const ctx = await loginContextOrSkip(browser, 'admin')
  const page = await ctx.newPage()
  try {
    await page.goto(`/admin/sachverstaendige/${seed.svId}`, { waitUntil: 'domcontentloaded' })
    skipIfAuthWall(page)
    await expect(page.getByText('Im Finder sichtbar').first()).toBeVisible({ timeout: 30_000 })
    await beleg(page, 'e20-admin-akte-im-finder-sichtbar')
    await page.goto('/admin/sachverstaendige/basic-freigaben', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Wird geladen')).toHaveCount(0, { timeout: 30_000 })
    const liste = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    expect(liste).not.toContain(seed.email)
    await beleg(page, 'e10-basic-freigaben-ohne-den-sv')
  } finally {
    await ctx.close()
  }
})

test('E17 · Kunde: das Siegel „Verifiziert" steht in der Fallakte beim frisch freigeschalteten Gutachter', async ({ browser }) => {
  const db = serviceClient()
  const claimId = CLAIMS.c1
  const { data: claim } = await db.from('claims').select('id, sv_id').eq('id', claimId).maybeSingle()
  test.skip(!claim, `Fixture-Claim ${claimId} existiert auf dieser Umgebung nicht — Siegel-Zelle nicht messbar`)
  const vorher = (claim?.sv_id as string | null) ?? null
  // Ausgangszustand seeden (der Fall wäre über Dispatch/Engine dem SV zugewiesen worden) — der
  // geprüfte Schritt ist die ANZEIGE des Siegels, nicht die Zuweisung.
  const { error: setErr } = await db.from('claims').update({ sv_id: seed.svId }).eq('id', claimId)
  expect(setErr).toBeNull()
  try {
    const ctx = await loginContextOrSkip(browser, 'kunde')
    const page = await ctx.newPage()
    try {
      await page.goto(`/kunde/faelle/${claimId}`, { waitUntil: 'domcontentloaded' })
      skipIfAuthWall(page)
      await expect(page.getByText('Verifiziert', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
      await beleg(page, 'e17-kunde-fallakte-siegel')
    } finally {
      await ctx.close()
    }
  } finally {
    await db.from('claims').update({ sv_id: vorher }).eq('id', claimId)
  }
})
