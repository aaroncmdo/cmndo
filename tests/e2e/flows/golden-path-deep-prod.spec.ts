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

// FIXME (Golden-Path-Finding, 07.07.): test-kunde wird von /kunde/faelle/{C1} nach
// /kunde → /kunde/onboarding umgeleitet (KEIN /login-Bounce). Ursache: test-kunde ist
// geschädigter auf ALLEN 3 Fixture-Claims → die Kunde-Portal-Onboarding-Weiche ist
// mehrdeutig, die Fallseite rendert nicht. Sauberer Kunde-Flow braucht ein dediziertes
// Fixture (genau 1 klarer Kunde-Claim, past-onboarding) — nächster Schritt. Struktur +
// Selektoren (Banner→Popover→Fahrzeugschein-Slot) + DB-Assert (pollRow) stehen.
test.fixme('Kunde — Pflichtdok-Upload (C1) → pflichtdokument hochgeladen', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await loginContext(browser, 'kunde')
  const page = await ctx.newPage()

  // 1. Kunde-Fallseite (Route-Key = claim_id). Ownership läuft normalisiert über claim_parties.
  await page.goto(`${APP}/kunde/faelle/${CLAIMS.c1}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  expect(new URL(page.url()).pathname, 'Kunde nicht zu /login gebounced').not.toMatch(/\/login|\/anmelden/)

  // 2. Pflichtdok-Banner (Click-Tile) öffnen → Popover mit den Slots.
  const banner = page.getByRole('button').filter({ hasText: /Dokument|Unterlagen|Nachweis|hochladen/i }).first()
  await expect(banner, 'Pflichtdok-Banner sichtbar').toBeVisible({ timeout: 15_000 })
  await banner.click()

  // 3. Fahrzeugschein-Slot → verstecktes File-Input → Upload.
  const slot = page.locator('li').filter({ hasText: /Fahrzeugschein/i }).first()
  await slot.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/test-upload.pdf')

  // 4. DB-driven: warten bis der Upload den Slot auf 'hochgeladen' setzt.
  await pollRow('pflichtdokumente', PFLICHTDOK.fahrzeugschein, { status: 'hochgeladen' }, 30_000)

  await ctx.close()
})

// FIXME (Golden-Path-Finding, 07.07.): /faelle/{C4} rendert für test-kb (interne Fallakte, KEIN
// Auth-Gate) — gut. Aber der "Stellungnahme anfordern"-CTA (VsReaktionSection) erscheint nicht:
// der Fall zeigt "Vollständigkeits-Check erscheint sobald der Gutachter sein Gutachten hochgeladen
// hat" → die VS-Reaktions-Strecke braucht MEHR Lifecycle-State (Gutachten hochgeladen +
// gutachten_final_freigegeben + VS-Reaktion), nicht nur vs_kuerzungs_typ='technisch'. Das C4-Fixture
// (Claim + Auftrag + kanzlei_faelle) ist korrekt + prod-verifiziert; es fehlt der Gutachten/VS-State.
// → Deep-Flows brauchen volle Claim-Lifecycle-Fixtures (dedizierter Folgeschritt).
test.fixme('KB — Stellungnahme anfordern (C4) → auftrag beauftragt', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await loginContext(browser, 'kb')
  const page = await ctx.newPage()

  // 1. Interne Fallakte (test-kb ist kundenbetreuer_id von C4 → RLS erlaubt die Anforderung).
  await page.goto(`${APP}/faelle/${CLAIMS.c4}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  expect(new URL(page.url()).pathname, 'KB nicht zu /login gebounced').not.toMatch(/\/login|\/anmelden/)

  // 2. Prozess-Tab (die VsReaktionSection mit dem Anforderungs-CTA lebt dort).
  await page
    .getByRole('tab', { name: /prozess/i })
    .or(page.getByRole('link', { name: /^Prozess$/i }))
    .first()
    .click({ timeout: 15_000 })
    .catch(() => {})

  // 3. "Stellungnahme anfordern" (sichtbar da C4.kanzlei_faelle.vs_kuerzungs_typ='technisch').
  const cta = page.getByRole('button', { name: /Stellungnahme anfordern/i }).first()
  await expect(cta, 'KB-Anforderungs-CTA sichtbar').toBeVisible({ timeout: 15_000 })
  await cta.click()

  // 4. DB-driven: warten bis der Auftrag auf 'beauftragt' steht (normalisiert auf auftraege).
  await pollRow('auftraege', AUFTRAEGE.c4, { technische_stellungnahme_status: 'beauftragt' }, 30_000)

  await ctx.close()
})
