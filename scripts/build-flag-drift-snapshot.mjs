#!/usr/bin/env node
// Regeneriert scripts/lib/status-check-constraints.json aus der Live-DB — die Ground-Truth von
// check:flag-drift (CHECK-invalide enum-Literale in Supabase-Writes/Filtern). Quelle: die read-only
// RPC public.audit_enum_check_constraints() (Migration 20260723003308) via REST — kein raw pg-Zugriff,
// nutzt denselben service-role key wie build-schema-snapshot.mjs. Volle ANY-ARRAY-enum-Abdeckung
// (nicht nur status-benannt).
//
// Warum ein Script + Cron (statt manueller Disziplin): der flag-drift-Snapshot ist die Schwester des
// schema-snapshot, der 2x in 12h still driftete. Enum-CHECKs aendern sich im Go-Live staendig (neue
// Werte, neue Spalten). Driftet der Snapshot, blockt das Gate valide neue Werte (FP) oder — gefaehrlicher
// — verpasst entfernte (Silent-Write-Fail). Derselbe Cron (schema-snapshot-regen.yml) faehrt beide.
//
// Determinismus (Pflicht, sonst PRt der Cron bei jedem Lauf): KEIN Timestamp; Spalten alphabetisch,
// Werte je Spalte sortiert (die RPC sortiert via jsonb_agg ORDER BY). Nur echte CHECK-Drift diff't.
//
// Lauf lokal: node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs          (schreibt)
//             node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs --check   (nur Drift-Exit)

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SNAP_PATH = join(HERE, 'lib', 'status-check-constraints.json')
const CHECK_ONLY = process.argv.includes('--check')

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  // Bewusst exit 0: der Cron soll bei fehlendem Secret sichtbar skippen statt naechtlich rot failen.
  console.log('[flag-drift-regen] NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen → skip.')
  process.exit(0)
}

async function fetchConstraintMap() {
  // Exit-Policy wie build-schema-snapshot.mjs:
  //  - 4xx (Auth/Config/RPC-fehlt, persistent) -> exit 2 (rot = braucht Aufmerksamkeit).
  //  - 5xx/522/Netzwerk (transient) -> nach Retries exit 0 (SKIP; naechster Lauf holt nach).
  let lastErr = 'unbekannt'
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const r = await fetch(`${URL_}/rest/v1/rpc/audit_enum_check_constraints`, {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (r.ok) return await r.json()
      lastErr = `HTTP ${r.status}`
      if (r.status >= 400 && r.status < 500) {
        console.error(`[flag-drift-regen] RPC-Fetch ${lastErr} (Auth/Config/RPC fehlt?) — Job failt bewusst (fixen: Secret/URL/Migration pruefen).`)
        process.exit(2)
      }
      // 5xx/522 -> transient, weiter retrien.
    } catch (e) {
      clearTimeout(timer)
      lastErr = String(e).slice(0, 120)
    }
    if (attempt < 3) await new Promise((res) => setTimeout(res, 1000 * attempt))
  }
  console.log(`[flag-drift-regen] RPC transient nicht erreichbar (${lastErr}) nach 3 Versuchen → skip (exit 0; naechster Lauf holt nach).`)
  process.exit(0)
}

const map = await fetchConstraintMap()
if (!map || typeof map !== 'object' || Array.isArray(map)) {
  console.error('[flag-drift-regen] RPC lieferte kein Objekt — abbrechen (exit 2).')
  process.exit(2)
}

// columns deterministisch bauen: Spalten alphabetisch (ASCII-Keys -> JS-sort ok).
// Werte NICHT in JS re-sortieren — die RPC liefert sie bereits via jsonb_agg ORDER BY (DB-Collation).
// JS .sort() (UTF-16-Codepoint) weicht bei Sonderzeichen (ü/ö/ä/ß) von der DB-Collation ab und
// erzeugte sonst dauerhaft Wert-Reihenfolge-Rauschen ggue. dem committeten Snapshot.
const columns = {}
for (const key of Object.keys(map).sort()) {
  const vals = map[key]
  if (!Array.isArray(vals) || vals.length === 0) continue
  columns[key] = vals
}

const snapshot = {
  _meta: {
    _regen: 'Automatisch regeneriert via scripts/build-flag-drift-snapshot.mjs (RPC audit_enum_check_constraints, Cron: .github/workflows/schema-snapshot-regen.yml). NICHT manuell editieren — bei enum-CHECK-Aenderung das Script laufen lassen (neuer Wert IMMER zuerst per MCP-Migration in den CHECK).',
    purpose: 'Snapshot ALLER public ANY-ARRAY-enum-CHECKs (col = ANY (ARRAY[...])). Ground-Truth fuer check:flag-drift.',
    note: 'Volle Abdeckung (nicht nur status-benannt). Werte je Spalte sortiert; NULL wird im Scanner ignoriert (nur String-Literale geprueft).',
  },
  columns,
}

const nextStr = JSON.stringify(snapshot, null, 2) + '\n'
const prevStr = readFileSync(SNAP_PATH, 'utf8')

if (nextStr === prevStr) {
  console.log(`[flag-drift-regen] in sync — ${Object.keys(columns).length} Spalten, keine Drift.`)
  process.exit(0)
}

// Drift-Zusammenfassung.
let prevColumns = {}
try {
  prevColumns = JSON.parse(prevStr).columns || {}
} catch {
  /* leer -> alles als neu behandeln */
}
const prevKeys = new Set(Object.keys(prevColumns))
const nextKeys = new Set(Object.keys(columns))
const added = [...nextKeys].filter((k) => !prevKeys.has(k))
const removed = [...prevKeys].filter((k) => !nextKeys.has(k))
const valDrift = []
for (const k of nextKeys) {
  if (!prevKeys.has(k)) continue
  const p = new Set(prevColumns[k] || [])
  const n = new Set(columns[k])
  const plus = [...n].filter((v) => !p.has(v))
  const minus = [...p].filter((v) => !n.has(v))
  if (plus.length || minus.length) {
    valDrift.push(`  ${k}: ${plus.length ? '+[' + plus.join(',') + ']' : ''}${minus.length ? ' -[' + minus.join(',') + ']' : ''}`)
  }
}
console.log('[flag-drift-regen] DRIFT erkannt:')
if (added.length) console.log(`  neue Spalten: ${added.join(', ')}`)
if (removed.length) console.log(`  entfernte Spalten: ${removed.join(', ')}`)
if (valDrift.length) { console.log('  Wert-Drift:'); valDrift.forEach((d) => console.log(d)) }

if (CHECK_ONLY) process.exit(1)
writeFileSync(SNAP_PATH, nextStr)
console.log(`[flag-drift-regen] geschrieben: ${Object.keys(columns).length} Spalten.`)
process.exit(0)
