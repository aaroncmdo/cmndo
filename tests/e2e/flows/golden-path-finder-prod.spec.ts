import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Golden-Path FINDER-Booking E2E — der zweite Entry (Gutachter-Finder) im echten Browser
// bis zum reservierten Termin, gegen Prod. Companion zu golden-path-prod.spec.ts (Entry via
// /schaden-melden) + golden-path-completion-prod.spec.ts (Abschluss).
//
// Beweist: der Finder-Buchungspfad (Adresse -> Engine-Match -> Slot -> Buchung -> gfa -> Lead
// -> Termin) laeuft end-to-end. Anders als /schaden-melden faehrt DIESE Strecke die
// SV-Matching-Engine (findBestSV) + Isochrone-Zustaendigkeit + Slot-Generierung.
//
// PARTNER-SICHER (vier unabhaengige Ebenen, staerkste zuerst):
//   1. GUARD (reserviere-Chokepoint): entscheideTestSvGuard blockt echter-Kunde<->Test-SV HART.
//      Die Test-Identitaet ist @claimondo.de => istInterneIdentitaet=true => test<->test erlaubt.
//   2. KARTEN-UNSICHTBARKEIT: ist_testaccount=true haelt den SV von ladeAktiveSVs (Karten-Pins) fern.
//   3. OBSKUR: der Test-SV sitzt auf Pellworm (faehr-isolierte Insel -> keine Festland-SV-Isochrone
//      erreicht sie; ~1200 Einwohner -> ~0 Finder-Traffic). Buchungs-Ort = Tammensiel (auf der Insel).
//   4. TRANSIENT: beforeAll aktiviert, afterAll re-sperrt den SV (idempotent). Crash-Reset via
//      RESET_FINDER_TEST_SV=1 (deaktiviert nur, ohne Test).
//
// WARUM das ohne Produktions-Code funktioniert: der Buchungspfad (ladeEmbedMatching ->
// planeTerminMitFallback -> findBestSV -> applyDispatchableFilter) filtert verifiziert+ist_aktiv+
// portal_zugang+gesperrt_seit, aber NICHT ist_testaccount. Ein AKTIVER Test-SV ist am obskuren
// Ort damit der einzige zustaendige Partner. Kein Code-Change, keine Migration.
//
// Opt-in (nie in CI): RUN_GOLDEN_PATH_PROD=1 + SUPABASE_SERVICE_ROLE_KEY (Fixture/Verify).

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const TEST_SV = process.env.GOLDEN_SV_ID ?? '1da11741-a406-45ce-a27b-c041576cccbb'

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

// Aktiviert den Test-SV am obskuren Ort + macht ihn dispatchable/buchbar. ist_testaccount BLEIBT
// true (Ebene 1+2). Idempotent: setzt IMMER denselben bekannten Zustand (heilt einen abgestuerzten
// Vorlauf selbst). Kontingent/Urlaub/Ablehnungen geleert -> hoch geranked, nicht geblockt.
async function aktiviereTestSv(db: ReturnType<typeof admin>) {
  const { error } = await db
    .from('sachverstaendige')
    .update({
      ist_aktiv: true,
      gesperrt_seit: null,
      standort_lat: PELLWORM.lat,
      standort_lng: PELLWORM.lng,
      standort_adresse: 'Pellworm (E2E-Test)',
      isochrone_polygon: ISO_BOX,
      paket_faelle_gesamt: 100,
      paket_faelle_genutzt: 0,
      offene_faelle: 0,
      ablehnungen_30_tage: 0,
      urlaub_von: null,
      urlaub_bis: null,
    })
    .eq('id', TEST_SV)
  if (error) throw new Error(`Test-SV aktivieren fehlgeschlagen: ${error.message}`)
}

// Re-sperrt den Test-SV -> raus aus dem Dispatchable-Pool (applyDispatchableFilter verlangt
// ist_aktiv=true AND gesperrt_seit IS NULL). Standort/Isochrone bleiben (harmlos: gesperrt +
// ist_testaccount = unsichtbar + un-buchbar). Best-effort; ein Fehler hier darf den Teardown nicht werfen.
async function deaktiviereTestSv(db: ReturnType<typeof admin>) {
  const { error } = await db
    .from('sachverstaendige')
    .update({ ist_aktiv: false, gesperrt_seit: new Date().toISOString() })
    .eq('id', TEST_SV)
  if (error) console.error('[golden-finder] Test-SV deaktivieren fehlgeschlagen:', error.message)
}

test.beforeAll(async () => {
  await aktiviereTestSv(admin())
})
test.afterAll(async () => {
  await deaktiviereTestSv(admin())
})

// Der Embed rendert den Wizard 2x (Desktop-Sidebar + Mobile-Sheet); auf Desktop ist genau EINE
// Instanz sichtbar. Alle Locator daher :visible + first() -> konsistent dieselbe (sichtbare) Instanz.
const vis = (page: Page, selector: string) => page.locator(`${selector} >> visible=true`).first()

test('Finder-Buchung: Test-SV am obskuren Ort bis Termin reserviert', async ({ page }) => {
  test.setTimeout(150_000)
  const db = admin()
  const runId = String(Date.now())
  const email = `e2e-finder-${runId}@claimondo.de` // istInterneIdentitaet -> Guard erlaubt test<->test

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

  // ── Step 2 (Termin): der Test-SV ist am obskuren Ort der EINZIGE Partner -> sein Slot erscheint ──
  const slot = vis(page, `[data-testid^="buchung-slot-${TEST_SV}-"]`)
  await expect(slot, 'Slot des Test-SV erscheint (= er ist der zustaendige Partner am Ort)').toBeVisible({ timeout: 30_000 })
  await slot.click()

  // ── Step 3 (Schaden): Schadenart waehlen ──
  await vis(page, 'button:has-text("Auffahrunfall")').click()

  // ── Step 4 (Kontakt): Formular + DSGVO -> reservieren ──
  await vis(page, 'input[autocomplete="given-name"]').fill('E2eFinder')
  await vis(page, 'input[autocomplete="family-name"]').fill('Smoke')
  await vis(page, 'input[autocomplete="tel"]').fill('+491633628571') // Test-WA (send-isolation greift ohnehin)
  await vis(page, 'input[autocomplete="email"]').fill(email)
  await vis(page, 'input[type="checkbox"]').check()
  await vis(page, 'button:has-text("Termin reservieren")').click()

  // ── Step 5: Bestaetigung ──
  await expect(vis(page, ':text("Termin reserviert")'), 'Bestätigung "Termin reserviert"').toBeVisible({ timeout: 25_000 })

  // ── Verify (service-role): gfa dem Test-SV zugeordnet (Partner-Matching) ──
  await page.waitForTimeout(2_500) // revalidate + gfa.termin_id-Update
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, zugeordneter_sv_id, matching_typ, termin_id')
    .eq('email', email)
    .maybeSingle()
  expect(gfa?.zugeordneter_sv_id, 'gfa dem Test-SV zugeordnet').toBe(TEST_SV)
  expect(gfa?.matching_typ, 'Partner-Matching (nicht Dead-Pin)').toBe('partner')

  // Send-Isolation (PR #3709): der interne @claimondo.de-Bucher darf KEINEN Dispatch-Task
  // ausgeloest haben — verifiziert, dass der Test das Team nicht stoert. (Gruen erst nach
  // Deploy von #3709; davor legt Prod noch den Task an -> das ist dann die RED-Baseline.)
  const { data: tasks } = await db
    .from('mitteilungen')
    .select('id')
    .eq('route_url', `/dispatch/gutachter-finder/${gfa?.id}`)
  expect(tasks?.length ?? 0, 'interne Buchung -> kein Dispatch-Task (Send-Isolation #3709)').toBe(0)
  console.log(`[golden-finder] gfa ${gfa?.id} -> Test-SV ${TEST_SV}, Termin ${gfa?.termin_id}, 0 Team-Tasks ✓`)
})

// Crash-Recovery: nur deaktivieren (falls ein abgebrochener Lauf den SV aktiv liess).
//   RESET_FINDER_TEST_SV=1 RUN_GOLDEN_PATH_PROD=1 npx playwright test golden-path-finder-prod -g reset
test('reset — Test-SV deaktivieren (Crash-Recovery)', async () => {
  test.skip(!process.env.RESET_FINDER_TEST_SV, 'set RESET_FINDER_TEST_SV=1 um nur zu deaktivieren')
  await deaktiviereTestSv(admin())
  console.log('[golden-finder] Test-SV deaktiviert (reset)')
})
