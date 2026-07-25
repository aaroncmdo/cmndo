import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// F1 Prod-Smoke (Entry-Point-Audit 24.07., PR #4780): der NEUE 'abrechnung'-Step im Werkstatt-
// Finder-Embed (Kasko/Selbstzahler) setzt schuldfrage='eigenverantwortung' + eigene_versicherung.
// Der /flow matcht damit DIREKT das kasko/selbstzahler-Szenario (kein Schuldfrage-Quali-Umweg).
//
// ISOLATION (Regel 4): Test-Email-Alias (-> Aarons Postfach), telefon LEER (kein WhatsApp/SMS),
// KEINE Werkstatt ausgewaehlt (Supply-Gate -> nur Geo, kein assign/notify an eine echte Werkstatt).
// Reiner Lead-Write; verifiziert per Service-Role-DB.
//
// Standort-Step: statt des Google-Places-Autocomplete wird die Geolocation gemockt (Koeln) + der
// "Aktuellen Standort verwenden"-Button geklickt -> robust automatisierbar.
//
// Lauf:  RUN_WF_ABRECHNUNG_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//        npx playwright test werkstatt-finder-abrechnung --project=chromium --reporter=line

function db() {
  const raw = readFileSync(path.resolve(__dirname, '../../../.env.local'), 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const l = line.replace(/\r$/, '')
    if (!l.includes('=') || l.trimStart().startsWith('#')) continue
    const i = l.indexOf('=')
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

test.beforeAll(() => {
  test.skip(!process.env.RUN_WF_ABRECHNUNG_SMOKE, 'set RUN_WF_ABRECHNUNG_SMOKE=1 to run this prod smoke')
})

// Geolocation-Mock (Koeln 50667) -> umgeht das Places-Autocomplete im Standort-Step.
test.use({
  geolocation: { latitude: 50.9413, longitude: 6.9583 },
  permissions: ['geolocation'],
})

/** Laeuft den Embed-Wizard bis zum Submit und liefert die erzeugte Lead-Email zurueck. */
async function walkWizard(page: Page, abrechnung: 'kasko' | 'selbstzahler', email: string) {
  await page.goto('/embed/werkstatt-finder', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  // 1. Standort: gemockte Geolocation statt Autocomplete.
  await page.getByRole('button', { name: /Aktuellen Standort verwenden/i }).click()
  // Standort gesetzt -> Bestaetigung (reverse-geocodete Adresse ODER Fallback "Aktueller Standort").
  await expect(
    page.getByText(/Aktueller Standort|Köln|Koeln|Deutschland|50\d{3}/i).first(),
  ).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /^Weiter/i }).click()

  // 2. Fahrzeug: Hersteller (Pflicht-Gate).
  await page.getByPlaceholder('z. B. BMW').fill('BMW')
  await page.getByRole('button', { name: /^Weiter/i }).click()

  // 3. Schaden: ein Gewerk (Pflicht-Gate). 'Karosserie' ist nur hier ein Button.
  await page.getByRole('button', { name: 'Karosserie', exact: true }).click()
  await page.getByRole('button', { name: /^Weiter/i }).click()

  // 4. Abrechnung (F1): Kasko vs. Selbstzahler.
  await expect(page.getByText(/Wie wird die Reparatur bezahlt/i)).toBeVisible({ timeout: 10_000 })
  const wahl = abrechnung === 'kasko' ? /Über meine Kaskoversicherung/i : /Ich zahle selbst/i
  await page.getByRole('button', { name: wahl }).click()
  await page.getByRole('button', { name: /^Weiter/i }).click()

  // 5. Kontakt: nur Email (KEINE Werkstatt-Auswahl -> Supply-Gate, kein Assign/Notify).
  await page.getByPlaceholder('E-Mail').fill(email)
  await page.getByRole('button', { name: /Anfrage absenden|Werkstatt anfragen/i }).click()

  // Submit -> window.location.href = /flow/[token].
  await page.waitForURL(/\/flow\//, { timeout: 30_000 })
}

async function ladeLead(email: string) {
  const { data } = await db()
    .from('leads')
    .select('schuldfrage, eigene_versicherung, source_channel, reparaturwunsch')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as {
    schuldfrage: string | null
    eigene_versicherung: string | null
    source_channel: string | null
    reparaturwunsch: string | null
  } | null
}

test('F1 Kasko: Werkstatt-Finder → Lead eigenverantwortung + eigene_versicherung=ja + kasko-/flow', async ({ page }) => {
  test.setTimeout(120_000)
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))
  const email = `aaron.sprafke+wf-kasko-${Date.now()}@claimondo.de`

  await walkWizard(page, 'kasko', email)

  const lead = await ladeLead(email)
  console.log('[F1 kasko] lead:', JSON.stringify(lead))
  expect(lead, 'Lead muss angelegt sein').toBeTruthy()
  expect(lead?.source_channel).toBe('werkstatt_finder')
  expect(lead?.schuldfrage).toBe('eigenverantwortung')
  expect(lead?.eigene_versicherung).toBe('ja')

  // Der /flow zeigt das kasko-Szenario -> KEIN Schuldfrage-Quali ("Wer ist schuld?").
  await page.waitForTimeout(1500)
  const body = (await page.locator('body').innerText().catch(() => '')) ?? ''
  expect(
    /Wer hat den Unfall verursacht|Wer ist schuld/i.test(body),
    'kein Schuldfrage-Quali im /flow (kasko matcht direkt)',
  ).toBeFalsy()
})

test('F1 Selbstzahler: Werkstatt-Finder → Lead eigenverantwortung + eigene_versicherung=nein', async ({ page }) => {
  test.setTimeout(120_000)
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))
  const email = `aaron.sprafke+wf-selbst-${Date.now()}@claimondo.de`

  await walkWizard(page, 'selbstzahler', email)

  const lead = await ladeLead(email)
  console.log('[F1 selbstzahler] lead:', JSON.stringify(lead))
  expect(lead, 'Lead muss angelegt sein').toBeTruthy()
  expect(lead?.schuldfrage).toBe('eigenverantwortung')
  expect(lead?.eigene_versicherung).toBe('nein')
})
