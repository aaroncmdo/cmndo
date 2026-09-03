import { test, expect, type Page } from '@playwright/test'

// Vertrieb-Cockpit — Migrations-Smoke (Aaron 11.07. "saubere Konsolidierung + Migration … e2e … auch
// auf prod"). Belegt, dass die konsolidierte Uebersicht steht UND dass Detail-Views IM Cockpit als
// Drawer oeffnen (nicht mehr full-page "rausklicken"). Read-only: nur Navigation + Toggles + ein
// Detail-Klick; KEINE Schreib-Aktionen (kein Senden/Convert/Scrapen/Protokollieren).
//
// Run lokal:  CI=1 RUN_VERTRIEB_SMOKE=1 PLAYWRIGHT_BASE_URL=http://localhost:3210 \
//             npx playwright test vertrieb-cockpit-migration --project=chromium --reporter=line
// Run prod:   CI=1 RUN_VERTRIEB_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//             npx playwright test vertrieb-cockpit-migration --project=chromium --reporter=line

// ⚠ Hier stand hardcodiert `smoke-admin@claimondo.test` — dieses Konto EXISTIERT NICHT
// (0 Rows in auth.users, seit dem Golive-Accounts-Cleanup). Der Login lief damit in
// `/login?error=E-Mail+oder+Passwort+ist+falsch`, und ALLE 11 Tests dieser Datei fielen
// daran — auch dann, wenn man TEST_ADMIN_* setzte, denn die wurden gar nicht gelesen.
// Prod-Admin ist `test-admin@claimondo.de` / `<PASSWORT: GitHub-Secret>` (per echtem Login gemessen).
// ENV-Override wie ueberall sonst; `||` statt `??`, damit ein leer gesetztes CI-Secret
// nicht den funktionierenden Default ueberschreibt.
const ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'test-admin@claimondo.de',
  pw: process.env.TEST_ADMIN_PASSWORD || '',
}

async function login(page: Page, email: string, pw: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test.beforeAll(() => {
  test.skip(!process.env.RUN_VERTRIEB_SMOKE, 'set RUN_VERTRIEB_SMOKE=1 to run this cockpit smoke')
})

// ---------------------------------------------------------------------------
// 1 — Konsolidierte Uebersicht: Rollen-Pills + Lead/Partner + Liste/Karte-Toggle rendern.
//     (Deadline-Guard-Beleg: der Roster rendert auch wenn Live-Ops flakt.)
// ---------------------------------------------------------------------------
test('1) Cockpit rendert konsolidiert (Pills + Schalter + Toggle)', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })

  // Roster muss auch bei flakiger Live-Ops-Quelle innerhalb der Guard-Deadline erscheinen.
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })
  for (const pill of ['Alle', 'Makler', 'Werkstätten', 'Leads', 'Partner', 'Liste', 'Karte']) {
    await expect(page.getByRole('button', { name: pill }).first()).toBeVisible()
  }
  await page.screenshot({ path: 'test-results/vertrieb-cockpit-1-roster.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 2 — SV-Pill schaltet den 3. Toggle "Live-Ops" frei; die operative SV-Liste rendert.
// ---------------------------------------------------------------------------
test('2) SV-Pill -> Live-Ops-Toggle + operative Liste', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Sachverständige' }).first().click()

  const liveOpsToggle = page.getByRole('button', { name: 'Live-Ops' })
  await expect(liveOpsToggle, 'Live-Ops-Toggle nur bei rolle=SV').toBeVisible({ timeout: 15_000 })
  await liveOpsToggle.first().click()
  // Kopfzeile der operativen Liste (oder leerer Scope-Hinweis) — beides ist ok.
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'test-results/vertrieb-cockpit-2-liveops.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 3 — KERN: SV-Detail oeffnet als Drawer IM Cockpit (Intercepting-Route), kein Full-Page-Weg.
// ---------------------------------------------------------------------------
test('3) SV-Detail = Drawer im Cockpit (Migration statt Deep-Link)', async ({ page }) => {
  test.setTimeout(150_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Sachverständige' }).first().click()
  await page.getByRole('button', { name: 'Live-Ops' }).first().click()

  const rows = page.locator('table tbody tr')
  await page.waitForTimeout(2500)
  const n = await rows.count()
  console.log('[vertrieb] live-ops rows:', n)
  test.skip(n === 0, 'keine operativen SVs im Live-Ops-Scope — Drawer-Pfad nicht testbar')

  await rows.first().click() // -> soft-nav /admin/vertrieb/sachverstaendige/<id> -> @drawer-Intercept
  // Der DrawerShell-Titel erscheint NUR, wenn der Intercept feuert (Full-Page haette den SV-eigenen Header).
  await expect(page.getByText('Sachverständigen-Profil'), 'Drawer muss ueber dem Cockpit oeffnen').toBeVisible({
    timeout: 90_000,
  })
  expect(page.url(), 'URL bleibt im Cockpit-Segment').toContain('/admin/vertrieb/sachverstaendige/')
  // Cockpit bleibt dahinter gemountet -> es ist ein Drawer, kein Weg-Navigieren.
  await expect(page.getByRole('button', { name: 'Live-Ops' }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/vertrieb-cockpit-3-drawer.png', fullPage: true }).catch(() => {})

  // Schliessen -> Drawer weg.
  await page.keyboard.press('Escape')
  await expect(page.getByText('Sachverständigen-Profil')).toBeHidden({ timeout: 10_000 })
})

// ---------------------------------------------------------------------------
// 4 — QR-Pool oeffnet als Drawer im Cockpit (kein Full-Page-Weg).
// ---------------------------------------------------------------------------
test('4) QR-Pool oeffnet als Drawer im Cockpit (kein Full-Page-Weg)', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })

  // Warten bis Cockpit bereit ist
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })

  // Werkstaetten-Pill aktivieren damit die QR-Pool-Aktion erscheint
  await page.getByRole('button', { name: 'Werkstätten' }).first().click()

  // QR-Pool-Aktion im Cockpit ausloesen
  await page.getByRole('button', { name: 'QR-Pool verwalten' }).first().click()

  // Drawer muss sich IM Cockpit oeffnen (Heading aus QrPoolClient)
  await expect(page.getByRole('heading', { name: 'QR-Code-Pool' })).toBeVisible({ timeout: 60_000 })

  // URL darf NICHT auf die alte Seite navigiert haben
  expect(page.url()).toContain('/admin/vertrieb')

  await page.screenshot({ path: 'test-results/vertrieb-cockpit-4-qrpool.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 5 — CSV-Import oeffnet als Drawer im Cockpit (kein Full-Page-Weg).
// ---------------------------------------------------------------------------
test('5) CSV-Import oeffnet als Drawer im Cockpit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })

  // Warten bis Cockpit bereit ist
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })

  // Leads-Modus aktivieren (CSV-Aktion erscheint nur im Lead-Modus)
  await page.getByRole('button', { name: 'Leads' }).first().click()

  // CSV-Import-Aktion im Cockpit ausloesen
  await page.getByRole('button', { name: 'CSV importieren' }).first().click()

  // Drawer muss sich IM Cockpit oeffnen — Heading aus CsvImportPanel via getByRole(heading),
  // NICHT der gleichlautende Aktions-Button "CSV importieren" (sonst Strict-Mode-Ambiguitaet).
  await expect(page.getByRole('heading', { name: 'CSV importieren' })).toBeVisible({ timeout: 60_000 })

  // URL darf NICHT auf /admin/partner-leads navigiert haben
  expect(page.url()).toContain('/admin/vertrieb')

  await page.screenshot({ path: 'test-results/vertrieb-cockpit-5-csv.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 6 — Scrapen oeffnet als Drawer im Cockpit (kein Full-Page-Weg).
// ---------------------------------------------------------------------------
test('6) Scrapen oeffnet als Drawer im Cockpit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })

  // Warten bis Cockpit bereit ist
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })

  // Leads-Modus aktivieren (Scrapen-Aktion erscheint nur im Lead-Modus)
  await page.getByRole('button', { name: 'Leads' }).first().click()

  // Scrapen-Aktion im Cockpit ausloesen
  await page.getByRole('button', { name: 'Scrapen (Google Places)' }).first().click()

  // Drawer muss sich IM Cockpit oeffnen — stabiler Text-Anker aus ScrapePanel heading
  await expect(page.getByText('Leads scrapen', { exact: false })).toBeVisible({ timeout: 60_000 })

  // URL darf NICHT auf /admin/partner-leads navigiert haben
  expect(page.url()).toContain('/admin/vertrieb')

  await page.screenshot({ path: 'test-results/vertrieb-cockpit-6-scrape.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 7 — Basis-Freigaben oeffnet als Drawer im Cockpit (kein Full-Page-Weg).
// ---------------------------------------------------------------------------
test('7) Basis-Freigaben oeffnet als Drawer im Cockpit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })

  // Warten bis Cockpit bereit ist
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })

  // Sachverstaendige-Pill aktivieren damit die Basis-Freigaben-Aktion erscheint
  await page.getByRole('button', { name: 'Sachverständige' }).first().click()

  // Basis-Freigaben-Aktion im Cockpit ausloesen
  await page.getByRole('button', { name: 'Basis-Freigaben' }).first().click()

  // Drawer muss sich IM Cockpit oeffnen — heading aus BasisFreigabenDrawerContent,
  // NICHT der gleichlautende Aktions-Button (Strict-Mode-Ambiguitaet vermieden).
  await expect(page.getByRole('heading', { name: 'Basis-Freigaben' })).toBeVisible({ timeout: 60_000 })

  // URL darf NICHT auf /admin/sachverstaendige/basic-freigaben navigiert haben
  expect(page.url()).toContain('/admin/vertrieb')

  await page.screenshot({ path: 'test-results/vertrieb-cockpit-7-freigaben.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 8 — Werkstatt-anlegen oeffnet als Drawer im Cockpit (kein Full-Page-Weg).
// ---------------------------------------------------------------------------
test('8) Werkstatt-anlegen oeffnet als Drawer im Cockpit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })

  // Warten bis Cockpit bereit ist
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })

  // Werkstaetten-Pill aktivieren damit die Werkstatt-anlegen-Aktion erscheint
  await page.getByRole('button', { name: 'Werkstätten' }).first().click()

  // Werkstatt-anlegen-Aktion im Cockpit ausloesen
  await page.getByRole('button', { name: 'Werkstatt anlegen' }).first().click()

  // Drawer muss sich IM Cockpit oeffnen — Heading aus WerkstattAnlegenForm,
  // NICHT der gleichlautende Aktions-Button (Strict-Mode-Ambiguitaet vermieden).
  await expect(page.getByRole('heading', { name: 'Werkstatt anlegen' })).toBeVisible({ timeout: 60_000 })

  // URL darf NICHT auf /admin/vertrieb/werkstaetten navigiert haben
  expect(page.url()).toContain('/admin/vertrieb')

  await page.screenshot({ path: 'test-results/vertrieb-cockpit-8-werkstatt-anlegen.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 9 — Makler-anlegen oeffnet als Drawer im Cockpit (kein Full-Page-Weg).
// ---------------------------------------------------------------------------
test('9) Makler-anlegen oeffnet als Drawer im Cockpit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })

  // Warten bis Cockpit bereit ist
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })

  // Makler-Pill aktivieren damit die Makler-anlegen-Aktion erscheint
  await page.getByRole('button', { name: 'Makler' }).first().click()

  // Makler-anlegen-Aktion im Cockpit ausloesen
  await page.getByRole('button', { name: 'Makler anlegen' }).first().click()

  // Drawer muss sich IM Cockpit oeffnen — getByRole heading "Makler anlegen"
  // (nicht der gleichlautende Aktions-Button; getByRole = heading-Rolle, nicht button).
  await expect(page.getByRole('heading', { name: 'Makler anlegen' })).toBeVisible({ timeout: 60_000 })

  // URL darf NICHT auf /admin/vertrieb/makler navigiert haben
  expect(page.url()).toContain('/admin/vertrieb')

  await page.screenshot({ path: 'test-results/vertrieb-cockpit-9-makler-anlegen.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 10 — Firmen-Flotten (B2B) oeffnet als Drawer im Cockpit (Phase C).
//      Dedizierter, IMMER sichtbarer Einstieg (KEIN Rollen-Pill) -> Drawer mit
//      FirmenFlotteAdminClient (Liste + Anlage). Read-only: nur oeffnen, kein Anlegen.
// ---------------------------------------------------------------------------
test('10) Firmen-Flotten oeffnet als Drawer im Cockpit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })

  // Warten bis Cockpit bereit ist
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })

  // 'Firmen-Flotte anlegen' — globaler Einstieg (kein Pill), oeffnet den Anlage-Drawer.
  await page.getByRole('button', { name: 'Firmen-Flotte anlegen' }).first().click()

  // Drawer muss sich IM Cockpit oeffnen — PageHeader-Titel aus FirmenFlotteAdminClient.
  // exact:true trennt "Firmen-Flotten-Konten" (Drawer-Titel) vom Button "Firmen-Flotten".
  await expect(page.getByText('Firmen-Flotten-Konten', { exact: true })).toBeVisible({ timeout: 60_000 })

  // URL bleibt im Cockpit (kein Full-Page-Weg auf /admin/firmen-flotte).
  expect(page.url()).toContain('/admin/vertrieb')

  await page.screenshot({ path: 'test-results/vertrieb-cockpit-10-firmen-flotte.png', fullPage: true }).catch(() => {})
})

// ---------------------------------------------------------------------------
// 11 — Firmen-Flotten als voller Partner-Typ: Pill -> Roster -> volle Akte im Cockpit.
// ---------------------------------------------------------------------------
test('11) Firmen-Flotten-Pill + volle Akte im Cockpit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ADMIN.email, ADMIN.pw)
  await page.goto('/admin/vertrieb', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Sachverständige' })).toBeVisible({ timeout: 90_000 })

  // Firmen-Flotten-Pill (Rollen-Chip) aktivieren — exact:true trennt vom Button 'Firmen-Flotte anlegen'.
  const pill = page.getByRole('button', { name: 'Firmen-Flotten', exact: true })
  await expect(pill.first(), 'Firmen-Flotten-Pill muss existieren').toBeVisible({ timeout: 15_000 })
  await pill.first().click()

  // Falls Flotten existieren: erste Zeile -> PartnerCockpit -> Vollstaendige Akte -> Sektionen.
  await page.waitForTimeout(2500)
  const rows = page.locator('table tbody tr')
  const n = await rows.count()
  test.skip(n === 0, 'keine Firmen-Flotten im Roster — Akte-Pfad nicht testbar')
  await rows.first().click()
  const akteBtn = page.getByRole('button', { name: 'Vollständige Akte öffnen' })
  await expect(akteBtn).toBeVisible({ timeout: 15_000 })
  await akteBtn.click()
  // Akte-Sektion im @drawer-Intercept ('Schaden-Karten' ist eindeutig zur Akte).
  await expect(page.getByText('Schaden-Karten', { exact: false })).toBeVisible({ timeout: 30_000 })
  expect(page.url(), 'Akte bleibt im Cockpit-Segment').toContain('/admin/vertrieb/firmen-flotte/')
  await page.screenshot({ path: 'test-results/vertrieb-cockpit-11-firmen-flotte-akte.png', fullPage: true }).catch(() => {})
})
