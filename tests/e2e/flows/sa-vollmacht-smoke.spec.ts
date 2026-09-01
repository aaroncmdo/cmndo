// Fundament J3 (Unterschriften SA/Vollmacht) Journey-Smoke — gegen PROD, anon (kein Login).
// Soll (Journey j03): die Schaden-Abtretung (SA) wird per Signatur bestätigt und konvertiert den Lead
// zu einem Claim mit claims.sa_unterschrieben=true. Fahrbar über den WerkstattIntake-Signatur-Surface:
// ein Lead mit werkstatt_intake_am kurzschliesst /flow/[token] direkt auf SaSignaturStep (page.tsx:189)
// — Canvas (signature_pad) + Pflicht-Checkbox + "Beauftragung unterschreiben". Ausgangszustand:
// scripts/smoke/sa-vollmacht-seed.mjs (deterministisch, self-cleaning).
//
// Die VOLLMACHT hat keinen Kunde-UI-Canvas (server-intern via LexDrive/confirmVollmacht → claims.
// vollmacht_signiert_am / vollmacht_status='bestaetigt') und ist NICHT Teil dieses UI-Smokes
// (Journey j03 Schritt 3). Kein test.skip — ausserhalb der UI-Oberfläche, per DB/Webhook prüfbar.
//
// Lauf: CI=1 RUN_SA_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//       npx playwright test sa-vollmacht-smoke --project=chromium --reporter=line
import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { CTA_SA_UNTERSCHREIBEN } from '../lib/ui-texte'

const SEED_PATH = path.resolve(__dirname, '../../../scripts/smoke/.sa-vollmacht-seed.json')
const SEED: Record<string, string> = existsSync(SEED_PATH) ? JSON.parse(readFileSync(SEED_PATH, 'utf8')) : {}

// --- service-role DB-Client zum Verifizieren (env process.env-first — CI hat kein .env.local) ---
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (process.env)')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

test.beforeAll(() => {
  test.skip(!process.env.RUN_SA_SMOKE, 'set RUN_SA_SMOKE=1 to run this prod smoke')
  test.skip(!SEED.token, 'sa-vollmacht-seed fehlt — erst: node scripts/smoke/sa-vollmacht-seed.mjs')
})

test('SA-Signatur (WerkstattIntake): Lead → Claim mit sa_unterschrieben=true', async ({ page }) => {
  test.setTimeout(120_000)
  // anon: /flow/[token] kurzschliesst auf die SA-Signatur (Lead trägt werkstatt_intake_am). Kein Login.
  await page.goto(`/flow/${SEED.token}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  // Pflicht-Checkbox (Service-Zustimmung; im WerkstattIntake-Pfad genau eine, kein SV-Consent-Häkchen).
  const checkbox = page.locator('input[type="checkbox"]').first()
  await expect(checkbox, 'SA-Zustimmungs-Checkbox').toBeVisible({ timeout: 20_000 })
  await checkbox.check()

  // Signatur-Canvas zeichnen bis der Sign-Button aktiv wird (signature_pad lädt async → toPass-Loop,
  // exakt das in CI bewährte Muster aus reparatur-weg-e2e-smoke.spec.ts:73-86).
  const sign = page.getByRole('button', { name: CTA_SA_UNTERSCHREIBEN })
  const canvas = page.locator('canvas').first()
  await expect(canvas, 'Signatur-Canvas').toBeVisible({ timeout: 10_000 })
  await expect(async () => {
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Signatur-Canvas ohne boundingBox')
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 10 })
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 10 })
    await page.mouse.up()
    await expect(sign).toBeEnabled({ timeout: 2_000 })
  }).toPass({ timeout: 25_000 })
  await page.screenshot({ path: 'test-results/sa-before-sign.png', fullPage: true }).catch(() => {})
  await sign.click()

  // Erfolg: der Sign-Flow konvertiert (signSAandCreateFall) + zeigt den Dank-Screen. Weiches UI-Warten;
  // der harte Beweis ist der DB-Verify.
  await expect(page.getByText(/Vielen Dank|eingegangen|Auftrag/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(3000) // convertLeadToClaim + SA-Write settling

  // DB-Verify (SSoT): der Claim aus dem geseedeten Lead trägt sa_unterschrieben=true.
  const { data } = await db().from('claims').select('sa_unterschrieben, sa_unterschrieben_am').eq('lead_id', SEED.leadId).maybeSingle()
  expect(data?.sa_unterschrieben, 'claims.sa_unterschrieben muss nach der Signatur true sein').toBe(true)
})
