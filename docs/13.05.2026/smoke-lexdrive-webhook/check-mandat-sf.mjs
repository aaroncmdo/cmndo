#!/usr/bin/env node
// GET mandat status von Salesforce: /services/apexrest/mandate/{id}
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(path.resolve(__dirname, '..', '..', '..', '.env.local'), 'utf-8')
for (const line of raw.split('\n')) { const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i<0) continue; if(!process.env[t.slice(0,i).trim()]) process.env[t.slice(0,i).trim()] = t.slice(i+1).trim() }

const MANDAT_ID = process.argv[2] ?? '001Jz00001H3FptIAF'

// Auth
const tokenResp = await fetch(process.env.KANZLEI_SF_AUTH_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.KANZLEI_SF_CLIENT_ID, client_secret: process.env.KANZLEI_SF_CLIENT_SECRET }),
})
const tok = await tokenResp.json()
if (!tokenResp.ok) { console.error('Auth-Fehler:', tok); process.exit(1) }
console.log(`✅ Token, instance=${tok.instance_url}`)

const base = tok.instance_url.replace(/\/$/, '')

async function tryGet(p) {
  const r = await fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${tok.access_token}` } })
  const t = await r.text()
  console.log(`\nGET ${p}  →  HTTP ${r.status}`)
  console.log(`  body: ${t.slice(0, 600)}`)
  return { status: r.status, body: t }
}

// Probiere mehrere Endpoint-Varianten
await tryGet(`/services/apexrest/mandate/${MANDAT_ID}`)
await tryGet(`/services/apexrest/mandate?id=${MANDAT_ID}`)
await tryGet(`/services/apexrest/mandate?fall_nr=SMK-SV-2026-001`)

// Generic Salesforce-Object-API
await tryGet(`/services/data/v59.0/sobjects/Case/${MANDAT_ID}`)
