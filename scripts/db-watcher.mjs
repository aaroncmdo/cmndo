#!/usr/bin/env node
// AAR-prod-cj-iter-3 (13.05.2026): DB-Watcher für Customer-Journey-Smoke.
//
// Pollt alle 3 Sekunden eine Liste von kritischen Tabellen und schreibt
// jeden neuen/geänderten Row in eine JSONL-Audit-Datei. Wird parallel zum
// UI-Smoke-Subagent gestartet — der Smoke-Agent loggt UI-Klicks mit
// gleicher Timestamp-Basis. Korrelation per timestamp im finalen MD.
//
// Verwendung:
//   STAGING=1 node scripts/db-watcher.mjs   # Staging-DB
//   node scripts/db-watcher.mjs              # Prod-DB (default, gleiche
//                                            # Supabase-Instanz wie Staging)
//
// Output:
//   docs/13.05.2026/smoke-claimondo-de/db-watcher-log.jsonl
//
// Stop: Ctrl+C oder SIGTERM (Process schreibt am Ende final summary).

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const POLL_INTERVAL_MS = 3000
const OUTPUT_DIR = 'docs/13.05.2026/smoke-claimondo-de'
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'db-watcher-log.jsonl')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Env fehlt: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

// Tabellen + welche Spalte für „neu seit"-Vergleich (created_at, erstellt_am, updated_at)
// und welche Spalten in den Log dokumentiert werden sollen (Key-Spalten + Status).
// Spalten via Supabase-MCP 13.05.2026 verifiziert.
// (frueher hatte das Skript geratene Spalten was poll-errors produzierte)
const WATCHED = [
  { table: 'leads', stamp: 'updated_at', keys: 'id, qualifizierungs_phase, status' },
  { table: 'gutachter_finder_anfragen', stamp: 'erstellt_am', keys: 'id, schadentyp, status, sa_unterzeichnet_am' },
  { table: 'claims', stamp: 'updated_at', keys: 'id, claim_nummer, status' },
  { table: 'faelle', stamp: 'updated_at', keys: 'id, fall_nummer, status, kunde_id, lead_id, onboarding_complete' },
  { table: 'tasks', stamp: 'created_at', keys: 'id, status, lead_id, fall_id' },
  { table: 'timeline', stamp: 'created_at', keys: 'id, lead_id, fall_id' },
  { table: 'notification_events', stamp: 'created_at', keys: 'id, status' },
  { table: 'nachrichten', stamp: 'created_at', keys: 'id, fall_id, lead_id' },
  { table: 'lead_historie', stamp: 'geaendert_am', keys: 'id, lead_id' },
  { table: 'phase_transitions', stamp: 'created_at', keys: 'id, from_phase, to_phase' },
  { table: 'gutachter_termine', stamp: 'created_at', keys: 'id, start_zeit, status' },
  { table: 'reklamationen', stamp: 'created_at', keys: 'id, status' },
  { table: 'abrechnungen', stamp: 'updated_at', keys: 'id, status, summe_brutto' },
  { table: 'flow_links', stamp: 'erstellt_am', keys: 'id, status' },
  { table: 'profiles', stamp: 'updated_at', keys: 'id, rolle' },
]

// Init: aktueller Zeitpunkt = Start-Marker. Wir loggen nur Changes NACH Start.
const startedAt = new Date().toISOString()
const lastSeen = Object.fromEntries(WATCHED.map((w) => [w.table, startedAt]))

mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(OUTPUT_FILE, '')
appendFileSync(
  OUTPUT_FILE,
  JSON.stringify({ ts: startedAt, event: 'watcher-start', watched: WATCHED.map((w) => w.table) }) + '\n',
)
console.log(`[watcher] gestartet ${startedAt}, ${WATCHED.length} Tabellen, Poll ${POLL_INTERVAL_MS}ms`)

let pollCount = 0
let totalChanges = 0

async function pollOnce() {
  pollCount++
  const tsNow = new Date().toISOString()
  for (const w of WATCHED) {
    try {
      const { data, error } = await sb
        .from(w.table)
        .select(w.keys)
        .gt(w.stamp, lastSeen[w.table])
        .order(w.stamp, { ascending: true })
        .limit(200)
      if (error) {
        appendFileSync(
          OUTPUT_FILE,
          JSON.stringify({ ts: tsNow, event: 'poll-error', table: w.table, error: error.message }) + '\n',
        )
        continue
      }
      if (data && data.length > 0) {
        for (const row of data) {
          appendFileSync(
            OUTPUT_FILE,
            JSON.stringify({ ts: tsNow, event: 'row-change', table: w.table, row }) + '\n',
          )
          totalChanges++
          const stampVal = row[w.stamp]
          if (stampVal && stampVal > lastSeen[w.table]) lastSeen[w.table] = stampVal
        }
      }
    } catch (err) {
      appendFileSync(
        OUTPUT_FILE,
        JSON.stringify({ ts: tsNow, event: 'poll-exception', table: w.table, error: String(err) }) + '\n',
      )
    }
  }
  if (pollCount % 10 === 0) {
    console.log(`[watcher] poll #${pollCount}, ${totalChanges} changes gelogt`)
  }
}

function shutdown() {
  const endTs = new Date().toISOString()
  appendFileSync(
    OUTPUT_FILE,
    JSON.stringify({ ts: endTs, event: 'watcher-stop', polls: pollCount, total_changes: totalChanges }) + '\n',
  )
  console.log(`[watcher] gestoppt ${endTs}, ${pollCount} polls, ${totalChanges} changes total`)
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

setInterval(pollOnce, POLL_INTERVAL_MS)
pollOnce()
