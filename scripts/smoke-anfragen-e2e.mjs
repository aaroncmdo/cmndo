// End-to-End Smoke fuer die anfragen-Inbox-Implementierung.
// Oeffnet die LP mit UTM-Parametern, fuellt das Formular aus, submitted,
// und verifiziert direkt gegen die Supabase-DB dass:
//   - anfragen-Zeile mit den UTMs + quelle/variant entstanden
//   - konvertier_status='success', lead_id gesetzt
//   - leads-Zeile mit Name/Telefon/Stadt korrekt verlinkt
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// .env.local parsen
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('FEHLER: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const UNIQUE_PHONE = `0151${String(Date.now()).slice(-7)}` // unique
const UNIQUE_NAME = `Smoke E2E ${Date.now().toString(36)}`
const TEST_URL = `http://localhost:3000/kfzgutachter-lp?utm_source=e2e&utm_campaign=anfragen-merge-smoke&utm_content=plan-t7&stadt=koeln`

console.log('▶ TEST_URL:', TEST_URL)
console.log('▶ Form-Daten:', { name: UNIQUE_NAME, phone: UNIQUE_PHONE, city: 'Köln' })

const browser = await chromium.launch()
const page = await browser.newPage()

try {
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  console.log('✓ Page geladen')

  // Form-Felder fuellen
  await page.fill('input[name="name"]', UNIQUE_NAME)
  await page.fill('input[name="phone"]', UNIQUE_PHONE)
  await page.fill('input[name="city"]', 'Köln')
  console.log('✓ Felder befuellt')

  // Submit + auf Success-Card warten (role=status mit "Danke")
  await page.click('button[type="submit"]')
  await page.waitForSelector('div[role="status"]', { timeout: 30_000 })
  const cardText = await page.locator('div[role="status"]').textContent()
  console.log('✓ Success-Card erscheint:', cardText?.slice(0, 80))

  if (!cardText?.includes('Danke') || !cardText.includes('Smoke')) {
    console.error('✗ Success-Card-Text unerwartet:', cardText)
    process.exit(1)
  }

  // Kurz warten + DB pollen (Server-Action lief asynchron)
  await page.waitForTimeout(1500)

  const { data: anfrage, error: anfErr } = await sb
    .from('anfragen')
    .select('id, quelle, quelle_variant, utm_source, utm_campaign, utm_content, kontakt_name, kontakt_telefon, kontakt_plz_oder_stadt, konvertier_status, lead_id, client_ip, user_agent')
    .eq('kontakt_telefon', UNIQUE_PHONE)
    .single()

  if (anfErr || !anfrage) {
    console.error('✗ Anfrage NICHT in DB:', anfErr?.message)
    process.exit(1)
  }
  console.log('✓ anfragen-Zeile:', {
    quelle: anfrage.quelle,
    variant: anfrage.quelle_variant,
    utm_source: anfrage.utm_source,
    utm_campaign: anfrage.utm_campaign,
    utm_content: anfrage.utm_content,
    status: anfrage.konvertier_status,
    has_lead: !!anfrage.lead_id,
    client_ip: anfrage.client_ip ?? '(none)',
  })

  // Hard-Asserts
  const checks = [
    [anfrage.quelle === 'kfzgutachter-ads-lp', 'quelle == kfzgutachter-ads-lp'],
    [anfrage.quelle_variant === 'test_b', 'quelle_variant == test_b'],
    [anfrage.utm_source === 'e2e', 'utm_source == e2e'],
    [anfrage.utm_campaign === 'anfragen-merge-smoke', 'utm_campaign matches'],
    [anfrage.utm_content === 'plan-t7', 'utm_content matches'],
    [anfrage.kontakt_name === UNIQUE_NAME, 'kontakt_name matches'],
    [anfrage.kontakt_plz_oder_stadt === 'Köln', 'kontakt_plz_oder_stadt == Köln'],
    [anfrage.konvertier_status === 'success', 'konvertier_status == success'],
    [!!anfrage.lead_id, 'lead_id ist gesetzt'],
  ]
  let fails = 0
  for (const [ok, label] of checks) {
    console.log(ok ? `✓ ${label}` : `✗ ${label}`)
    if (!ok) fails++
  }

  // Lead-Verifikation
  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .select('id, vorname, nachname, telefon, kunde_plz')
    .eq('id', anfrage.lead_id)
    .single()
  if (leadErr || !lead) {
    console.error('✗ Lead NICHT in DB:', leadErr?.message)
    fails++
  } else {
    console.log('✓ leads-Zeile:', { vorname: lead.vorname, nachname: lead.nachname, telefon: lead.telefon, kunde_plz: lead.kunde_plz })
    const leadChecks = [
      [lead.vorname?.startsWith('Smoke'), 'lead.vorname startsWith Smoke'],
      [lead.telefon === UNIQUE_PHONE, 'lead.telefon matches'],
      [lead.kunde_plz === 'Köln', 'lead.kunde_plz == Köln'],
    ]
    for (const [ok, label] of leadChecks) {
      console.log(ok ? `✓ ${label}` : `✗ ${label}`)
      if (!ok) fails++
    }
  }

  // Cleanup
  if (anfrage.lead_id) {
    await sb.from('leads').delete().eq('id', anfrage.lead_id)
  }
  await sb.from('anfragen').delete().eq('id', anfrage.id)
  console.log('✓ Cleanup done')

  if (fails > 0) {
    console.error(`\n✗ ${fails} Asserts fehlgeschlagen`)
    process.exit(1)
  }
  console.log('\n✓✓✓ E2E-Smoke komplett gruen — anfragen-Pipeline funktioniert')
} finally {
  await browser.close()
}
