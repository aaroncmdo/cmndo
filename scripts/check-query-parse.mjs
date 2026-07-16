#!/usr/bin/env node
// Drift-Bremse gegen tote PostgREST-Queries auf prod — zwei Achsen:
//
// (1) SELECT (live): Motivation 14.07.2026 — EIN mehrdeutig gewordener Embed (partner_provisionen-FK,
// Mig 20260708071538) liess 6+ Surfaces still HTTP 300 liefern — 6 Tage unbemerkt, weil jede
// Fundstelle den Fehler verschluckte (`const { data } = await …`). Ein Sweep fand 63 statische
// Queries, die auf prod NICHT parsen (tote Spalte / fehlende Relation / mehrdeutiger Embed /
// fehlende Tabelle). Statt einen PostgREST-Planer nachzubauen, wird jede statisch rekonstruierbare
// Query per `GET …?select=<literal>&limit=1` gegen die Env-DB "trockengeschossen" — PostgREST
// selbst ist das Orakel: 0 False-Positives, faengt ALLE Fehlerklassen. Braucht Env-Keys.
//
// (2) WRITE (statisch, seit 16.07.2026): .insert/.update/.upsert-Objektkeys lassen sich nicht
// nebenwirkungsfrei live proben — sie werden gegen den committeten Schema-Snapshot
// (scripts/lib/schema-snapshot.json) validiert ("Spalte existiert in Tabelle"). Faengt die
// Write-Drift-Klasse aus #4396 (fall_dokumente.typ-INSERT, pflichtdokumente.datei_url-UPDATEs —
// "Pflicht-Slot wurde nie hochgeladen"). Laeuft IMMER, auch in CI ohne DB-Secrets.
// Design: docs/superpowers/specs/2026-07-16-query-parse-write-ratchet-design.md
//
// Modi:
//   (default / --warn)     Report aller toten Queries/Writes, exit 0 (lokal)
//   --ratchet              blockt NEUE Eintraege gg. scripts/query-parse-baseline.json, exit 1
//   --update-baseline      schreibt die aktuelle Menge als neue Baseline (Boy-Scout senkt sie)
//
// Env (nur SELECT-Achse): NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read-only).
// Ohne Keys skippt NUR der Trockenschuss; die Write-Achse laeuft und gatet weiter.
//
// SCHEMA-SNAPSHOT REGENERIEREN (bei jeder Migration mit neuen/entfernten Spalten — im selben PR):
//   MCP execute_sql (READ) gegen die Live-DB:
//   SELECT c.relname || '|' || CASE c.relkind WHEN 'v' THEN 'v' WHEN 'm' THEN 'v' ELSE 't' END
//     || '|' || string_agg(a.attname, ',' ORDER BY a.attnum) AS row
//   FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
//   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','v','m','p','f')
//   GROUP BY c.relname, c.relkind ORDER BY c.relname;
//   -> Zeilen "name|kind|col1,col2,…" in tables{name:{kind,columns}} von schema-snapshot.json.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractStaticQueries, queryKey, extractStaticWrites, validateWrites, writeKey } from './lib/query-parse-scan.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, 'src')
const BASELINE = join(HERE, 'query-parse-baseline.json')
const SNAPSHOT = join(HERE, 'lib', 'schema-snapshot.json')

const mode = process.argv.includes('--ratchet') ? 'ratchet'
  : process.argv.includes('--update-baseline') ? 'update' : 'warn'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const dryFireEnabled = Boolean(URL_ && KEY)

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p, out) }
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.|__tests__/.test(p)) out.push(p)
  }
  return out
}

// 1. Ein Pass ueber src/: SELECT-Queries (dedupliziert per Key) + Write-Verletzungen sammeln.
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
const byKey = new Map()
const writeViolations = [] // {file, line, table, column, op, key}
for (const file of walk(SRC)) {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  for (const q of extractStaticQueries(src)) {
    const key = queryKey(q.table, q.select)
    if (!byKey.has(key)) byKey.set(key, { table: q.table, select: q.select, sites: [] })
    byKey.get(key).sites.push(`${rel}:${q.line}`)
  }
  for (const v of validateWrites(extractStaticWrites(src), snapshot)) {
    writeViolations.push({ file: rel, ...v, key: writeKey(v.table, v.column) })
  }
}
writeViolations.sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file))
const writeKeysNow = [...new Set(writeViolations.map((v) => v.key))].sort()

// 2. Trockenschuss gegen die Env-DB (mit kleiner Nebenläufigkeit) — nur mit Keys.
// Netzwerk-gehärtet: Timeout + Retry. Ein Blip/Ausfall darf den Guard NICHT crashen und NICHT
// als tote Query fehldeuten → nach den Retries `unchecked` (neutral: nicht broken, nicht blockend).
const REQ_TIMEOUT_MS = 10_000
const MAX_TRIES = 3
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function dryFire(table, select) {
  const url = `${URL_}/rest/v1/${table}?select=${encodeURIComponent(select.replace(/\s+/g, ''))}&limit=1`
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS)
    try {
      const r = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: ctrl.signal })
      clearTimeout(timer)
      if (r.status === 200) return null
      // 5xx = transienter Server-/Infra-Fehler → retry (kein Query-Parse-Fehler).
      if (r.status >= 500 && attempt < MAX_TRIES) { await sleep(300 * attempt); continue }
      let code = ''
      try { code = JSON.parse(await r.text()).code || '' } catch {}
      return { status: r.status, code }
    } catch {
      clearTimeout(timer)
      if (attempt < MAX_TRIES) { await sleep(300 * attempt); continue }
      return { unchecked: true } // Netzwerk/Timeout nach Retries → neutral
    }
  }
  return { unchecked: true }
}

const broken = []
let unchecked = 0
if (dryFireEnabled) {
  const items = [...byKey.entries()]
  const POOL = 12
  let idx = 0
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (idx < items.length) {
      const [key, q] = items[idx++]
      const res = await dryFire(q.table, q.select)
      if (res?.unchecked) unchecked++
      else if (res) broken.push({ key, ...q, ...res })
    }
  }))
  broken.sort((a, b) => a.key.localeCompare(b.key))
}

console.log(
  `[check:query-parse] Write-Achse: ${writeViolations.length} tote Write-Spalte(n). SELECT-Achse: ` +
  (dryFireEnabled
    ? `${byKey.size} statische Queries geprüft — ${broken.length} parsen NICHT${unchecked ? `; ${unchecked} nicht prüfbar (Netzwerk, neutral)` : ''}.`
    : `übersprungen (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen).`),
)

const baselineRaw = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const baselineKeys = new Set(baselineRaw.keys ?? [])
const baselineWriteKeys = new Set(baselineRaw.writeKeys ?? [])

if (mode === 'update') {
  // SELECT-Keys nur ueberschreiben, wenn der Trockenschuss lief — sonst wuerde ein
  // Env-loser Lauf die SELECT-Baseline wipen.
  const keys = dryFireEnabled ? broken.map((b) => b.key).sort() : [...baselineKeys].sort()
  writeFileSync(BASELINE, JSON.stringify({
    note: 'Tote PostgREST-Queries (grandfathered). keys = SELECT-Trockenschuss, writeKeys = statische Write-Achse. Boy-Scout senkt.',
    keys,
    writeKeys: writeKeysNow,
  }, null, 2) + '\n')
  console.log(`[check:query-parse] Baseline aktualisiert: ${keys.length} SELECT-Keys${dryFireEnabled ? '' : ' (unveraendert, kein Env)'} + ${writeKeysNow.length} Write-Keys.`)
  process.exit(0)
}

const neuSelect = dryFireEnabled ? broken.filter((b) => !baselineKeys.has(b.key)) : []
const behobenSelect = dryFireEnabled ? [...baselineKeys].filter((k) => !broken.some((b) => b.key === k)) : []
const neuWrite = writeViolations.filter((v) => !baselineWriteKeys.has(v.key))
const behobenWrite = [...baselineWriteKeys].filter((k) => !writeKeysNow.includes(k))

if (writeViolations.length) {
  console.log('\nTote Write-Spalten (statisch, Schema-Snapshot):')
  for (const v of writeViolations) {
    const tag = baselineWriteKeys.has(v.key) ? '  (baseline)' : '  ⚠ NEU'
    console.log(`  ${v.op}  ${v.table}.${v.column}${tag}`)
    console.log(`     ${v.file}:${v.line}`)
  }
}
if (broken.length) {
  console.log('\nTote Queries (SELECT-Trockenschuss):')
  for (const b of broken) {
    const tag = baselineKeys.has(b.key) ? '  (baseline)' : '  ⚠ NEU'
    console.log(`  ${b.status} ${b.code}  ${b.table}${tag}`)
    console.log(`     ${b.sites.slice(0, 2).join(', ')}${b.sites.length > 2 ? ` (+${b.sites.length - 2})` : ''}`)
    console.log(`     select: ${b.select.slice(0, 100)}`)
  }
}
if (behobenSelect.length || behobenWrite.length) {
  console.log(`\n✓ ${behobenSelect.length + behobenWrite.length} Baseline-Einträge behoben → mit "--update-baseline" senken.`)
}

if (mode === 'ratchet' && (neuSelect.length || neuWrite.length)) {
  if (neuWrite.length) console.log(`\n❌ ${neuWrite.length} NEUE tote Write-Spalte(n) — Spalte existiert nicht (Snapshot: scripts/lib/schema-snapshot.json). Tippfehler fixen; neue Spalte gewollt? → erst Migration, dann Snapshot im selben PR regenerieren (SQL im Header).`)
  if (neuSelect.length) console.log(`\n❌ ${neuSelect.length} NEUE tote Query/-ies (nicht in der Baseline). Fix die select-Klausel oder erklaere den Sonderfall.`)
  process.exit(1)
}
console.log(mode === 'ratchet' ? '\n✓ Keine neuen toten Queries/Writes.' : '\n(--warn: exit 0; --ratchet blockt neue.)')
process.exit(0)
