// Einmal-Test: sendet ein Mandat-Payload an die LexDrive-Sandbox
// (ruby-momentum-209--partial2) via OAuth2-Password-Grant.
// Aufruf: npx dotenvx run -f .env.local -- node scripts/test-lexdrive-sandbox.mjs

import { randomUUID } from 'node:crypto'

const SANDBOX_ENDPOINT =
  'https://ruby-momentum-209--partial2.sandbox.my.salesforce.com/services/apexrest/mandate'

const AUTH_URL = process.env.KANZLEI_SF_AUTH_URL
const USERNAME = process.env.KANZLEI_SF_USERNAME
const PASSWORD = process.env.KANZLEI_SF_PASSWORD
const SECURITY_TOKEN = process.env.KANZLEI_SF_SECURITY_TOKEN
const CLIENT_ID = process.env.KANZLEI_SF_CLIENT_ID
const CLIENT_SECRET = process.env.KANZLEI_SF_CLIENT_SECRET

if (!AUTH_URL || !USERNAME || !PASSWORD || !SECURITY_TOKEN || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('[FEHLER] KANZLEI_SF_* env-vars unvollständig')
  process.exit(1)
}

// --- Testdaten ----------------------------------------------------------
const TESTDATEN = {
  claimondo_fall_nr: `TEST-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
  kunde: {
    anrede: 'Herr',
    vorname: 'Thorsten',
    nachname: 'Weberbauer',
    strasse: 'Teststraße 42',
    plz: '80331',
    stadt: 'München',
    email: 'thorsten.weberbauer+claimondo-test@example.de',
    telefon: '+4915112345678',
    wa_faehig: true,
  },
  firma: false,
  vorsteuerabzugsberechtigt: false,
  fahrzeug: {
    kennzeichen: 'M-CT 4242',
  },
  meta: {
    idempotency_key: '',
    created_at: new Date().toISOString(),
  },
}
TESTDATEN.meta.idempotency_key = `${TESTDATEN.claimondo_fall_nr}-mandat-${randomUUID()}`

console.log('--- TESTDATEN -----------------------------------------------')
console.log(JSON.stringify(TESTDATEN, null, 2))
console.log('-------------------------------------------------------------\n')

// --- 1. OAuth-Token holen ----------------------------------------------
console.log('[1/2] Hole Salesforce-Access-Token von', AUTH_URL)
const authBody = new URLSearchParams({
  grant_type: 'password',
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  username: USERNAME,
  password: `${PASSWORD}${SECURITY_TOKEN}`,
})

const authResp = await fetch(AUTH_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: authBody,
})
const authText = await authResp.text()
let authJson
try {
  authJson = JSON.parse(authText)
} catch {
  authJson = null
}
if (!authResp.ok || !authJson?.access_token) {
  console.error('[FEHLER] Auth fehlgeschlagen:', authResp.status, authText)
  process.exit(2)
}
console.log('      ✓ Token erhalten. instance_url =', authJson.instance_url)

// --- 2. Mandat-POST an Sandbox ----------------------------------------
console.log('\n[2/2] POST', SANDBOX_ENDPOINT)
const postResp = await fetch(SANDBOX_ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authJson.access_token}`,
    'X-Claimondo-Event-Id': TESTDATEN.meta.idempotency_key,
  },
  body: JSON.stringify(TESTDATEN),
})
const postText = await postResp.text()
console.log('      Status :', postResp.status, postResp.statusText)
console.log('      Headers:', Object.fromEntries(postResp.headers.entries()))
console.log('      Body   :', postText)

process.exit(postResp.ok ? 0 : 3)
