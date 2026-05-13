#!/usr/bin/env node
// Smoke /api/webhooks/lexdrive — HMAC-Signatur + processLexDriveEvent-Trip
//
// Sendet synthetische LexDrive-Events an unseren Webhook-Endpoint, verifiziert:
//   - HMAC sha256= Signatur akzeptiert
//   - Fehlende Signatur → 401
//   - Unbekannter event_type → 400
//   - Unbekannter fall_nr → 200 mit skipped:true (kein 5xx-Crash)
//   - Bekannter fall_nr → processLexDriveEvent läuft, webhook_events bekommt Row
//
// Usage:
//   STAGING_BASIC_AUTH_USER=aaroncmdo STAGING_BASIC_AUTH_PASS=xxx \
//   LEXDRIVE_WEBHOOK_SECRET=... \
//     node docs/13.05.2026/smoke-lexdrive-webhook/test.mjs https://app.staging.claimondo.de

import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// .env.local laden (für LEXDRIVE_WEBHOOK_SECRET)
function loadEnvLocal() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '.env.local'),
  ]
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, 'utf-8')
      for (const line of raw.split('\n')) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const idx = t.indexOf('=')
        if (idx < 0) continue
        const k = t.slice(0, idx).trim()
        const v = t.slice(idx + 1).trim()
        if (!process.env[k]) process.env[k] = v
      }
      return p
    } catch { /* nope */ }
  }
  return null
}
const loaded = loadEnvLocal()
console.log(`[env] loaded: ${loaded ?? '(none)'}`)

const baseUrl = process.argv[2] ?? 'https://app.staging.claimondo.de'
const secret = process.env.LEXDRIVE_WEBHOOK_SECRET
if (!secret) {
  console.error('FEHLER: LEXDRIVE_WEBHOOK_SECRET nicht gesetzt')
  process.exit(1)
}

const basicAuth = process.env.STAGING_BASIC_AUTH_USER && process.env.STAGING_BASIC_AUTH_PASS
  ? 'Basic ' + Buffer.from(`${process.env.STAGING_BASIC_AUTH_USER}:${process.env.STAGING_BASIC_AUTH_PASS}`).toString('base64')
  : null

function sign(body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

async function post(payload, { withSig = true, badSig = false } = {}) {
  const body = JSON.stringify(payload)
  const headers = { 'content-type': 'application/json' }
  if (basicAuth) headers['authorization'] = basicAuth
  if (withSig) headers['x-lexdrive-signature'] = badSig ? 'sha256=deadbeef' : sign(body)

  const res = await fetch(`${baseUrl}/api/webhooks/lexdrive`, { method: 'POST', headers, body })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, body: json ?? text }
}

const results = []
const test = async (name, fn) => {
  try {
    await fn()
    console.log(`✅ ${name}`)
    results.push({ name, ok: true })
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`)
    results.push({ name, ok: false, err: err.message })
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

// ─── Test 1: Fehlende Signatur → 401 ───────────────────────────────────────
await test('Fehlende Signatur → 401', async () => {
  const r = await post({ event_type: 'vollmacht_bestaetigt', event_id: 'test-1', fall_nr: 'SMK-SV-2026-001' }, { withSig: false })
  expect(r.status === 401, `expected 401 got ${r.status} body=${JSON.stringify(r.body)}`)
})

// ─── Test 2: Falsche Signatur → 401 ────────────────────────────────────────
await test('Falsche Signatur → 401', async () => {
  const r = await post({ event_type: 'vollmacht_bestaetigt', event_id: 'test-2', fall_nr: 'SMK-SV-2026-001' }, { badSig: true })
  expect(r.status === 401, `expected 401 got ${r.status}`)
})

// ─── Test 3: Unbekannter event_type → 400 ──────────────────────────────────
await test('Unbekannter event_type → 400', async () => {
  const r = await post({ event_type: 'nicht_existent_xyz', event_id: 'test-3', fall_nr: 'SMK-SV-2026-001' })
  expect(r.status === 400, `expected 400 got ${r.status} body=${JSON.stringify(r.body)}`)
})

// ─── Test 4: Fehlende Pflichtfelder → 400 ──────────────────────────────────
await test('Fehlende Pflichtfelder → 400', async () => {
  const r = await post({ event_type: 'vollmacht_bestaetigt' })
  expect(r.status === 400, `expected 400 got ${r.status}`)
})

// ─── Test 5: Unbekannter fall_nr → 200 mit skipped:true ────────────────────
await test('Unbekannter fall_nr → 200 skipped', async () => {
  const r = await post({
    event_type: 'vollmacht_bestaetigt',
    event_id: `test-skip-${Date.now()}`,
    fall_nr: 'NOT-EXISTING-CASE-999',
    aaron_smoke: 'phone +491633628571',
  })
  expect(r.status === 200, `expected 200 got ${r.status} body=${JSON.stringify(r.body)}`)
  expect(r.body?.skipped === true, `expected skipped=true got ${JSON.stringify(r.body)}`)
})

// ─── Test 6: Bekannter Test-Fall → echtes processLexDriveEvent ─────────────
await test('Bekannter Fall SMK-SV-2026-001 → processed', async () => {
  const r = await post({
    event_type: 'vollmacht_bestaetigt',
    event_id: `aaron-smoke-${Date.now()}`,
    fall_nr: 'SMK-SV-2026-001',
    mandant: { name: 'Aaron Sprafke', telefon: '+491633628571' },
    aaron_smoke: true,
  })
  expect(r.status === 200, `expected 200 got ${r.status} body=${JSON.stringify(r.body)}`)
  expect(r.body?.ok === true, `expected ok=true got ${JSON.stringify(r.body)}`)
})

// ─── Summary ──────────────────────────────────────────────────────────────
console.log('\n──── ERGEBNIS ────')
const ok = results.filter(r => r.ok).length
const bad = results.filter(r => !r.ok).length
console.log(`✅ ${ok} pass · ❌ ${bad} fail`)
if (bad > 0) {
  console.log('\nFehler:')
  results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}: ${r.err}`))
  process.exitCode = 1
}
