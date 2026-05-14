#!/usr/bin/env node
// AAR-894: Seedet plz_geo aus zauberware/postal-codes-json-xml-csv (BSD).
// Idempotent (ON CONFLICT DO UPDATE). Service-Role-Key erforderlich.
//
// Datenquelle: https://raw.githubusercontent.com/zauberware/postal-codes-json-xml-csv/master/data/DE.zip
// Format im ZIP: zipcodes.de.json — Array mit {zipcode, place, latitude, longitude, ...}
// Mehrere Einträge pro PLZ möglich (verschiedene Orte) → erster Eintrag gewinnt.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { config as loadEnv } from 'dotenv'

// .env.local laden (Worktree-Root)
if (existsSync('.env.local')) loadEnv({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SOURCE_URL =
  'https://raw.githubusercontent.com/zauberware/postal-codes-json-xml-csv/master/data/DE.zip'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY benötigt')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// JSZip via CJS require (ist im Projekt vorhanden)
const require = createRequire(import.meta.url)
const JSZip = require('jszip')

async function loadSource() {
  // Optionaler lokaler Override: node scripts/seed-plz-geo.mjs /pfad/zur/datei.json
  if (process.argv[2]) {
    console.log(`Lade lokale Datei: ${process.argv[2]}`)
    return JSON.parse(readFileSync(process.argv[2], 'utf8'))
  }

  console.log(`Lade Quelle: ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Fetch ${SOURCE_URL} → ${res.status} ${res.statusText}`)

  const contentType = res.headers.get('content-type') ?? ''
  const buffer = await res.arrayBuffer()

  // ZIP-Datei entpacken
  if (
    contentType.includes('zip') ||
    SOURCE_URL.endsWith('.zip') ||
    buffer.byteLength > 100_000
  ) {
    console.log(`ZIP-Datei empfangen (${(buffer.byteLength / 1024).toFixed(0)} KB), entpacke…`)
    const zip = await JSZip.loadAsync(Buffer.from(buffer))

    // Suche nach der JSON-Datei im ZIP
    const jsonFile = Object.keys(zip.files).find((name) => name.endsWith('.json'))
    if (!jsonFile) {
      throw new Error('Keine JSON-Datei im ZIP gefunden. Dateien: ' + Object.keys(zip.files).join(', '))
    }
    console.log(`Entpacke: ${jsonFile}`)
    const content = await zip.file(jsonFile).async('string')
    return JSON.parse(content)
  }

  // Fallback: direkt JSON
  return JSON.parse(Buffer.from(buffer).toString('utf8'))
}

function normalize(entry) {
  const plz = String(entry.zipcode ?? entry.postal_code ?? '').trim()
  const lat = Number(entry.latitude ?? entry.lat)
  const lng = Number(entry.longitude ?? entry.lng)
  if (!plz || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  // Nur deutsche PLZ (5-stellig numerisch)
  if (!/^\d{5}$/.test(plz)) return null
  return { plz, lat, lng, ort: entry.place ?? entry.city ?? null }
}

async function upsertChunk(rows) {
  const { error } = await supabase
    .from('plz_geo')
    .upsert(rows, { onConflict: 'plz' })
  if (error) throw error
}

async function main() {
  const raw = await loadSource()
  console.log(`Quelle: ${raw.length} Einträge`)

  const normalized = raw.map(normalize).filter(Boolean)
  console.log(`Normalisiert: ${normalized.length}`)

  // Deduplizierung: erster Eintrag pro PLZ gewinnt (Reihenfolge aus Quelle beibehalten)
  const seen = new Set()
  const unique = []
  for (const r of normalized) {
    if (seen.has(r.plz)) continue
    seen.add(r.plz)
    unique.push(r)
  }
  console.log(`Unique PLZ: ${unique.length}`)

  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    await upsertChunk(chunk)
    inserted += chunk.length
    process.stdout.write(`\r${inserted}/${unique.length} upserted…`)
  }
  console.log(`\nFertig. ${unique.length} PLZ in plz_geo upserted.`)
}

main().catch((err) => {
  console.error('\nFehler:', err)
  process.exit(1)
})
