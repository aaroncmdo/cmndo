#!/usr/bin/env node
// CMM-48 Smoke: ruft den Test-Endpoint /api/admin/test/cmm48-smoke gegen staging,
// erwartet { ok: true }, gibt eine kompakte Tabelle der Check-Booleans aus.
//
// Aufruf:
//   SMOKE_BASIC_AUTH_PASS=… SMOKE_API_KEY=… node scripts/smoke-cmm48-convert.mjs
//
// Optional:
//   SMOKE_STAGING_BASE   default https://app.staging.claimondo.de
//   SMOKE_BASIC_AUTH_USER default aaroncmdo
//
// Exit-Codes:
//   0  alle Checks grün
//   1  mindestens ein Check rot
//   2  Konfigurations-/Netzwerk-Fehler

const STAGING_BASE = process.env.SMOKE_STAGING_BASE ?? 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.SMOKE_BASIC_AUTH_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.SMOKE_BASIC_AUTH_PASS
const API_KEY = process.env.SMOKE_API_KEY

if (!BASIC_PASS) {
  console.error('FEHLER: SMOKE_BASIC_AUTH_PASS muss gesetzt sein (Staging-Basic-Auth-Passwort).')
  process.exit(2)
}
if (!API_KEY) {
  console.error('FEHLER: SMOKE_API_KEY muss gesetzt sein (matcht SMOKE_API_KEY auf dem Server).')
  process.exit(2)
}

const url = `${STAGING_BASE}/api/admin/test/cmm48-smoke`
const basic = Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString('base64')

console.log(`[smoke-cmm48] POST ${url}`)
const start = Date.now()

let res
try {
  res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'X-Smoke-Token': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
} catch (err) {
  console.error(`[smoke-cmm48] Netzwerk-Fehler: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
}

const elapsed = ((Date.now() - start) / 1000).toFixed(2)
const text = await res.text()
let body
try {
  body = JSON.parse(text)
} catch {
  console.error(`[smoke-cmm48] Antwort ist kein JSON (HTTP ${res.status}). Body (erste 500 Zeichen):`)
  console.error(text.slice(0, 500))
  process.exit(2)
}

console.log(`[smoke-cmm48] HTTP ${res.status} in ${elapsed}s`)

if (body.note) console.log(`[smoke-cmm48] ${body.note}`)
if (body.leadId) console.log(`[smoke-cmm48] Lead ID: ${body.leadId}`)
if (body.fallId) console.log(`[smoke-cmm48] Fall ID: ${body.fallId}`)
if (body.claimId) console.log(`[smoke-cmm48] Claim ID: ${body.claimId}`)
if (body.convertError) console.log(`[smoke-cmm48] convertError: ${body.convertError}`)

const checks = body.checks ?? {}
console.log('\n[smoke-cmm48] Checks:')
for (const [key, val] of Object.entries(checks)) {
  console.log(`  ${val ? '✓' : '✗'} ${key}`)
}

if (body.fallSnapshot) {
  console.log('\n[smoke-cmm48] fall snapshot:')
  console.log(JSON.stringify(body.fallSnapshot, null, 2))
}
if (body.claimSnapshot) {
  console.log('\n[smoke-cmm48] claim snapshot:')
  console.log(JSON.stringify(body.claimSnapshot, null, 2))
}

if (body.ok === true) {
  console.log('\n[smoke-cmm48] ✅ Alle Checks grün')
  process.exit(0)
}
console.log('\n[smoke-cmm48] ❌ Smoke FAIL')
process.exit(1)
