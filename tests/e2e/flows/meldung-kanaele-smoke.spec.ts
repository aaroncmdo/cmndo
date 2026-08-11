// J2 — Meldung über alle Kanäle — Journey-Smoke gegen PROD (3 Kanäle = 3 Melde-Muster).
//
// Journey-Spec: docs/fundament/journeys/j02-meldung-alle-kanaele.md
// Seed:         scripts/smoke/meldung-kanaele-seed.mjs (Wegwerf-Kunde + Schadenkarten-Fixture +
//               API-Identität mit Drama-Festnetznummer, self-cleaning)
//
// Kanäle (Erhebung 04.08., file:line im Seed-Header):
//   A · Kunde-Wizard /kunde/schaden-melden — Wrapper-Muster (createLead -> convertLeadToFall):
//       leads + claims + pflichtdokumente; keine Terminwahl, kein reserviere().
//   B · POST /api/v1/melde-schaden — lead-first-Muster: gfa + lead + flow_link; der 2. POST mit
//       derselben Nummer beweist das j02-Soll "Doppel-Submit idempotent" (status='bereits_angelegt').
//       ⚠ Assert kanal==='none' = Runtime-Beweis der Send-Isolation (Drama-Nummer ohne WA, kein Email).
//   C · Gegner-Schadenkarte /schaden/[token] — Kern-direkt-Muster: Direkt-Claim + verursacher-Party
//       + interner vs_meldung-Fallback-Task (Submit ohne Telefon).
//       ⚠⚠ NIEMALS einen Versicherer wählen (VS-Meldung ist prod-scharf, STOP-Marker
//       firmen-flotte) und /unfallmeldung NICHT bestätigen — der Smoke endet am Danke-Screen.
//
// Lauf: CI=1 RUN_MELDUNG_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//       npx playwright test meldung-kanaele-smoke --project=chromium --reporter=line --workers=1
import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SEED_PATH = path.resolve(__dirname, '../../../scripts/smoke/.meldung-kanaele-seed.json')
const SEED: Record<string, string> = existsSync(SEED_PATH) ? JSON.parse(readFileSync(SEED_PATH, 'utf8')) : {}

// --- service-role DB-Client zum Verifizieren (env process.env-first — CI hat kein .env.local) ---
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (process.env)')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function login(page: Page, email: string, pw: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test.beforeAll(() => {
  test.skip(!process.env.RUN_MELDUNG_SMOKE, 'set RUN_MELDUNG_SMOKE=1 to run this prod smoke')
  test.skip(!SEED.kundeUid, 'meldung-kanaele-seed fehlt — erst: node scripts/smoke/meldung-kanaele-seed.mjs')
})

test('A · Kunde-Wizard: /kunde/schaden-melden -> Lead + Claim + Pflichtdok', async ({ page }) => {
  // Journey J2 · Variante Kunde-Wizard (Wrapper-Muster, j02 Ablauf 1).
  test.setTimeout(150_000)
  await login(page, SEED.kundeEmail, SEED.kundePw)
  await page.goto('/kunde/schaden-melden', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  // Ein-Formular-Wizard (SchadenMeldenWizard): Pflicht nur PLZ; controlled inputs -> der
  // Submit-Block ist quasi-idempotent gewrappt (URL-Guard verhindert Doppel-Submit nach Erfolg;
  // ein vor der Hydration verpuffter Erstversuch wird wiederholt — J4-Lektion #4929).
  await expect(async () => {
    if (!/\/kunde\/faelle\//.test(page.url())) {
      await page.getByPlaceholder('50667').fill('50667')
      await page.getByPlaceholder('z. B. K-AB 123').fill('K-SJ 2001')
      await page
        .getByPlaceholder('Kurz in eigenen Worten — das hilft uns bei der Einordnung.')
        .fill('SMOKE-J2 Kanal A: In-Portal-Testmeldung (Wegwerf-Konto, Regel-4-Lauf)')
      await page.getByRole('button', { name: 'Schaden melden' }).click()
      await page.waitForURL(/\/kunde\/faelle\//, { timeout: 20_000 })
    }
  }).toPass({ timeout: 90_000 })

  // DB-Verify (SSoT): Wrapper-Nachwirkungen — Lead(kunde_portal) + Claim + Pflichtdok-Slots.
  await expect(async () => {
    const d = db()
    const { data: lead } = await d
      .from('leads').select('id, source_channel').eq('kunde_id', SEED.kundeUid).maybeSingle()
    expect(lead?.source_channel, 'Lead muss aus dem Kunde-Portal stammen').toBe('kunde_portal')
    const { data: claim } = await d
      .from('claims').select('id').eq('geschaedigter_user_id', SEED.kundeUid).maybeSingle()
    expect(claim?.id, 'Claim muss existieren (convertLeadToFall)').toBeTruthy()
    const { count } = await d
      .from('pflichtdokumente').select('id', { count: 'exact', head: true }).eq('claim_id', claim!.id as string)
    expect(count ?? 0, 'Pflichtdok-Slots muessen angelegt sein (Wrapper-Garantie)').toBeGreaterThanOrEqual(1)
  }).toPass({ timeout: 30_000 })
})

test('B · API melde-schaden: Lead-first + FlowLink; 2. POST idempotent (kanal=none)', async ({ request }) => {
  // Journey J2 · Variante API (lead-first) + Fehlerfall "Doppel-Submit -> idempotent" (j02).
  test.setTimeout(120_000)
  const payload = {
    schadenart: 'Parkschaden',
    hergang: 'SMOKE-J2 Kanal B: API-Testmeldung (Wegwerf-Identitaet, Regel-4-Lauf)',
    plz: '50667',
    name: SEED.apiName,
    telefon: SEED.apiTelefon,
    einwilligung: { zugestimmt: true, policy_version: 'smoke-j2' },
    // BEWUSST ohne sv_id/slot_start/slot_end -> kein bucheTerminFlow, keine Reservierung (route.ts:240).
  }

  const res1 = await request.post('/api/v1/melde-schaden', { data: payload })
  expect(res1.status(), 'Erst-POST muss 200 liefern').toBe(200)
  const body1 = await res1.json()
  expect(body1.ok).toBe(true)
  expect(body1.status, 'Anfrage muss angelegt sein (inkl. FlowLink-Versandpfad)').toBe('angelegt')
  // Runtime-Isolations-Beweis: Drama-Festnetznummer ist nicht WA-faehig, SMS inert, kein
  // Email-Feld -> die Versand-Kaskade MUSS bei kanal='none' landen (sonst waere real gesendet worden).
  expect(body1.kanal, 'Send-Isolation: es darf KEIN Kanal zugestellt haben').toBe('none')

  // DB-Verify: gfa(source=mcp) -> lead -> flow_link (lead-first-Nachwirkungen).
  let leadId: string | null = null
  await expect(async () => {
    const d = db()
    const { data: gfa } = await d
      .from('gutachter_finder_anfragen')
      .select('id, source, konvertiert_zu_lead_id, dsgvo_zustimmung_am')
      .eq('telefon', SEED.apiTelefon)
    expect((gfa ?? []).length, 'genau 1 Anfrage').toBe(1)
    expect(gfa![0].source).toBe('mcp')
    expect(gfa![0].dsgvo_zustimmung_am, 'Stage-1-Consent muss persistiert sein').not.toBeNull()
    expect(gfa![0].konvertiert_zu_lead_id, 'Lead muss angelegt sein').toBeTruthy()
    leadId = gfa![0].konvertiert_zu_lead_id as string
    const { count } = await d
      .from('flow_links').select('id', { count: 'exact', head: true }).eq('lead_id', leadId)
    expect(count ?? 0, 'kanonischer FlowLink muss existieren').toBeGreaterThanOrEqual(1)
  }).toPass({ timeout: 30_000 })

  // j02-Fehlerfall "Doppel-Submit": identischer 2. POST -> idempotent, KEIN zweiter Fall.
  const res2 = await request.post('/api/v1/melde-schaden', { data: payload })
  expect(res2.status(), 'Doppel-POST muss 200 (nicht 429/500) liefern').toBe(200)
  const body2 = await res2.json()
  expect(body2.status, 'Dedup muss greifen (findRecentMcpLead)').toBe('bereits_angelegt')
  expect(body2.wiederverwendet).toBe(true)
  const { count: gfaCount } = await db()
    .from('gutachter_finder_anfragen')
    .select('id', { count: 'exact', head: true })
    .eq('telefon', SEED.apiTelefon)
  expect(gfaCount ?? 0, 'weiterhin genau 1 Anfrage (kein Doppel-Fall)').toBe(1)
})

test('C · Gegner-Schadenkarte: anon /schaden/[token] -> Direkt-Claim + VS-Fallback-Task', async ({ page }) => {
  // Journey J2 · Variante Gegner-Schadenkarte (Kern-direkt-Muster, j02 Variante 2).
  // ⚠⚠ KEIN Versicherer (Step 2 leer lassen), KEIN Telefon (Step 1) -> Airdrop unterbleibt,
  // stattdessen interner vs_meldung-Task; /unfallmeldung wird NICHT bestätigt.
  test.setTimeout(150_000)
  await page.goto(SEED.kartenUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  // Step 1: nur Name (Pflicht). Der "Weiter"-Button ist disabled bis React den Namen im State
  // hat -> toBeEnabled ist zugleich der HYDRATION-Beweis (DOM-fill allein enabled ihn nicht).
  const nameFeld = page.getByPlaceholder('Vor- und Nachname')
  await expect(nameFeld, 'Karte muss aufloesen (Wizard sichtbar)').toBeVisible({ timeout: 20_000 })
  const weiter = page.getByRole('button', { name: 'Weiter', exact: true })
  await expect(async () => {
    await nameFeld.fill('SMOKE-J2 Gegner (Test)')
    await expect(weiter).toBeEnabled({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await weiter.click()

  // Step 2: Kennzeichen + Typ des Gegner-Fahrzeugs (fuer die verursacher-Party); Versicherung LEER.
  await expect(page.getByPlaceholder('z. B. B-AB 1234')).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder('z. B. B-AB 1234').fill('SMOKE-GG 99')
  await page.getByPlaceholder('z. B. PKW, LKW, Motorrad').fill('PKW')
  await weiter.click()

  // Step 3: Hergang (Marker-Text).
  await expect(page.getByPlaceholder(/Beschreiben Sie kurz den Unfallhergang/)).toBeVisible({ timeout: 10_000 })
  await page
    .getByPlaceholder(/Beschreiben Sie kurz den Unfallhergang/)
    .fill('SMOKE-J2 Kanal C: Gegner-Meldung ueber die Schadenkarte (Wegwerf-Fixture, Regel-4-Lauf)')
  await weiter.click()

  // Step 4 (Fotos) + Step 5 (Unterschrift) sind optional -> durchklicken.
  await weiter.click()
  await weiter.click()

  // Step 6: Consent + Submit.
  const absenden = page.getByRole('button', { name: 'Schaden absenden' })
  await expect(absenden, 'Step 6 erreicht').toBeVisible({ timeout: 10_000 })
  for (const box of await page.locator('input[type="checkbox"]:visible').all()) {
    if (!(await box.isChecked())) await box.check()
  }
  await expect(absenden).toBeEnabled()
  await absenden.click()
  await expect(
    page.getByText('Vielen Dank — Ihre Angaben wurden übermittelt.'),
    'Danke-Screen nach Submit',
  ).toBeVisible({ timeout: 30_000 })
  // STOP: hier enden — /unfallmeldung/[token] NICHT oeffnen/bestaetigen (VS-Meldung prod-scharf).

  // DB-Verify: Lead(schaden-karte) -> Direkt-Claim (Kern) + Parties + interner Fallback-Task.
  await expect(async () => {
    const d = db()
    const { data: lead } = await d
      .from('leads')
      .select('id, schuldfrage')
      .eq('source_channel', 'schaden-karte')
      .eq('vehicle_id', SEED.vehicleId)
      .maybeSingle()
    expect(lead?.id, 'Lead der Karten-Meldung muss existieren').toBeTruthy()
    expect(lead?.schuldfrage, 'Gegner meldet -> schuldfrage=gegner').toBe('gegner')
    const { data: claim } = await d.from('claims').select('id').eq('lead_id', lead!.id as string).maybeSingle()
    expect(claim?.id, 'Direkt-Claim muss existieren (Kern-Konvert)').toBeTruthy()
    const { count: parties } = await d
      .from('claim_parties').select('id', { count: 'exact', head: true }).eq('claim_id', claim!.id as string)
    expect(parties ?? 0, 'geschaedigter + verursacher-Party').toBeGreaterThanOrEqual(2)
    const { count: vsTasks } = await d
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('claim_id', claim!.id as string)
      .eq('typ', 'vs_meldung')
    expect(vsTasks ?? 0, 'interner VS-Fallback-Task (kein Telefon angegeben)').toBeGreaterThanOrEqual(1)
    // C2b-1 (11.08., j02-IST-Delta #2 geschlossen): auch der Kern-direkte Meldeweg bekommt seine
    // Pflichtdok-Slots — `convertLeadToClaim` legt sie jetzt selbst an (vorher nur der Wrapper).
    // Dieser Assert ist der Wächter des neuen Solls: fällt der Kern-Aufruf weg, wird J2 rot.
    const { count: pflichtdok } = await d
      .from('pflichtdokumente')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', claim!.id as string)
    expect(pflichtdok ?? 0, 'Pflichtdok-Slots auch beim Direkt-Claim (Kern-Garantie)').toBeGreaterThanOrEqual(1)
  }).toPass({ timeout: 45_000 })
})
