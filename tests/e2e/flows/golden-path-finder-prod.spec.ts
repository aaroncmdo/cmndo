import { test, expect, type Page, type FrameLocator } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Golden-Path FINDER-Booking E2E — der zweite Entry (Gutachter-Finder) im echten Browser
// bis zum reservierten Termin, gegen Prod. Companion zu golden-path-prod.spec.ts (Entry via
// /schaden-melden) + golden-path-completion-prod.spec.ts (Abschluss).
//
// EINSTIEGSPUNKTE (data-driven): der Finder-Buchungspfad wird aus JEDEM realen Modus gefahren:
//   - direct-embed   : app.claimondo.de/embed/gutachter-finder (Top-Level, kein iframe)
//   - marketing-iframe: claimondo.de/gutachter-finden (CROSS-ORIGIN iframe — der Haupt-Public-Weg;
//                       Google-Places laeuft hier unter 3rd-Party-Cookie/Storage-Restriktionen,
//                       was sich vom Top-Level unterscheiden kann → eigener Test).
//   (/start/makler & /start/werkstatt = derselbe iframe-Modus + Promo/werkstatt_id-Attribution;
//    die Attribution wird beim vollen Submit-Run verifiziert — Follow-up, s. Marker.)
//
// FRISCHER BROWSER = 2. GERAET: `serviceWorkers: 'block'` + Playwright-isolierter Context pro Test
// (keine Cookies/Storage/Cache/SW-Carryover). Die App hat einen echten SW (public/sw.js) → auf
// realen Geraeten cacht der SW alte Bundles ("auf anderen Geraeten anders"); der Smoke umgeht das
// und testet IMMER das frisch deployte Prod, wie ein neuer Nutzer auf einem neuen Geraet.
//
// PARTNER-SICHER (vier Ebenen): 1. reserviere()-Guard blockt echter-Kunde<->Test-SV HART.
//   2. ist_testaccount haelt den SV von der Karte fern. 3. obskurer Ort (Pellworm, faehr-isoliert).
//   4. transient: beforeAll aktiviert, afterAll re-sperrt. Crash-Reset: RESET_FINDER_TEST_SV=1.
//
// Opt-in (nie in CI): RUN_GOLDEN_PATH_PROD=1 + SUPABASE_SERVICE_ROLE_KEY (Fixture/Verify).
// Send-frei solange #3709 nicht auf Prod: FINDER_E2E_DRYRUN=1 (stoppt vor dem Submit).

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const FUNNEL = process.env.GOLDEN_FUNNEL_URL ?? 'https://claimondo.de'
const TEST_SV = process.env.GOLDEN_SV_ID ?? '1da11741-a406-45ce-a27b-c041576cccbb'

// Pellworm / Tammensiel (Insel, faehr-isoliert, ~0 Finder-Traffic, keine Festland-SV-Isochrone
// erreicht sie). Reale Strassenadresse (types:['address'] braucht street-level); Koordinate aus OSM.
const PELLWORM = { lat: 54.5237, lng: 8.6831, adresse: 'Tammensiel 1, 25849 Pellworm' }
// Grosszuegige synthetische Isochrone (parseIsochrone Format A) — deckt die Insel + Umgebung,
// bleibt offshore (Husum ~9.05E ausserhalb der Ost-Kante 8.84) => kein Festland-SV im Polygon.
const ISO_BOX = [
  { lat: 54.40, lng: 8.53 },
  { lat: 54.40, lng: 8.84 },
  { lat: 54.65, lng: 8.84 },
  { lat: 54.65, lng: 8.53 },
  { lat: 54.40, lng: 8.53 },
]

// Reale Einstiegspunkte des Finders (jeder = eigener Test, eigener frischer Browser-Context).
const ENTRIES: Array<{ name: string; url: string; iframe: boolean }> = [
  { name: 'direct-embed', url: `${APP}/embed/gutachter-finder`, iframe: false },
  { name: 'marketing-iframe', url: `${FUNNEL}/gutachter-finden`, iframe: true },
]

test.skip(!process.env.RUN_GOLDEN_PATH_PROD, 'set RUN_GOLDEN_PATH_PROD=1 (läuft echt gegen Prod)')
test.describe.configure({ mode: 'serial' })
// Frischer Browser als "2. Geraet": SW blockiert (kein gecachtes Bundle) + fester Desktop-Viewport
// (inline GooglePlaceAutocomplete statt Mobil-Overlay). Context ist ohnehin pro-Test isoliert.
test.use({ serviceWorkers: 'block', viewport: { width: 1366, height: 900 } })

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

// Aktiviert den Test-SV am obskuren Ort + macht ihn dispatchable/buchbar. ist_testaccount BLEIBT
// true. Idempotent: setzt IMMER denselben bekannten Zustand. Kontingent/Urlaub geleert -> buchbar.
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

// Re-sperrt den Test-SV -> raus aus dem Dispatchable-Pool. Best-effort (wirft nie im Teardown).
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

// Fuehrt die Buchungs-Strecke im gegebenen Root (Page = Top-Level, FrameLocator = iframe) bis zum
// Buchen aus. Der Embed rendert den Wizard 2x (Desktop-Sidebar + Mobile-Sheet) -> :visible + first()
// trifft konsistent die sichtbare Instanz. Gibt bei DRYRUN nach der Formular-Validierung zurueck.
async function fahreFinderStrecke(root: Page | FrameLocator, email: string): Promise<{ dryRun: boolean }> {
  const vis = (sel: string) => root.locator(`${sel} >> visible=true`).first()

  // ── Step 1 (Ort): reale Adresse tippen -> Google-Places-Suggestion klicken (Enter unterdrueckt) ──
  // Das Input zeigt "Google Maps lädt…" bis Googles JS geladen ist, dann erst "Adresse eingeben…".
  // Mit geblocktem SW (kein gecachtes Google-Maps-Bundle) kann der Kalt-Load dauern -> grosszuegig warten.
  const addr = vis('input[placeholder="Adresse eingeben…"]')
  await expect(addr, 'Adress-Eingabe sichtbar (Google Maps geladen)').toBeVisible({ timeout: 45_000 })
  await addr.click()
  await addr.pressSequentially(PELLWORM.adresse, { delay: 60 })
  const pac = root.locator('.pac-item').first() // pac-Dropdown haengt am (iframe-)document.body
  await expect(pac, 'Google-Places-Suggestion erscheint').toBeVisible({ timeout: 25_000 })
  await pac.click()

  // ── Step 2 (Termin): Test-SV = einziger Partner am Ort -> sein Slot erscheint ──
  const slot = vis(`[data-testid^="buchung-slot-${TEST_SV}-"]`)
  await expect(slot, 'Slot des Test-SV erscheint (= zustaendiger Partner am Ort)').toBeVisible({ timeout: 30_000 })
  await slot.click()

  // ── Step 3 (Schaden) ──
  await vis('button:has-text("Auffahrunfall")').click()

  // ── Step 4 (Kontakt): Formular + DSGVO ──
  await vis('input[autocomplete="given-name"]').fill('E2eFinder')
  await vis('input[autocomplete="family-name"]').fill('Smoke')
  await vis('input[autocomplete="tel"]').fill('+491633628571')
  await vis('input[autocomplete="email"]').fill(email)
  await vis('input[type="checkbox"]').check()

  // Dry-Run: alles bis zum Buchen validiert (Fixture, Google-Places, Matching, Slots, Formular),
  // aber NICHT absenden -> keine Sends/kein Lead. Send-freie Validierung solange #3709 nicht live.
  if (process.env.FINDER_E2E_DRYRUN) {
    await expect(vis('button:has-text("Termin reservieren")'), 'Buchen-Button bereit (Dry-Run)').toBeEnabled()
    return { dryRun: true }
  }
  await vis('button:has-text("Termin reservieren")').click()
  await expect(vis(':text("Termin reserviert")'), 'Bestätigung "Termin reserviert"').toBeVisible({ timeout: 25_000 })
  return { dryRun: false }
}

for (const entry of ENTRIES) {
  test(`Finder-Buchung via ${entry.name}`, async ({ page }) => {
    test.setTimeout(150_000)
    const db = admin()
    const email = `e2e-finder-${entry.name}-${Date.now()}@claimondo.de` // @claimondo.de -> Guard erlaubt test<->test

    await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Cookie-Consent auf der (Top-Level-)Seite wegklicken, falls vorhanden (Marketing hat einen Banner).
    await page.locator('.CookieConsent button, [class*="CookieConsent"] button').first().click({ timeout: 4_000 }).catch(() => {})
    await page.waitForTimeout(2_500)

    // Root = Top-Level-Page (direct) ODER der Cross-Origin-Embed-iframe (marketing/start).
    const root: Page | FrameLocator = entry.iframe
      ? page.frameLocator('iframe[src*="gutachter-finder"]')
      : page

    const res = await fahreFinderStrecke(root, email)
    if (res.dryRun) {
      console.log(`[golden-finder:dryrun] ${entry.name}: Ort→Test-SV-Slot→Schaden→Formular OK, Submit übersprungen ✓`)
      return
    }

    // ── Verify (service-role): gfa dem Test-SV zugeordnet + KEIN Dispatch-Task (Send-Isolation #3709) ──
    await page.waitForTimeout(2_500) // revalidate + gfa.termin_id-Update
    const { data: gfa } = await db
      .from('gutachter_finder_anfragen')
      .select('id, zugeordneter_sv_id, matching_typ, termin_id')
      .eq('email', email)
      .maybeSingle()
    expect(gfa?.zugeordneter_sv_id, `${entry.name}: gfa dem Test-SV zugeordnet`).toBe(TEST_SV)
    expect(gfa?.matching_typ, `${entry.name}: Partner-Matching`).toBe('partner')
    const { data: tasks } = await db
      .from('mitteilungen')
      .select('id')
      .eq('route_url', `/dispatch/gutachter-finder/${gfa?.id}`)
    expect(tasks?.length ?? 0, `${entry.name}: interne Buchung -> kein Dispatch-Task (#3709)`).toBe(0)
    console.log(`[golden-finder] ${entry.name}: gfa ${gfa?.id} -> Test-SV, Termin ${gfa?.termin_id}, 0 Team-Tasks ✓`)
  })
}

// Crash-Recovery: nur deaktivieren (falls ein abgebrochener Lauf den SV aktiv liess).
//   RESET_FINDER_TEST_SV=1 RUN_GOLDEN_PATH_PROD=1 npx playwright test golden-path-finder-prod -g reset
test('reset — Test-SV deaktivieren (Crash-Recovery)', async () => {
  test.skip(!process.env.RESET_FINDER_TEST_SV, 'set RESET_FINDER_TEST_SV=1 um nur zu deaktivieren')
  await deaktiviereTestSv(admin())
  console.log('[golden-finder] Test-SV deaktiviert (reset)')
})
