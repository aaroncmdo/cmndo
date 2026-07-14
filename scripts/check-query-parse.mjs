#!/usr/bin/env node
// Drift-Bremse gegen tote PostgREST-Queries auf prod.
//
// Motivation (14.07.2026): EIN mehrdeutig gewordener Embed (partner_provisionen-FK, Mig
// 20260708071538) liess 6+ Surfaces still HTTP 300 liefern — 6 Tage unbemerkt, weil jede
// Fundstelle den Fehler verschluckte (`const { data } = await …`). Ein Sweep fand 63 statische
// Queries, die auf prod NICHT parsen (tote Spalte / fehlende Relation / mehrdeutiger Embed /
// fehlende Tabelle). Kein Build/tsc/anderer Ratchet faengt das — nur ein Query-Plan-Check.
//
// Ansatz: statt einen PostgREST-Planer nachzubauen (fehleranfaellig), wird jede statisch
// rekonstruierbare Query per `GET …?select=<literal>&limit=1` gegen die Env-DB "trockengeschossen".
// PostgREST validiert `select` beim PLANEN (daten-/rollenunabhaengig, service-role) → PostgREST
// selbst ist das Orakel: 0 False-Positives, faengt ALLE Fehlerklassen.
//
// Modi:
//   (default / --warn)     Report aller toten Queries, exit 0 (lokal)
//   --ratchet              blockt NEUE tote Queries gg. scripts/query-parse-baseline.json, exit 1
//   --update-baseline      schreibt die aktuelle Menge als neue Baseline (Boy-Scout senkt sie)
//
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Trockenschuss ist read-only).
// Ohne Keys: skip mit exit 0 (CI ohne DB-Secret blockt nicht faelschlich).

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractStaticQueries, queryKey } from './lib/query-parse-scan.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, 'src')
const BASELINE = join(HERE, 'query-parse-baseline.json')

const mode = process.argv.includes('--ratchet') ? 'ratchet'
  : process.argv.includes('--update-baseline') ? 'update' : 'warn'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.log('[check:query-parse] NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen → skip (exit 0).')
  process.exit(0)
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p, out) }
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.|__tests__/.test(p)) out.push(p)
  }
  return out
}

// 1. Alle statischen Queries sammeln (dedupliziert per Key, mit Fundstellen).
const byKey = new Map()
for (const file of walk(SRC)) {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/')
  for (const q of extractStaticQueries(readFileSync(file, 'utf8'))) {
    const key = queryKey(q.table, q.select)
    if (!byKey.has(key)) byKey.set(key, { table: q.table, select: q.select, sites: [] })
    byKey.get(key).sites.push(`${rel}:${q.line}`)
  }
}

// 2. Trockenschuss gegen die Env-DB (mit kleiner Nebenläufigkeit).
async function dryFire(table, select) {
  const r = await fetch(`${URL_}/rest/v1/${table}?select=${encodeURIComponent(select.replace(/\s+/g, ''))}&limit=1`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (r.status === 200) return null
  let code = ''
  try { code = JSON.parse(await r.text()).code || '' } catch {}
  return { status: r.status, code }
}

const items = [...byKey.entries()]
const broken = []
const POOL = 12
let idx = 0
await Promise.all(Array.from({ length: POOL }, async () => {
  while (idx < items.length) {
    const [key, q] = items[idx++]
    const res = await dryFire(q.table, q.select)
    if (res) broken.push({ key, ...q, ...res })
  }
}))
broken.sort((a, b) => a.key.localeCompare(b.key))

console.log(`[check:query-parse] ${byKey.size} statische Queries geprüft — ${broken.length} parsen auf prod NICHT.`)

if (mode === 'update') {
  const baseline = broken.map((b) => b.key).sort()
  writeFileSync(BASELINE, JSON.stringify({ note: 'Tote PostgREST-Queries (grandfathered). Boy-Scout senkt.', keys: baseline }, null, 2) + '\n')
  console.log(`[check:query-parse] Baseline aktualisiert: ${baseline.length} Einträge.`)
  process.exit(0)
}

const baselineKeys = existsSync(BASELINE) ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).keys) : new Set()
const neu = broken.filter((b) => !baselineKeys.has(b.key))
const behoben = [...baselineKeys].filter((k) => !broken.some((b) => b.key === k))

if (broken.length) {
  console.log('\nTote Queries:')
  for (const b of broken) {
    const tag = baselineKeys.has(b.key) ? '  (baseline)' : '  ⚠ NEU'
    console.log(`  ${b.status} ${b.code}  ${b.table}${tag}`)
    console.log(`     ${b.sites.slice(0, 2).join(', ')}${b.sites.length > 2 ? ` (+${b.sites.length - 2})` : ''}`)
    console.log(`     select: ${b.select.slice(0, 100)}`)
  }
}
if (behoben.length) console.log(`\n✓ ${behoben.length} Baseline-Einträge behoben → mit "--update-baseline" senken.`)

if (mode === 'ratchet' && neu.length) {
  console.log(`\n❌ ${neu.length} NEUE tote Query/-ies (nicht in der Baseline). Fix die select-Klausel oder erklaere den Sonderfall.`)
  process.exit(1)
}
console.log(mode === 'ratchet' ? '\n✓ Keine neuen toten Queries.' : '\n(--warn: exit 0; --ratchet blockt neue.)')
process.exit(0)
