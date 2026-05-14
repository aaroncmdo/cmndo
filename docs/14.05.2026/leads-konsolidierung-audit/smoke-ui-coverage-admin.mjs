#!/usr/bin/env node
// UI-Coverage-Smoke: zeigt der Admin-Portal die OCR-extrahierten + sonstigen
// claims-Daten? Test-Claim CLM-2026-00115 ist mit synthetischen Daten in
// allen Clustern befuellt.

import { chromium } from 'playwright'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:3010'
const FALL_ID = '65a7640b-62dc-48ca-975f-27c8450477c6'
const OUT = join(__dirname, 'smoke-ui-coverage-screenshots')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 } })
const page = await ctx.newPage()

// Login Admin
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.fill('input[name="email"]', 'test-admin@claimondo.de')
await page.fill('input[name="password"]', 'Test1234!')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
console.log('✓ Admin login ok')

// Fallakte
await page.goto(BASE + `/admin/faelle/${FALL_ID}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

// Vollbild-Screenshot — Fallakte Top
await page.screenshot({ path: join(OUT, '01-fallakte-top.png'), fullPage: false })
console.log('✓ 01-fallakte-top')

// Full-Page Screenshot mit allem
await page.screenshot({ path: join(OUT, '02-fallakte-full.png'), fullPage: true })
console.log('✓ 02-fallakte-full')

// HTML-Dump für Cluster-Suche
const html = await page.content()
writeFileSync(join(OUT, 'fallakte.html'), html)

// Marker-Suche pro Cluster
const markers = {
  'Gutachten-OCR (Datum)': 'gutachten_datum|2026-05-10',
  'Gutachten-OCR (FIN)': 'WBA8E5C50JK998877',
  'Gutachten-OCR (Lohnsatz)': '142.00|142,00|lohnsatz',
  'Gutachten-OCR (Materialkosten)': '1850.50|1850,50|materialkosten',
  'Gutachten-OCR (Mietwagen)': '95.00|95,00|mietwagen',
  'Gutachten-OCR (SV-Honorar)': '980.00|980,00|sv.honorar',
  'Gutachten-OCR (Kalkulationssystem)': 'DAT SilverDAT|kalkulationssystem',
  'Reparatur-Brutto': '6450.69|6.450,69',
  'Reparatur-Netto': '5420.75|5.420,75',
  'Minderwert': '850.00|minderwert',
  'Restwert': '12500.00|12.500',
  'Wiederbeschaffungswert': '19800.00|19.800',
  'Nutzungsausfall-Tage': 'nutzungsausfall.tage',
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

const found = []
const missing = []
for (const [label, regex] of Object.entries(markers)) {
  const re = new RegExp(regex, 'i')
  if (re.test(html)) {
    found.push(label)
    console.log(`  ✓ ${label}`)
  } else {
    missing.push(label)
    console.log(`  ✗ ${label}`)
  }
}

console.log(`\n${found.length}/${Object.keys(markers).length} Cluster im Admin-Portal sichtbar`)
writeFileSync(join(OUT, '..', 'ui-coverage-admin-result.json'), JSON.stringify({ found, missing, fall_id: FALL_ID }, null, 2))

await browser.close()
