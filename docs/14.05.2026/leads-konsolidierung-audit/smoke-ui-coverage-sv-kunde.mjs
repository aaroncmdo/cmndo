#!/usr/bin/env node
// UI-Coverage-Smoke fuer SV + Kunde-Portal.
// Test-Claim CLM-2026-00115 ist befuellt, jetzt geschaedigter_user_id=test-kunde,
// sv_id=test-sv sachverstaendige_id.

import { chromium } from 'playwright'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:3010'
const FALL_ID = '65a7640b-62dc-48ca-975f-27c8450477c6'
const CLAIM_ID = '5b2757e1-ea4c-4f2e-8870-ec7a33647d2c'
const OUT = join(__dirname, 'smoke-ui-coverage-screenshots')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const markers = {
  'Gutachten-OCR (Datum)': '2026-05-10',
  'Gutachten-OCR (FIN)': 'WBA8E5C50JK998877',
  'Gutachten-OCR (Lohnsatz)': '142.00|142,00|lohnsatz',
  'Gutachten-OCR (Materialkosten)': '1850.50|1850,50',
  'Gutachten-OCR (Mietwagen)': '95.00|95,00',
  'Gutachten-OCR (SV-Honorar)': '980.00|980,00|sv.honorar',
  'Gutachten-OCR (Kalkulationssystem)': 'DAT|dat',
  'Reparatur-Brutto': '6450.69|6.450,69',
  'Reparatur-Netto': '5420.75|5.420,75',
  'Minderwert': '850.00|minderwert',
  'Restwert': '12500.00|12.500',
  'Wiederbeschaffungswert': '19800.00|19.800',
  'Nutzungsausfall-Tage': 'nutzungsausfall',
  'Schadensort-Adresse': 'Kaiserdamm 88',
  'Schadensort-PLZ': '14057',
  'Polizei-Aktenzeichen': 'POL-K-2026',
  'Gegner-VS-Nummer': 'HUK-VN',
  'Gegner-Aktenzeichen': 'HUK-SCH',
  'Ursache-Text': 'Auffahrunfall an Ampelkreuzung',
  'Unfall-Konstellation': 'auffahrunfall|Auffahr',
  'Finanzierung-Leasing': 'BMW Bank Leasing',
  'Finanzierung-Vertragsnr': 'LV-2024-887766',
  'Finanzierungsgeber-Adresse': 'Heidemannstr',
}

const browser = await chromium.launch()

async function loginAndProbe(email, label, url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 } })
  const page = await ctx.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', 'Test1234!')
  await page.click('button[type="submit"]')
  try {
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 })
  } catch (e) {
    console.log(`✗ ${label} login fail`)
    await ctx.close()
    return { found: [], missing: Object.keys(markers), label }
  }
  console.log(`✓ ${label} login ok`)

  await page.goto(BASE + url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: join(OUT, `${label}-fallakte-full.png`), fullPage: true })

  const html = await page.content()
  const found = []
  const missing = []
  for (const [m, regex] of Object.entries(markers)) {
    const re = new RegExp(regex, 'i')
    if (re.test(html)) { found.push(m); console.log(`  ✓ ${m}`) }
    else { missing.push(m); console.log(`  ✗ ${m}`) }
  }
  console.log(`${label}: ${found.length}/${Object.keys(markers).length} sichtbar\n`)
  await ctx.close()
  return { found, missing, label }
}

const results = []
results.push(await loginAndProbe('test-sv@claimondo.de', 'sv', `/gutachter/fall/${FALL_ID}`))
results.push(await loginAndProbe('test-kunde@claimondo.de', 'kunde', `/kunde/faelle/${FALL_ID}`))

await browser.close()
writeFileSync(join(OUT, '..', 'ui-coverage-sv-kunde-result.json'), JSON.stringify(results, null, 2))
console.log('\nVergleich Admin (17/23) vs SV vs Kunde — siehe Screenshots + JSON')
