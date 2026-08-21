import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { resolveTestSvId } from '../lib/test-sv'

// Golden-Path COMPLETION E2E — der manuelle Claim-Abschluss (Back-Half) im echten
// Browser bis fall_geschlossen, gegen Prod. Companion zu golden-path-prod.spec.ts.
//
// Beweist: ein Claim laesst sich ueber das Endpoint-Register-Panel (admin/KB) durch
// die Regulierung bis 'abgeschlossen' fahren — as_versendet → vs_reguliert_voll →
// zahlung_eingegangen → fall_geschlossen. Jede Transition ist state-machine-validiert
// (inkl. des all-or-nothing-Guards, der nur aus zahlung-eingegangen schliessen laesst).
//
// PARTNER-SICHER: laeuft auf einem Smoke-Claim (@claimondo.test) mit einem Test-SV;
// Comms (as/vs/zahlung) gehen an interne Test-Kontakte (send-isolation) — kein echter
// Kunde/Gutachter wird beruehrt.
//
// Opt-in (nie in CI): RUN_GOLDEN_PATH_PROD=1 + SUPABASE_SERVICE_ROLE_KEY (Setup/Verify).

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
// Smoke-Fixture CLM-2026-00121 (fall_id != claim_id, post-CMM-49 Bridge) + Test-SV "Schmidt Köln".
//
// ⚠ 21.08.2026 nachgemessen: BEIDE Defaults existieren auf prod nicht mehr. Der
//   Golive-Accounts-Cleanup (13.07.) hat alle Claims unterhalb von CLM-2026-00752
//   geloescht; CLM-2026-00121 lag darunter. Ohne gesetztes GOLDEN_CLAIM_ID/-FALL_ID
//   laeuft dieser Smoke gegen Geister — und weil er scharf Events feuert, sieht das
//   Scheitern nach Produktfehler aus.
//
// ⭐ Und die Fixture war mehr als ein Datensatz: sie war die EINZIGE Konstellation mit
//   `fall_id != claim_id`. Heute stimmen auf prod ALLE 76 Bridge-Zeilen ueberein (0
//   abweichend, gezaehlt). Damit ist der accept-both-Pfad (Alt-Bookmark unter faelle.id)
//   auf prod nicht mehr unterscheidbar testbar — betrifft auch
//   tests/e2e/cmm63-kunde-ownership.spec.ts, wo derselbe Umstand vermerkt ist.
//   Wer den Weg wieder absichern will, braucht eine NEUE Fixture mit abweichender
//   fall_id; ein beliebiger heutiger Claim genuegt dafuer nicht.
const CLAIM = process.env.GOLDEN_CLAIM_ID ?? 'afb349eb-5681-4b01-ac40-b5431cf88e80'
const FALL = process.env.GOLDEN_FALL_ID ?? 'eeac8379-0aed-463b-bf13-953a23f7a791'
// TEST_SV wird im Test ueber die stabile Email aufgeloest (Row-id churnt — s. resolveTestSvId).

test.skip(!process.env.RUN_GOLDEN_PATH_PROD, 'set RUN_GOLDEN_PATH_PROD=1 (läuft echt gegen Prod)')

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

// Feuert ein Panel-Event: Button klicken → Modal-Felder füllen → Auslösen → auf Schließen warten.
async function fireEvent(page: Page, label: RegExp, fields: Array<['date' | 'number' | 'textarea' | 'select', string]>) {
  const btn = page.getByRole('button', { name: label }).first()
  await btn.scrollIntoViewIfNeeded().catch(() => {})
  await expect(btn, `Event-Button ${label} sichtbar`).toBeVisible({ timeout: 8_000 })
  await btn.click()
  const dialog = page.locator('[role="dialog"], [aria-label*="auslösen" i]').first()
  await dialog.waitFor({ state: 'visible', timeout: 8_000 })
  await page.waitForTimeout(500)
  for (const [type, val] of fields) {
    if (type === 'date') await dialog.locator('input[type="date"]').first().fill(val).catch(() => {})
    else if (type === 'number') await dialog.locator('input[type="number"]').first().fill(val).catch(() => {})
    else if (type === 'textarea') await dialog.locator('textarea').first().fill(val).catch(() => {})
    else if (type === 'select') await dialog.locator('select').first().selectOption({ index: 1 }).catch(() => {})
  }
  await dialog.getByRole('button', { name: /auslösen/i }).first().click({ timeout: 8_000 })
  await dialog.waitFor({ state: 'hidden', timeout: 12_000 }).catch(() => {})
  await page.waitForTimeout(4_000) // revalidatePath
}

test('Manueller Abschluss via Panel — Claim bis fall_geschlossen', async ({ page }) => {
  test.setTimeout(180_000)
  const db = admin()
  const TEST_SV = await resolveTestSvId(db) // stabile Email -> aktuelle SV-Row-id (kein toter Hardcode)

  // Setup: Vorbedingung fuer die Back-Half (kanzlei-uebergeben, Test-SV zugewiesen, sauber).
  // kanzlei_uebergeben_am setzen: der ProzessTab zeigt die Kanzlei-Section (mit dem Panel)
  // bei phase>=4 ODER mandatsnummer ODER kanzlei_uebergeben_am (section-visibility.ts) —
  // damit das Panel garantiert erscheint, unabhaengig vom abgeleiteten Phase-Wert.
  await db.from('webhook_events').delete().eq('claim_id', CLAIM)
  await db.from('claims').update({
    operative_status: 'kanzlei-uebergeben', sv_id: TEST_SV, kanzlei_uebergeben_am: '2026-07-01T00:00:00Z',
    abgeschlossen_am: null, geschlossen_grund: null,
  }).eq('id', CLAIM)

  // Admin-Login → Fallakte → Endpoint-Register.
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"]').first().fill(process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de')
  // `Test1234!` gilt auf prod nur noch fuer test-dispatch@ — Messung s. _golden-path-lib.ts (ROLES).
  await page.locator('input[type="password"]').first().fill(process.env.TEST_ADMIN_PASSWORD ?? 'Claimondo2026!')
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(5_000)
  await page.goto(`${APP}/faelle/${FALL}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(3_500)
  for (const t of ['Prozess', 'Ablauf', 'Endpoint']) {
    const tab = page.getByRole('tab', { name: new RegExp(t, 'i') }).or(page.getByRole('button', { name: new RegExp('^' + t, 'i') })).first()
    if (await tab.isVisible({ timeout: 1_200 }).catch(() => false)) { await tab.click().catch(() => {}); await page.waitForTimeout(1_500); break }
  }

  // Back-Half fahren: 4 Events über das Panel.
  await fireEvent(page, /AS versendet/i, [['date', '2026-07-06']])
  await fireEvent(page, /VS reguliert voll/i, [['date', '2026-07-06'], ['number', '5000']])
  await fireEvent(page, /Zahlung eingegangen/i, [['date', '2026-07-06'], ['number', '5000'], ['select', '1']])
  await fireEvent(page, /Fall geschlossen/i, [['date', '2026-07-06'], ['textarea', 'E2E-Abschluss (Testdaten)']])

  // Verify: Claim ist abgeschlossen (operative_status = SSoT der State-Machine).
  const { data } = await db.from('claims').select('operative_status, abgeschlossen_am').eq('id', CLAIM).maybeSingle()
  expect(data?.operative_status, 'Claim soll abgeschlossen sein').toBe('abgeschlossen')
  expect(data?.abgeschlossen_am, 'abgeschlossen_am gesetzt').toBeTruthy()
  console.log(`[golden-completion] Claim ${CLAIM} → abgeschlossen ✓`)
})
