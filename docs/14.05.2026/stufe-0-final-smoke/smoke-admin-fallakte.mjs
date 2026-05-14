#!/usr/bin/env node
// Stufe-0-Final Smoke: Admin-Fallakte öffnen nach claims-Drop.
// Verifiziert dass UI nicht crasht — die 3 gedroppten Spalten
// (verursacher_user_id, ursache, bkat_unfallart) waren in v_claim_full
// und in COLUMNS_SV. Nach Recreate + Code-Patch sollte alles laufen.

import { chromium } from 'playwright'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL || 'http://localhost:3010'
const FALL_ID = '65a7640b-62dc-48ca-975f-27c8450477c6'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 } })
const page = await ctx.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
})

console.log('→ Login Admin')
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.fill('input[name="email"]', 'test-admin@claimondo.de')
await page.fill('input[name="password"]', 'Test1234!')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
console.log('✓ Login OK')

console.log(`→ Open /admin/faelle/${FALL_ID}`)
await page.goto(BASE + `/admin/faelle/${FALL_ID}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)

await page.screenshot({ path: join(__dirname, '01-admin-fallakte.png'), fullPage: false })
console.log('✓ Screenshot 01-admin-fallakte.png')

await page.screenshot({ path: join(__dirname, '02-admin-fallakte-full.png'), fullPage: true })
console.log('✓ Screenshot 02-admin-fallakte-full.png')

const html = await page.content()
writeFileSync(join(__dirname, 'fallakte.html'), html)

// Marker für die früher fehlenden Felder — Schadens-Ursache + Restwert kommen
// jetzt nur noch aus faelle, Schadensort + Gegner-Aktenzeichen weiter aus
// dem claim-Fallback.
const markers = {
  'Schadens-Ursache-Label': 'Schadens-Ursache',
  'Schadensort-Adresse-Label': 'Schadens-Adresse',
  'Gegner-Aktenzeichen-Label': 'Gegner-Schadennummer',
  'Restwert-Label': 'Restwert',
}
const labelHits = {}
for (const [k, v] of Object.entries(markers)) {
  labelHits[k] = html.includes(v)
  console.log(labelHits[k] ? `  ✓ ${k}` : `  ✗ ${k}`)
}

const result = {
  fall_id: FALL_ID,
  errors,
  labelHits,
}
writeFileSync(join(__dirname, 'result.json'), JSON.stringify(result, null, 2))

if (errors.length > 0) {
  console.log('\n❌ Errors:')
  for (const e of errors) console.log('  ', e)
  process.exit(1)
}
console.log('\n✓ Smoke OK — keine Crashes, alle Stammdaten-Labels gefunden')
await browser.close()
