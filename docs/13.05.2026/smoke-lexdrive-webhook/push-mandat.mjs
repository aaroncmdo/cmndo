#!/usr/bin/env node
// AAR-Smoke Komplettpaket-Push an LexDrive Salesforce
//
// Sendet einen echten Mandanten (Aaron Sprafke, +491633628571) an LexDrive's
// Apex-REST-Endpoint /services/apexrest/mandate.
// Triggert auf deren Seite den Flow → Vollmacht-Versand an den Mandanten.
//
// Schritte:
//   1. Setze Kunde-Daten auf Test-Fall SMK-SV-2026-001 (Aaron-Daten)
//   2. Hole SF-OAuth2-Token (client_credentials)
//   3. POST {claimondo_fall_nr, kunde, …} an /services/apexrest/mandate
//   4. Logge Response (mandat_id) + Timeline-Entry

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(path.resolve(__dirname, '..', '..', '..', '.env.local'), 'utf-8')
for (const line of raw.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const idx = t.indexOf('=')
  if (idx < 0) continue
  if (!process.env[t.slice(0, idx).trim()]) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
}

const FALL_ID = 'bbbb3333-0000-4000-8000-000000000032' // SMK-SV-2026-001
const AARON = {
  kunde_vorname: 'Aaron',
  kunde_nachname: 'Sprafke',
  kunde_email: 'aaron.sprafke@claimondo.de',
  kunde_telefon: '+491633628571',
  kunde_strasse: 'Hohenzollernring 31',
  kunde_plz: '50672',
  kunde_stadt: 'Köln',
  service_typ: 'komplett',
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── 1. Fall mit Aaron-Daten füllen ────────────────────────────────────────
console.log('1. Test-Fall mit Aaron-Daten patchen…')
const { error: fErr } = await db.from('faelle').update(AARON).eq('id', FALL_ID)
if (fErr) { console.error('Fall-Update Fehler:', fErr.message); process.exit(1) }
const { data: fall } = await db.from('faelle').select('id, fall_nummer, claim_id, kunde_vorname, kunde_nachname, kunde_email, kunde_telefon, service_typ, kennzeichen').eq('id', FALL_ID).single()
console.log(`   ✅ ${fall.fall_nummer} · ${fall.kunde_vorname} ${fall.kunde_nachname} · ${fall.kunde_telefon} · ${fall.service_typ}`)

// Claim muss kanzlei_wunsch=partnerkanzlei oder service_typ=komplett haben — komplett ist gesetzt.
if (fall.claim_id) {
  await db.from('claims').update({ kunde_email: AARON.kunde_email, kunde_telefon: AARON.kunde_telefon, kanzlei_wunsch: 'partnerkanzlei' }).eq('id', fall.claim_id)
  console.log(`   ✅ Claim kanzlei_wunsch=partnerkanzlei`)
}

// ─── 2. SF-OAuth-Token holen ───────────────────────────────────────────────
console.log('\n2. SF-OAuth2-Token holen…')
const authUrl = process.env.KANZLEI_SF_AUTH_URL
const clientId = process.env.KANZLEI_SF_CLIENT_ID
const clientSecret = process.env.KANZLEI_SF_CLIENT_SECRET
if (!authUrl || !clientId || !clientSecret) { console.error('SF-Config fehlt'); process.exit(1) }

const tokenResp = await fetch(authUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
})
const tokenJson = await tokenResp.json()
if (!tokenResp.ok || !tokenJson.access_token) {
  console.error(`   ❌ Auth-Fehler ${tokenResp.status}:`, JSON.stringify(tokenJson).slice(0, 400))
  process.exit(1)
}
console.log(`   ✅ Token erhalten (instance: ${tokenJson.instance_url ?? '—'})`)

// ─── 3. Mandat-Payload POSTen ──────────────────────────────────────────────
const payload = {
  claimondo_fall_nr: fall.fall_nummer ?? fall.id,
  kunde: {
    anrede: 'Herr',
    vorname: AARON.kunde_vorname,
    nachname: AARON.kunde_nachname,
    strasse: AARON.kunde_strasse,
    plz: AARON.kunde_plz,
    stadt: AARON.kunde_stadt,
    email: AARON.kunde_email,
    telefon: AARON.kunde_telefon,
    wa_faehig: true,
  },
  firma: false,
  vorsteuerabzugsberechtigt: false,
  fahrzeug: { kennzeichen: fall.kennzeichen ?? null },
  meta: {
    idempotency_key: `${fall.fall_nummer}-mandat-${randomUUID()}`,
    created_at: new Date().toISOString(),
  },
}

const instanceUrl = (tokenJson.instance_url ?? process.env.KANZLEI_SF_API_URL).replace(/\/$/, '')
const endpoint = `${instanceUrl}/services/apexrest/mandate`

console.log(`\n3. POST → ${endpoint}`)
console.log('   Payload:', JSON.stringify(payload, null, 2))

const resp = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokenJson.access_token}`,
    'X-Claimondo-Event-Id': payload.meta.idempotency_key,
  },
  body: JSON.stringify(payload),
})
const respText = await resp.text()
console.log(`\n   ← HTTP ${resp.status}`)
console.log(`   Body: ${respText.slice(0, 600)}`)

if (resp.ok) {
  let json = {}
  try { json = JSON.parse(respText) } catch {}
  const mandatId = json.mandat_id ?? json.mandatId ?? null
  if (mandatId) {
    await db.from('faelle').update({ mandatsnummer: mandatId }).eq('id', FALL_ID)
    console.log(`\n✅ Mandat ${mandatId} angelegt — LexDrive-Flow läuft.`)
  } else {
    console.log(`\n✅ Push erfolgreich (keine mandat_id in Response — wahrscheinlich Duplicate)`)
  }
  await db.from('timeline').insert({
    fall_id: FALL_ID, typ: 'webhook',
    titel: 'AAR-Smoke Komplettpaket-Push an LexDrive',
    beschreibung: `Aaron-Daten + Telefon ${AARON.kunde_telefon}. SF-Response HTTP ${resp.status}. Erwartung: Vollmacht per WA an ${AARON.kunde_telefon}.`,
  })
  console.log(`\nErwartung: WhatsApp-Vollmacht von LexDrive an ${AARON.kunde_telefon} in den nächsten Min.`)
} else {
  console.error(`\n❌ Push fehlgeschlagen.`)
  process.exit(1)
}
