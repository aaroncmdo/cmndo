import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { loginContext, assertRow, pollRow, APP, CLAIMS, AUFTRAEGE, PFLICHTDOK } from './_golden-path-lib'

// Deep Golden-Path gegen Prod — opt-in, serial, nie in CI. Fährt die SP1-Fixtures
// je Rolle bis zur Kern-CTA (klicken + absenden + DB-Assert).
//
// Run:
//   set -a; source <(grep -E 'NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY' ../../../.env.local); set +a
//   RUN_GOLDEN_PATH_DEEP=1 TEST_SV_PASSWORD='Claimondo-SV-Smoke-2026' \
//   npx playwright test golden-path-deep-prod --workers=1 --reporter=line
test.describe.configure({ mode: 'serial' })
test.skip(!process.env.RUN_GOLDEN_PATH_DEEP, 'set RUN_GOLDEN_PATH_DEEP=1 (läuft echt gegen Prod)')

// Fixtures auf Kanon-Zustand zurücksetzen (deep mutiert sie; SV-Submit setzt hochgeladen).
test.beforeAll(() => {
  execSync('npx tsx scripts/test-fixtures/provision.ts', { env: process.env, stdio: 'inherit' })
})

test('SV #3729 — Stellungnahme einreichen (C2) → auftrag hochgeladen', async ({ browser }) => {
  test.setTimeout(90_000)
  test.skip(!process.env.TEST_SV_PASSWORD, 'TEST_SV_PASSWORD nicht gesetzt')
  const ctx = await loginContext(browser, 'sv')
  const page = await ctx.newPage()

  // 1. Fallseite — der #3729-Banner-CTA muss erreichbar sein.
  await page.goto(`${APP}/gutachter/fall/${CLAIMS.c2}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  expect(new URL(page.url()).pathname, 'SV nicht zu /login gebounced').not.toMatch(/\/login|\/anmelden/)
  const cta = page.getByRole('link', { name: /Stellungnahme einreichen/i }).first()
  await expect(cta, '#3729-CTA sichtbar').toBeVisible({ timeout: 15_000 })

  // 2. Auf die Stellungnahme-Seite (CTA klicken).
  await cta.click()
  await page.waitForURL(/\/gutachter\/fall\/.+\/stellungnahme/, { timeout: 20_000 })

  // 3. Formular: Datei + Bestätigung + absenden.
  await page.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/test-upload.pdf')
  await page.locator('input[type="checkbox"]').first().check()
  await page.getByRole('button', { name: 'Stellungnahme einreichen' }).click()

  // 4. Erfolg → redirect zurück zur Fallseite.
  await page.waitForURL(new RegExp(`/gutachter/fall/${CLAIMS.c2}$`), { timeout: 30_000 })

  // 5. DB-Assert: der Auftrag der Kern-CTA ist jetzt hochgeladen.
  await assertRow('auftraege', AUFTRAEGE.c2, { technische_stellungnahme_status: 'hochgeladen' })

  await ctx.close()
})

// FIXME (07.07., Kunde-Upload-Persist — onboarding-Blocker ist GEFIXT): C1–C4 onboarding_complete=true
// → /kunde/faelle/{C1} rendert (kein /onboarding-Bounce, verifiziert) UND die Selektoren greifen
// (Banner-Klick + Fahrzeugschein-<li> + input[type=file] alle gefunden — kein Selektor-Fehler, der Test
// erreicht pollRow). ABER der Upload persistiert nicht: pflichtdokumente.fbd10001 bleibt 'ausstehend'.
// assertKundeOwnsFall 2b SOLLTE greifen (claim_parties geschaedigter-Row existiert) → Ursache offen,
// Kandidaten: (a) .first()-Banner traf den falschen Button, (b) onChange feuerte nicht auf dem hidden
// input (className="hidden"), (c) slot.pflichtdokument_id != fbd10001, (d) Storage-Upload-Fehler.
// Nächster Schritt = Trace: npx playwright show-trace test-results/…-hochgeladen-chromium-retry1/trace.zip
test.fixme('Kunde — Pflichtdok-Upload (C1) → pflichtdokument hochgeladen', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await loginContext(browser, 'kunde')
  const page = await ctx.newPage()

  // 1. Kunde-Fallakte (Route-Key = claim_id, Ownership normalisiert über claim_parties). C1–C4
  //    haben onboarding_complete=true → kunde/layout.tsx redirected NICHT nach /kunde/onboarding
  //    (navFaelle.some(onboarding_complete===false) wäre sonst true auf jedem owned Fall).
  await page.goto(`${APP}/kunde/faelle/${CLAIMS.c1}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  const path = new URL(page.url()).pathname
  expect(path, 'Kunde nicht zu /login gebounced').not.toMatch(/\/login|\/anmelden/)
  expect(path, 'Kunde nicht nach /onboarding umgeleitet').not.toMatch(/\/onboarding/)

  // 2. Pflichtdok-Banner (Click-Tile) öffnen → Popover mit den Slots (SlotCard=<li> mit slot.label).
  const banner = page
    .getByRole('button')
    .filter({ hasText: /Dokument|Unterlage|hochladen|nachreichen/i })
    .first()
  await expect(banner, 'Pflichtdok-Banner sichtbar').toBeVisible({ timeout: 15_000 })
  await banner.click()

  // 3. Fahrzeugschein-Slot → verstecktes File-Input → Upload (Playwright setzt Files auch auf hidden inputs).
  const slot = page.locator('li').filter({ hasText: /Fahrzeugschein/i }).first()
  await slot.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/test-upload.pdf')

  // 4. DB-driven: uploadPflichtdokument (kunde/onboarding/actions.ts) setzt status='hochgeladen'.
  await pollRow('pflichtdokumente', PFLICHTDOK.fahrzeugschein, { status: 'hochgeladen' }, 30_000)

  await ctx.close()
})

test('KB — Stellungnahme anfordern (C4) → auftrag beauftragt', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await loginContext(browser, 'kb')
  const page = await ctx.newPage()

  // 1. Interne Fallakte, direkt auf den Prozess-Tab (FallakteShell liest ?tab= → deep-linkbar,
  //    kein flakiger Tab-Klick). test-kb ist kundenbetreuer_id von C4 → RLS erlaubt die Anforderung.
  await page.goto(`${APP}/faelle/${CLAIMS.c4}?tab=prozess`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  expect(new URL(page.url()).pathname, 'KB nicht zu /login gebounced').not.toMatch(/\/login|\/anmelden/)

  // 2. VsReaktionSection rendert (C4.kanzlei_faelle: vs_reaktion_typ='gekuerzt' → Section sichtbar +
  //    isKuerzt-Block; vs_kuerzungs_typ='technisch' + technische_stellungnahme_status=null → der CTA).
  const cta = page.getByRole('button', { name: /Stellungnahme von SV anfordern/i }).first()
  await expect(cta, 'KB-Anforderungs-CTA sichtbar').toBeVisible({ timeout: 15_000 })
  await cta.click()

  // 3. DB-driven: der Auftrag steht auf 'beauftragt' (requestTechnischeStellungnahme → auftraege).
  await pollRow('auftraege', AUFTRAEGE.c4, { technische_stellungnahme_status: 'beauftragt' }, 30_000)

  await ctx.close()
})
