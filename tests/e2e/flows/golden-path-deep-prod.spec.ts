import { test, expect, type FileChooser } from '@playwright/test'
import { execSync } from 'node:child_process'
import {
  loginContext,
  loginContextOrSkip,
  skipIfAuthWall,
  assertRow,
  pollRow,
  APP,
  CLAIMS,
  AUFTRAEGE,
  PFLICHTDOK,
} from './_golden-path-lib'

// Deep Golden-Path gegen Prod — opt-in, serial, nie in CI. Fährt die SP1-Fixtures
// je Rolle bis zur Kern-CTA (klicken + absenden + DB-Assert).
//
// Run:
//   set -a; source <(grep -E 'NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY' ../../../.env.local); set +a
//   RUN_GOLDEN_PATH_DEEP=1 npx playwright test golden-path-deep-prod --workers=1 --reporter=line
//
// TEST_SV_PASSWORD muss man nicht mehr setzen — der Default in _golden-path-lib.ts (ROLES)
// traegt jetzt den gemessenen Wert. Frueher stand hier 'Claimondo-SV-Smoke-2026';
// nachgemessen am 20.08. per echtem Login: dieses Passwort wird abgelehnt, test-sv@ traegt
// `Claimondo2026!`.
test.describe.configure({ mode: 'serial' })
test.skip(!process.env.RUN_GOLDEN_PATH_DEEP, 'set RUN_GOLDEN_PATH_DEEP=1 (läuft echt gegen Prod)')

// Fixtures auf Kanon-Zustand zurücksetzen (deep mutiert sie; SV-Submit setzt hochgeladen).
test.beforeAll(() => {
  execSync('npx tsx scripts/test-fixtures/provision.ts', { env: process.env, stdio: 'inherit' })
})

test('SV #3729 — Stellungnahme einreichen (C2) → auftrag hochgeladen', async ({ browser }) => {
  test.setTimeout(90_000)
  test.skip(!process.env.TEST_SV_PASSWORD, 'TEST_SV_PASSWORD nicht gesetzt')
  const ctx = await loginContextOrSkip(browser, 'sv')
  const page = await ctx.newPage()

  // 1. Fallseite — der #3729-Banner-CTA muss erreichbar sein.
  await page.goto(`${APP}/gutachter/fall/${CLAIMS.c2}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  skipIfAuthWall(page) // interne Rolle: an der 2FA-Wand skippen statt failen (aal1-Injection reicht nicht mehr)
  // #3729-Regression: der Stellungnahme-CTA MUSS erreichbar sein (war in Prod tot bis #3816).
  const cta = page.getByRole('link', { name: /Stellungnahme einreichen/i }).first()
  await expect(cta, '#3729-CTA erreichbar').toBeVisible({ timeout: 15_000 })

  // 2. Zur Einreich-Seite per CTA-href (robuster als Klick — das SV-Portal-Hilfe-Widget
  //    liegt als Overlay über der Seite und fängt sonst den Klick ab).
  const href = (await cta.getAttribute('href')) ?? `/gutachter/fall/${CLAIMS.c2}/stellungnahme`
  await page.goto(`${APP}${href}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })

  // 3. Formular: Datei + Bestätigung + absenden. (Die Einreich-Seite muss überhaupt rendern —
  //    das deckte den claims-RLS-Bug auf: SV kam bis zum leeren notFound-Shell. Fix: Seite liest
  //    jetzt v_claim_base statt rohem claims!inner.)
  //    17.07. Wurzelbefund (3 Reruns + Fiber-/Console-Probe): setInputFiles aufs hidden input
  //    verpufft auf DIESER Seite — das synthetische change-Event erreicht Reacts Handler nicht
  //    (React-Fiber vorhanden, onClick lebt; echte User funktionieren). Deshalb den ECHTEN
  //    User-Pfad fahren: Dropzone-Klick -> FileChooser (bewiesen gruen).
  //    31.08. Zweiter Wurzelbefund — HYDRATION: Die Navigation oben wartet nur auf
  //    `domcontentloaded`. Da steht das SSR-HTML (die Dropzone ist sichtbar und fuer
  //    Playwright klickbar), aber Reacts onClick haengt noch nicht am Button. Ein Klick
  //    davor verpufft FOLGENLOS — kein Fehler, kein Event, der FileChooser kommt nie und
  //    die 15s laufen leer ab. Genau so scheiterte der Test am 31.08. zweimal in Folge,
  //    waehrend die Seite im Screenshot vollstaendig gerendert dasteht.
  //    Ein Zeitfenster ("warte 3s") waere geraten; deshalb wird auf den FileChooser SELBST
  //    gewartet und der Klick wiederholt — er ist der Beweis, dass der Handler haengt.
  const dateiAngezeigt = page.getByText('test-upload.pdf', { exact: false })
  await page.waitForLoadState('networkidle').catch(() => {})
  const dropzone = page.getByRole('button', { name: /Datei auswählen|max\. 20 MB/i }).first()
  await expect(dropzone, 'Dropzone sichtbar').toBeVisible({ timeout: 15_000 })

  let chooser: FileChooser | null = null
  for (let versuch = 1; versuch <= 3 && chooser === null; versuch++) {
    const wartetAufChooser = page.waitForEvent('filechooser', { timeout: 8_000 }).catch(() => null)
    await dropzone.click()
    chooser = await wartetAufChooser
  }
  // Bleibt er aus, ist der Upload fuer echte Nutzer kaputt — das ist ein BEFUND, kein Flake.
  expect(chooser, 'FileChooser nach Klick auf die Dropzone (Handler hydriert?)').toBeTruthy()
  if (chooser === null) return

  await chooser.setFiles('tests/e2e/fixtures/test-upload.pdf')
  await expect(dateiAngezeigt, 'Datei-State in React angekommen').toBeVisible({ timeout: 10_000 })
  await page.locator('input[type="checkbox"]').first().check()
  const submit = page.getByRole('button', { name: 'Stellungnahme einreichen' })
  await expect(submit, 'Submit-CTA enabled (file+bestaetigt)').toBeEnabled({ timeout: 10_000 })
  await submit.click()

  // 4. Erfolg → redirect zurück zur Fallseite + DB-Assert.
  await page.waitForURL(new RegExp(`/gutachter/fall/${CLAIMS.c2}$`), { timeout: 30_000 })
  await assertRow('auftraege', AUFTRAEGE.c2, { technische_stellungnahme_status: 'hochgeladen' })

  await ctx.close()
})

test('Kunde — Pflichtdok-Upload (C1) → pflichtdokument hochgeladen', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await loginContext(browser, 'kunde')
  const page = await ctx.newPage()

  // 1. Kunde-Fallakte (Route-Key=claim_id). onboarding_complete=true → kein /onboarding-Redirect;
  //    geschaedigter_user_id=kunde → pflichtdokumente-RLS liefert die Slots MIT pflichtdokument_id
  //    (claim_parties allein reicht der RLS nicht — Root des früheren "Slot noch nicht initialisiert").
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
  const ctx = await loginContextOrSkip(browser, 'kb')
  const page = await ctx.newPage()

  // 1. Interne Fallakte, direkt auf den Prozess-Tab (FallakteShell liest ?tab= → deep-linkbar,
  //    kein flakiger Tab-Klick). test-kb ist kundenbetreuer_id von C4 → RLS erlaubt die Anforderung.
  await page.goto(`${APP}/faelle/${CLAIMS.c4}?tab=prozess`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  skipIfAuthWall(page) // interne Rolle: an der 2FA-Wand skippen statt failen (aal1-Injection reicht nicht mehr)

  // 2. VsReaktionSection rendert (C4.kanzlei_faelle: vs_reaktion_typ='gekuerzt' → Section sichtbar +
  //    isKuerzt-Block; vs_kuerzungs_typ='technisch' + technische_stellungnahme_status=null → der CTA).
  const cta = page.getByRole('button', { name: /Stellungnahme von SV anfordern/i }).first()
  await expect(cta, 'KB-Anforderungs-CTA sichtbar').toBeVisible({ timeout: 15_000 })
  await cta.click()

  // 3. DB-driven: der Auftrag steht auf 'beauftragt' (requestTechnischeStellungnahme → auftraege).
  await pollRow('auftraege', AUFTRAEGE.c4, { technische_stellungnahme_status: 'beauftragt' }, 30_000)

  await ctx.close()
})
