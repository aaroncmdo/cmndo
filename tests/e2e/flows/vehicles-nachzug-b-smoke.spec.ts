import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Regel-4-Prod-Smoke fuer Ops-Test Lane B (#5180) — vehicles-Nachzug.
//
// OPERATIVES SOLL (aus der Fachlogik, NICHT aus dem Code):
//   Wird eine Fahrzeug-Angabe am Lead korrigiert, muss die Korrektur auch im CLAIM
//   ankommen. Der Claim liest sein Fahrzeug aus `vehicles` (v_claim_full), die Korrektur
//   landet aber zunaechst nur im Lead — ohne Nachzug bleibt sie eine Sackgasse: Claim,
//   Gutachten und SA zeigen weiter den alten (womoeglich falschen) OCR-Wert.
//
// WARUM DAS ZAEHLT: prod-Messung 12.08. — 7 von 16 konvertierten Leads trugen ein ANDERES
// Kennzeichen als ihr Claim-Fahrzeug. Die Divergenz war real, nicht theoretisch.
//
// WARUM DIESER WEG: `ziehVehicleNach` haengt an zwei Oberflaechen —
//   * Kunde: confirmZb1Korrekturen (ZB1-Korrekturdialog nach dem Fahrzeugschein-Upload)
//   * Dispatch: saveStammdaten (Stammdaten-Korrektur am Lead)
// Geprueft wird hier der DISPATCH-Weg: er faehrt dieselbe Kern-Funktion, ist ein echter
// operativer Vorgang (Dispatcher korrigieren Stammdaten regelmaessig) und braucht keinen
// OCR-Upload. Die ZB1-Variante des Kunden bleibt ungedeckt — sie erfordert einen echten
// Datei-Upload samt OCR-Lauf; das ist im Marker als Rest-Luecke vermerkt.
// ⚠ saveStammdaten hat eine SA-SPERRE (stammdaten.ts:100) — nach unterschriebener SA
// blockt der Pfad. Der Seed setzt bewusst keine SA.
//
// Vorher:  node scripts/smoke/reparatur-weg-e2e-seed.mjs
// Opt-in (nie in CI): RUN_VEHICLES_NACHZUG_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY.

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const DISPATCH_EMAIL = process.env.SMOKE_DISPATCH_EMAIL ?? 'test-dispatch@claimondo.de'
const DISPATCH_PW = process.env.SMOKE_DISPATCH_PW ?? ''

// e2e-toplevel-fs: gekapselt — fehlt der Seed, skippt der Test statt die Collection zu sprengen.
let seed: { leadId?: string; claimId?: string; vehicleId?: string } | null = null
try {
  seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.reparatur-weg-e2e-seed.json'), 'utf8'))
} catch {
  /* nicht geseedet */
}

test.skip(!process.env.RUN_VEHICLES_NACHZUG_SMOKE, 'set RUN_VEHICLES_NACHZUG_SMOKE=1 (läuft echt gegen Prod)')

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function login(page: Page, email: string, pw: string) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('Soll: eine Kennzeichen-Korrektur am Lead kommt im Claim-Fahrzeug an', async ({ page }) => {
  test.setTimeout(180_000)
  test.skip(!seed?.leadId, 'Seed fehlt — vorher: node scripts/smoke/reparatur-weg-e2e-seed.mjs')
  const leadId = seed!.leadId!
  const db = admin()

  // Ausgangslage festhalten: Lead und vehicles tragen dasselbe (der Seed legt beides an).
  const { data: vorLead } = await db.from('leads').select('kennzeichen, sa_unterschrieben').eq('id', leadId).maybeSingle()
  const { data: vorVeh } = await db
    .from('vehicles')
    .select('id, kennzeichen_aktuell')
    .eq('id', seed!.vehicleId!)
    .maybeSingle()
  expect(vorLead?.sa_unterschrieben, 'ohne SA — sonst blockt die SA-Sperre den Pfad').toBeFalsy()
  console.log(`[nachzug] vorher: lead=${vorLead?.kennzeichen} vehicle=${vorVeh?.kennzeichen_aktuell}`)

  // Ein eindeutig neues Kennzeichen, damit der Vergleich nicht zufaellig gleich ist.
  const stadt = 'K'
  const buchstaben = 'ZZ'
  const zahlen = String(1000 + (Date.now() % 9000))
  const erwartet = `${stadt}-${buchstaben} ${zahlen}`

  await login(page, DISPATCH_EMAIL, DISPATCH_PW)
  await page.goto(`${APP}/dispatch/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2_500) // Hydration — sonst greifen die Felder ins Leere

  // Selbst-diagnostisch: schlaegt etwas fehl, steht im Log, was die Seite zeigte.
  const sicht = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  console.log(`[nachzug] Lead-Seite: ${sicht.slice(0, 240)}`)

  // Die Lead-Erfassung ist in Tabs geschnitten (Kontakt | Schaden | Unfall | FAHRZEUG | …);
  // beim Oeffnen steht „Kontakt" vorn — das Kennzeichen liegt unter „Fahrzeug".
  await page.locator('button:has-text("Fahrzeug") >> visible=true').first().click()
  await page.waitForTimeout(1_000)

  // KennzeichenPartsInput: drei Felder (Stadt / Buchstaben / Zahlen), erkennbar am Placeholder.
  const p1 = page.locator('input[placeholder="K"] >> visible=true').first()
  const p2 = page.locator('input[placeholder="AS"] >> visible=true').first()
  const p3 = page.locator('input[placeholder="1234"] >> visible=true').first()
  await expect(p1, 'Kennzeichen-Feld (Stadt) sichtbar').toBeVisible({ timeout: 20_000 })
  await p1.fill(stadt)
  await p2.fill(buchstaben)
  await p3.fill(zahlen)
  // Das Feld speichert ueber onSave — ein Blur loest den Persist aus.
  await p3.blur()

  // KERN: der Nachzug. Am DB-Zustand gemessen, nicht an einem fluechtigen Toast.
  await expect
    .poll(
      async () => {
        const { data } = await db
          .from('vehicles')
          .select('kennzeichen_aktuell')
          .eq('id', seed!.vehicleId!)
          .maybeSingle()
        return (data?.kennzeichen_aktuell as string | null) ?? null
      },
      { timeout: 25_000, message: 'vehicles.kennzeichen_aktuell wird nachgezogen' },
    )
    .toBe(erwartet)

  // Gegenprobe: der Lead traegt denselben Wert — die beiden Seiten laufen nicht auseinander.
  const { data: nachLead } = await db.from('leads').select('kennzeichen').eq('id', leadId).maybeSingle()
  expect(nachLead?.kennzeichen, 'Lead und vehicles tragen denselben Wert').toBe(erwartet)
  console.log(`[nachzug] ✓ lead=${nachLead?.kennzeichen} == vehicle=${erwartet} (vorher ${vorVeh?.kennzeichen_aktuell})`)
})
