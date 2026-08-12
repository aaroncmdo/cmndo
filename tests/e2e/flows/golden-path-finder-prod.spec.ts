import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  seedThrowawayFinderSv,
  purgeThrowawayFinderSv,
  purgeStaleThrowawayFinderSvs,
  type ThrowawayFinderSv,
} from '../lib/test-sv'

// Golden-Path FINDER E2E — der zweite Entry (Gutachter-Finder) im echten Browser gegen Prod.
// Companion zu golden-path-prod.spec.ts (Entry via /schaden-melden) +
// golden-path-completion-prod.spec.ts (Abschluss).
//
// Beweist: Adresse -> Engine-Match -> Slot -> Schadenart -> Buchung -> gfa -> Termin.
// Anders als /schaden-melden faehrt DIESE Strecke die SV-Matching-Engine (findBestSV) +
// Isochrone-Zustaendigkeit + Slot-Generierung — und mit dem Submit den Chokepoint
// reserviere(), in dem der Ops-Test-Bug (RC-1: Zusage ohne Termin) sass.
//
// Der Submit war zwischenzeitlich nicht durchfuehrbar (Test-SV-Guard, s. Historie unten);
// aufgeloest durch die E2E-Fixture-Kennzeichnung (Mig 20260812152026), die
// seedThrowawayFinderSv setzt. Kontext:
// memory/BROADCAST-finder-buchung-prod-nicht-smokebar.md
//
// FIXTURE (seit Befund #6, 17.07.): der globale Embed-Pool (ladeEmbedMatching ->
// planeTerminMitFallback -> findBestSV -> applyDispatchableFilter) filtert `.eq('ist_testaccount',
// false)` — ein Test-Account taucht dort NICHT mehr auf. Der Guard braucht daher einen ECHTEN
// (ist_testaccount=false) dispatchbaren SV. Wir seeden ihn TRANSIENT (beforeAll) und LOESCHEN ihn
// vollstaendig (afterAll: auth+profiles+sachverstaendige + evtl. Buchungs-Artefakte). Kein
// Produktions-Code-Change, keine Migration.
//
// PARTNER-SICHER (vier unabhaengige Ebenen):
//   1. TRANSIENT + GELOESCHT: nur waehrend des ~90s-Laufs existent, danach restlos entfernt
//      (+ Selbstheilung purgeStaleThrowawayFinderSvs raeumt Leichen abgestuerzter Laeufe).
//   2. OBSKUR: der SV sitzt auf Pellworm (faehr-isolierte Insel, ~1200 Ew. -> ~0 Finder-Traffic;
//      Isochrone offshore, Husum/Festland ausgeschlossen) -> praktisch keine echte Anfrage matcht ihn.
//   3. INTERNE BUCHER-IDENTITAET: der Bucher ist @claimondo.de => istInterneIdentitaet
//      => Send-Isolation (#3709) => keine echten Comms/Dispatch-Tasks. (Dieselbe Eigenschaft
//      blockt beim SUBMIT den Test-SV-Guard — s. den test.skip unten.)
//   4. OPT-IN: laeuft NUR mit RUN_GOLDEN_PATH_PROD=1 (nie in CI) -> Exposition nur bei bewusstem Lauf.
//
// Opt-in (nie in CI): RUN_GOLDEN_PATH_PROD=1 + SUPABASE_SERVICE_ROLE_KEY (Fixture/Verify).

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

test('Finder-Buchung: Wegwerf-SV am obskuren Ort bis Termin reserviert', async ({ page }) => {
  test.setTimeout(150_000)
  const db = admin()
  const runId = String(Date.now())
  const email = `e2e-finder-${runId}@claimondo.de` // istInterneIdentitaet -> Send-Isolation
  bucherEmail = email // fuer afterAll-Cleanup (Full-Submit-Artefakte)

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
  await expect(slot, 'Slot des Wegwerf-SV erscheint (= er ist der zustaendige Partner am Ort)').toBeVisible({ timeout: 30_000 })
  await slot.click()

  // ── Step 3 (Schaden): Schadenart waehlen ──
  await vis(page, 'button:has-text("Auffahrunfall")').click()

  // ── Step 4 (Kontakt): Formular + DSGVO -> reservieren ──
  await vis(page, 'input[autocomplete="given-name"]').fill('E2eFinder')
  await vis(page, 'input[autocomplete="family-name"]').fill('Smoke')
  await vis(page, 'input[autocomplete="tel"]').fill('+491633628571') // Test-WA (send-isolation greift ohnehin)
  await vis(page, 'input[autocomplete="email"]').fill(email)
  await vis(page, 'input[type="checkbox"]').check()

  // ── Step 5: absenden + Bestaetigung ───────────────────────────────────────────────────
  await expect(vis(page, 'button:has-text("Termin reservieren")'), 'Buchen-Button bereit').toBeEnabled()
  await vis(page, 'button:has-text("Termin reservieren")').click()
  await expect(vis(page, ':text("Termin reserviert")'), 'Bestätigung "Termin reserviert"').toBeVisible({ timeout: 25_000 })

  // ── Verify (service-role): gfa dem Wegwerf-SV zugeordnet (Partner-Matching) ──
  await page.waitForTimeout(2_500) // revalidate + gfa.termin_id-Update
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, zugeordneter_sv_id, matching_typ, termin_id')
    .eq('email', email)
    .maybeSingle()
  expect(gfa?.zugeordneter_sv_id, 'gfa dem Wegwerf-SV zugeordnet').toBe(TEST_SV)
  expect(gfa?.matching_typ, 'Partner-Matching (nicht Dead-Pin)').toBe('partner')
  // Die Zusage darf nicht leer sein — genau das war der Ops-Test-Bug (RC-1): "Termin
  // reserviert" bei termin_id = NULL.
  expect(gfa?.termin_id, 'Zusage gegeben => Termin existiert wirklich').toBeTruthy()

  // Send-Isolation (PR #3709): der interne @claimondo.de-Bucher darf KEINEN Dispatch-Task
  // ausgeloest haben — verifiziert, dass der Test das Team nicht stoert.
  const { data: tasks } = await db
    .from('mitteilungen')
    .select('id')
    .eq('route_url', `/dispatch/gutachter-finder/${gfa?.id}`)
  expect(tasks?.length ?? 0, 'interne Buchung -> kein Dispatch-Task (Send-Isolation #3709)').toBe(0)
  console.log(`[golden-finder] gfa ${gfa?.id} -> Wegwerf-SV ${TEST_SV}, Termin ${gfa?.termin_id}, 0 Team-Tasks ✓`)
})

// ── Historie zum Submit-Zweig (12.08.) — damit die Kernursache nicht verloren geht ──────
// Dieser Zweig war zwischenzeitlich ein `test.skip`: er assertete `"Termin reserviert"`,
// konnte das auf prod aber nicht halten. Der Buchungs-Chokepoint `reserviere()` faehrt den
// Test-SV-Guard (nach dem Vorfall 03.07.), dessen Matrix (interner Lead, ECHTER SV) blockt —
// eine Kombination, die hier unvermeidbar war: ein Test-SV wird von applyDispatchableFilter
// aus dem Matching gefiltert, der Wegwerf-SV musste also `ist_testaccount=false` tragen, und
// ein nicht-interner Bucher haette die Send-Isolation ausgehebelt. Verdeckt wurde das von der
// ENV `FINDER_E2E_DRYRUN` (ohne sie rot, mit ihr uebersprungen — beides ohne Signal).
// Aufgeloest durch die E2E-Fixture-Kennzeichnung (Mig 20260812152026): fuer das MATCHING
// echt, fuer den GUARD Test. seedThrowawayFinderSv traegt den Eintrag, ON DELETE CASCADE
// raeumt ihn mit dem SV ab. Kontext: memory/BROADCAST-finder-buchung-prod-nicht-smokebar.md

// Crash-Recovery: alle Wegwerf-SV-Leichen (auth+profiles+sachverstaendige) restlos entfernen,
// falls ein abgebrochener Lauf welche liegen liess.
//   RESET_FINDER_TEST_SV=1 RUN_GOLDEN_PATH_PROD=1 npx playwright test golden-path-finder-prod -g reset
test('reset — Wegwerf-SV-Leichen entfernen (Crash-Recovery)', async () => {
  test.skip(!process.env.RESET_FINDER_TEST_SV, 'set RESET_FINDER_TEST_SV=1 um nur aufzuraeumen')
  await purgeStaleThrowawayFinderSvs(admin())
  console.log('[golden-finder] Wegwerf-SV-Leichen entfernt (reset)')
})

// ── j01 Schritt 2 (Wunschtermin-Zweig) + Schritt 3 (Termin-Uebernahme + sv-gesucht-Cursor) ──
// D1-Nachzug fuer PR #5012 (Spec docs/superpowers/specs/2026-08-05-kunde-termin-funnel-design.md):
// Der Dead-Pin-/Wunschtermin-Zweig (Slot ohne echten Partner -> dispatch_pending -> Kunde sieht
// "wird bestätigt" -> Dispatch-Queue) ist hier noch NICHT automatisiert, weil er ein Dead-Pin-
// Fixture braucht (Region MIT sv_leads-Pin, OHNE echte Partner — Buchungen bei echten Partner-SVs
// sind TABU) und der deterministische Portal-Einstieg erst mit T4 (Akte-CTA + Kalender-Engine-
// Findung) existiert. Interim-Nachweis laut PR-Smoke-Plan: DB-Proben (Loader-Filter gegen
// Backfill-Claim, operative_status='sv-gesucht' der naechsten Dead-Pin-Konversion) + Playwright-
// Badge-Assert auf einem Backfill-Claim. Ausbau: mit T4 analog zum Pellworm-Wegwerf-SV-Muster
// dieser Datei (Wegwerf-sv_lead-Pin statt Wegwerf-SV).
test.skip('j01 Schritt 2+3: Wunschtermin-Zweig (Dead-Pin) bis "wird bestätigt" in der Akte', () => {
  // T4: Dead-Pin-Fixture + Akte-CTA — siehe Kommentar oben.
})
