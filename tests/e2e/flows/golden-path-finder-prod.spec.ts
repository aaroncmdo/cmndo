import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  seedThrowawayFinderSv,
  purgeThrowawayFinderSv,
  purgeStaleThrowawayFinderSvs,
  type ThrowawayFinderSv,
} from '../lib/test-sv'

// Golden-Path FINDER-Matching E2E — der zweite Entry (Gutachter-Finder) im echten Browser,
// gegen Prod. Companion zu golden-path-prod.spec.ts (Entry via /schaden-melden) +
// golden-path-completion-prod.spec.ts (Abschluss).
//
// Beweist: der globale Finder-Matching-Pfad (Adresse -> findBestSV -> Isochrone-Zustaendigkeit
// -> Slot-Generierung -> Slot-Anzeige -> Buchungs-Bereitschaft) laeuft end-to-end. Anders als
// /schaden-melden faehrt DIESE Strecke die SV-Matching-Engine.
//
// FIXTURE (seit Befund #6, 17.07.): der globale Embed-Pool (ladeEmbedMatching ->
// planeTerminMitFallback -> findBestSV -> applyDispatchableFilter) filtert `.eq('ist_testaccount',
// false)` — ein Test-Account taucht dort NICHT mehr auf. Der Guard braucht daher einen ECHTEN
// (ist_testaccount=false) dispatchbaren SV. Wir seeden ihn TRANSIENT (beforeAll) + LOESCHEN ihn
// vollstaendig (afterAll). Kein Produktions-Code-Change, keine Migration.
//
// CEILING — warum der Test bei der Buchungs-BEREITSCHAFT stoppt (NICHT beim Kalender-Write):
//   ein SICHERER Full-Submit ist auf DIESER (globalen) Strecke architektonisch unmoeglich. Der
//   Test-Guard (test-sv-guard.ts:22) blockt intern->echt am Buchungs-Chokepoint. Also:
//     * echter SV (fuer den Pool, Befund #6) + interner Bucher (fuer Send-Isolation) -> Guard BLOCKT.
//     * echter SV + echter Bucher -> echte Comms (Kollateral) -> verboten.
//   Der Kalender-Write (reserviereEmbedTermin) ist durch echten Prod-Traffic ohnehin abgedeckt;
//   die sicher testbare Tiefe endet an "Termin reservieren ist aktiv". (Die tatsaechliche Buchung
//   eines TEST-SV durch eine interne Identitaet ginge nur ueber den FIXER-/Karten-Pin-Pfad — ein
//   SEPARATER Guard, nicht diese globale Matching-Strecke.)
//
// PARTNER-SICHER:
//   1. KEIN Submit: der Test bucht NICHTS (stoppt vor dem Kalender-Write) -> kein Lead/Termin/Comms.
//   2. TRANSIENT + GELOESCHT: der Wegwerf-SV existiert nur ~90s, danach restlos entfernt
//      (+ Selbstheilung purgeStaleThrowawayFinderSvs; die Bucher-Artefakt-Reinigung bleibt Defense).
//   3. OBSKUR: Pellworm (faehr-isolierte Insel, ~0 Finder-Traffic; Isochrone offshore, Husum aus).
//   4. OPT-IN: laeuft NUR mit RUN_GOLDEN_PATH_PROD=1 (nie in CI).
//
// Opt-in (nie in CI): RUN_GOLDEN_PATH_PROD=1 + SUPABASE_SERVICE_ROLE_KEY (Fixture/Cleanup).

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
// In beforeAll auf die id des frisch geseedeten Wegwerf-SV gesetzt (kein Hardcode — der alte
// Default 1da11741… war nach einem Golive-Cleanup tot; und ein Test-Account waere seit Befund #6
// ohnehin aus dem globalen Matching gefiltert).
let TEST_SV = ''
let svHandle: ThrowawayFinderSv | null = null
let bucherEmail: string | null = null // Bucher-Identitaet des Laufs -> Full-Submit-Cleanup

// Pellworm / Tammensiel (Insel, faehr-isoliert, ~0 Finder-Traffic, keine Festland-SV-Isochrone
// erreicht sie). Reale Strassenadresse (types:['address'] braucht street-level) fuer die Google-
// Places-Autocomplete; Koordinate aus OSM/Nominatim.
const PELLWORM = { lat: 54.5237, lng: 8.6831, adresse: 'Tammensiel 1, 25849 Pellworm' }
// Grosszuegige synthetische Isochrone (parseIsochrone Format A: [{lat,lng}]) — deckt die Insel +
// Umgebung, absorbiert Geocode-Varianz. Bleibt offshore: Husum (~9.05E, naechster SV-Ort) liegt
// ausserhalb der Ost-Kante (8.84) => kein Festland-SV-Standort im Polygon.
const ISO_BOX = [
  { lat: 54.40, lng: 8.53 },
  { lat: 54.40, lng: 8.84 },
  { lat: 54.65, lng: 8.84 },
  { lat: 54.65, lng: 8.53 },
  { lat: 54.40, lng: 8.53 },
]

test.skip(!process.env.RUN_GOLDEN_PATH_PROD, 'set RUN_GOLDEN_PATH_PROD=1 (läuft echt gegen Prod)')
test.describe.configure({ mode: 'serial' })

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

test.beforeAll(async () => {
  const db = admin()
  await purgeStaleThrowawayFinderSvs(db) // Leichen abgestuerzter Vorlaeufe zuerst entfernen
  svHandle = await seedThrowawayFinderSv(db, {
    lat: PELLWORM.lat,
    lng: PELLWORM.lng,
    isochrone: ISO_BOX,
    runId: String(Date.now()),
  })
  TEST_SV = svHandle.svId
  // Warmup: der Finder-Match/Verfuegbarkeits-Layer braucht ~30–60s, bis ein FRISCH geseedeter SV
  // matchbar ist -> ein kurzer Vorlauf + der grosszuegige Step-2-Poll (60s) unten machen den Guard
  // first-try-gruen statt nur retry-gruen (Flake-Ursache empirisch: Step-2-Slot bei t<30s leer).
  await new Promise((r) => setTimeout(r, 8_000))
})

test.afterAll(async () => {
  const db = admin()
  // Full-Submit-Artefakte (gfa/Lead/Termin) + den Wegwerf-SV restlos entfernen. purgeStale faengt
  // zusaetzlich einen Rest ab, falls svHandle wegen eines Seed-Fehlers null blieb.
  await purgeThrowawayFinderSv(db, { svId: svHandle?.svId ?? null, uid: svHandle?.uid ?? null, bucherEmail })
  await purgeStaleThrowawayFinderSvs(db)
})

// Der Embed rendert den Wizard 2x (Desktop-Sidebar + Mobile-Sheet); auf Desktop ist genau EINE
// Instanz sichtbar. Alle Locator daher :visible + first() -> konsistent dieselbe (sichtbare) Instanz.
const vis = (page: Page, selector: string) => page.locator(`${selector} >> visible=true`).first()

test('Finder-Matching: Wegwerf-SV am obskuren Ort bis Buchungs-Bereitschaft', async ({ page }) => {
  test.setTimeout(150_000)
  const runId = String(Date.now())
  const email = `e2e-finder-${runId}@claimondo.de` // istInterneIdentitaet -> Send-Isolation (Defense; kein Submit)
  bucherEmail = email // afterAll-Cleanup (Defense, falls je ein Submit ergaenzt wird)

  // Desktop-Viewport erzwingen -> die inline GooglePlaceAutocomplete (statt Mobil-Overlay).
  await page.setViewportSize({ width: 1366, height: 900 })

  // Direkt auf die Embed-Seite (kein aeusseres iframe -> robuster; identischer Buchungspfad).
  await page.goto(`${APP}/embed/gutachter-finder`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 3_000 })
    .catch(() => {})
  await page.waitForTimeout(2_500)

  // ── Step 1 (Ort): Adresse tippen -> Google-Places-Suggestion klicken ──
  // types:['address'] => echte Strassenadresse; Auswahl per CLICK (Enter ist im Widget unterdrueckt).
  const addr = vis(page, 'input[placeholder="Adresse eingeben…"]')
  await expect(addr, 'Adress-Eingabe sichtbar').toBeVisible({ timeout: 20_000 })
  await addr.click()
  await addr.pressSequentially(PELLWORM.adresse, { delay: 60 }) // triggert Places-Predictions zuverlaessiger als fill()
  const pac = page.locator('.pac-item').first()
  await expect(pac, 'Google-Places-Suggestion erscheint').toBeVisible({ timeout: 15_000 })
  await pac.click()

  // ── Step 2 (Termin): der Wegwerf-SV ist am obskuren Ort der EINZIGE zustaendige Partner -> Slot ──
  const slot = vis(page, `[data-testid^="buchung-slot-${TEST_SV}-"]`)
  await expect(slot, 'Slot des Wegwerf-SV erscheint (= er ist der zustaendige Partner am Ort)').toBeVisible({ timeout: 60_000 })
  await slot.click()

  // ── Step 3 (Schaden): Schadenart waehlen ──
  await vis(page, 'button:has-text("Auffahrunfall")').click()

  // ── Step 4 (Kontakt): Formular + DSGVO ausfuellen -> "Termin reservieren" wird aktiv ──
  await vis(page, 'input[autocomplete="given-name"]').fill('E2eFinder')
  await vis(page, 'input[autocomplete="family-name"]').fill('Smoke')
  await vis(page, 'input[autocomplete="tel"]').fill('+491633628571') // Test-WA (irrelevant: KEIN Submit)
  await vis(page, 'input[autocomplete="email"]').fill(email)
  await vis(page, 'input[type="checkbox"]').check()

  // ── CEILING: Buchungs-Bereitschaft (KEIN Submit) ──
  // Der aktive Button beweist: Fixture + globales findBestSV-Matching + Isochrone-Zustaendigkeit
  // + Slot-Generierung + Slot-Anzeige + Wizard-Flow sind durchgelaufen. Der eigentliche
  // Kalender-Write (reserviereEmbedTermin) ist auf DIESER Strecke nicht SICHER testbar: der
  // Test-Guard (test-sv-guard.ts:22) blockt intern->echt, und ein echter Bucher wuerde echte
  // Comms ausloesen (s. Header „CEILING"). Kein Submit -> kein Lead/Termin/Comms.
  await expect(
    vis(page, 'button:has-text("Termin reservieren")'),
    'Buchen-Button bereit (Fixture + globales Matching + Slot + Wizard OK)',
  ).toBeEnabled()
  console.log(`[golden-finder] Ort→Wegwerf-SV ${TEST_SV}-Slot→Schaden→Formular OK, Buchungs-Bereitschaft ✓`)
})

// Crash-Recovery: alle Wegwerf-SV-Leichen (auth+profiles+sachverstaendige) restlos entfernen,
// falls ein abgebrochener Lauf welche liegen liess.
//   RESET_FINDER_TEST_SV=1 RUN_GOLDEN_PATH_PROD=1 npx playwright test golden-path-finder-prod -g reset
test('reset — Wegwerf-SV-Leichen entfernen (Crash-Recovery)', async () => {
  test.skip(!process.env.RESET_FINDER_TEST_SV, 'set RESET_FINDER_TEST_SV=1 um nur aufzuraeumen')
  await purgeStaleThrowawayFinderSvs(admin())
  console.log('[golden-finder] Wegwerf-SV-Leichen entfernt (reset)')
})
