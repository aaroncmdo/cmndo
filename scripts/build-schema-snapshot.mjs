#!/usr/bin/env node
// Regeneriert scripts/lib/schema-snapshot.json aus der Live-DB — die Ground-Truth der Write-Achse
// von check:query-parse. Quelle: PostgREST-OpenAPI (`GET /rest/v1/`), REST-only (kein Postgres-
// Superuser noetig): Spalten stimmen exakt mit pg_catalog (verifiziert 17.07.: claims 194==194,
// 0 Diff). Braucht NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (READ-only Schema-Fetch).
//
// Warum ein Script + Cron (statt manueller Disziplin): der Snapshot driftete 2x in 12h still
// (claims.status-Drop, finance_eintraege-Drop), weil "jede Migration zieht den Snapshot nach"
// im Multi-Session-Betrieb nicht haelt. Der Cron (.github/workflows/schema-snapshot-regen.yml)
// faehrt dies naechtlich + oeffnet bei Drift automatisch einen PR gegen staging.
//
// Determinismus (Pflicht, sonst PRt der Cron bei jedem Lauf): KEIN Timestamp im Output; Tabellen
// alphabetisch, Spalten in OpenAPI-Reihenfolge (== pg_attribute attnum, verifiziert -> kein
// Reorder-Rauschen). Nur echte Schema-Drift erzeugt einen Diff.
//
// kind (t/v): aus dem bestehenden Snapshot uebernommen (Relationen wechseln praktisch nie Typ);
// NEUE Relation -> Heuristik ueber den OpenAPI-Pfad (POST vorhanden = schreibbar -> 't', nur GET
// -> 'v'). Semantisch fuer die Write-Achse korrekt (validiert nur, wohin man schreiben kann).
// fks: der Runner nutzt sie NICHT (0 Refs) -> unveraendert aus dem bestehenden Snapshot
// uebernommen (eingefroren; nicht regeneriert).
//
// Lauf lokal: node --env-file=.env.local scripts/build-schema-snapshot.mjs   (schreibt das File)
//             node --env-file=.env.local scripts/build-schema-snapshot.mjs --check   (nur Drift-Exit)

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SNAP_PATH = join(HERE, 'lib', 'schema-snapshot.json')
const CHECK_ONLY = process.argv.includes('--check')

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  // Bewusst exit 0: der Cron soll bei fehlendem Secret nicht naechtlich rot failen, sondern
  // sichtbar skippen (Secret-Setup ist ein Config-Schritt, kein Runtime-Fehler).
  console.log('[snapshot-regen] NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen → skip.')
  process.exit(0)
}

async function fetchOpenApi() {
  // Exit-Policy fuer den unbeaufsichtigten Cron:
  //  - 4xx (Auth/Config, persistent) -> exit 2 (rot = braucht Aufmerksamkeit, z.B. falsches Secret).
  //  - 5xx/522/Netzwerk (transient, z.B. Cloudflare-522 bei Supabase-Blip) -> nach Retries exit 0
  //    (SKIP, nicht naechtlich rot spammen; der naechste Lauf holt die Drift nach).
  let lastErr = 'unbekannt'
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const r = await fetch(`${URL_}/rest/v1/`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/openapi+json' },
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (r.ok) return await r.json()
      lastErr = `HTTP ${r.status}`
      if (r.status >= 400 && r.status < 500) {
        console.error(`[snapshot-regen] OpenAPI-Fetch ${lastErr} (Auth/Config?) — Job failt bewusst (fixen: Secret/URL pruefen).`)
        process.exit(2)
      }
      // 5xx/522 -> transient, weiter retrien.
    } catch (e) {
      clearTimeout(timer)
      lastErr = String(e).slice(0, 120)
    }
    if (attempt < 3) await new Promise((res) => setTimeout(res, 1000 * attempt))
  }
  console.log(`[snapshot-regen] OpenAPI transient nicht erreichbar (${lastErr}) nach 3 Versuchen → skip (exit 0; naechster Lauf holt nach).`)
  process.exit(0)
}

const openapi = await fetchOpenApi()
const defs = openapi.definitions || {}
const paths = openapi.paths || {}
const existing = JSON.parse(readFileSync(SNAP_PATH, 'utf8'))
const prevKind = new Map(Object.entries(existing.tables).map(([n, t]) => [n, t.kind]))

// tables neu bauen (alphabetisch; Spalten in OpenAPI-Reihenfolge).
const tables = {}
for (const name of Object.keys(defs).sort()) {
  const columns = Object.keys(defs[name].properties || {})
  if (columns.length === 0) continue
  let kind = prevKind.get(name)
  if (!kind) {
    // neue Relation: schreibbar (POST-Pfad) -> 't', sonst 'v'. PR-Review verifiziert.
    kind = paths[`/${name}`]?.post ? 't' : 'v'
  }
  tables[name] = { kind, columns }
}

const snapshot = {
  _regen: 'Automatisch regeneriert via scripts/build-schema-snapshot.mjs (Cron: .github/workflows/schema-snapshot-regen.yml). NICHT manuell editieren — bei Schema-Aenderung Script laufen lassen. fks: eingefroren/unused.',
  project: existing.project ?? 'paizkjajbuxxksdoycev',
  tables,
  fks: existing.fks ?? [],
}

const nextStr = JSON.stringify(snapshot, null, 1) + '\n'
const prevStr = readFileSync(SNAP_PATH, 'utf8')

if (nextStr === prevStr) {
  console.log(`[snapshot-regen] in sync — ${Object.keys(tables).length} Relationen, keine Drift.`)
  process.exit(0)
}

// Drift: kompakte Zusammenfassung (nur Basistabellen-Spalten = das, was die Write-Achse nutzt).
const prevBase = new Map(Object.entries(existing.tables).filter(([, t]) => t.kind === 't').map(([n, t]) => [n, new Set(t.columns)]))
const nextBase = new Map(Object.entries(tables).filter(([, t]) => t.kind === 't').map(([n, t]) => [n, new Set(t.columns)]))
const relAdded = [...nextBase.keys()].filter((n) => !prevBase.has(n))
const relGone = [...prevBase.keys()].filter((n) => !nextBase.has(n))
const colDrift = []
for (const [n, cols] of nextBase) {
  const prev = prevBase.get(n); if (!prev) continue
  const added = [...cols].filter((c) => !prev.has(c))
  const removed = [...prev].filter((c) => !cols.has(c))
  if (added.length || removed.length) colDrift.push(`  ${n}: ${added.length ? '+[' + added.join(',') + ']' : ''}${removed.length ? ' -[' + removed.join(',') + ']' : ''}`)
}
console.log('[snapshot-regen] DRIFT erkannt:')
if (relAdded.length) console.log(`  neue Tabellen: ${relAdded.join(', ')}`)
if (relGone.length) console.log(`  gedroppte Tabellen: ${relGone.join(', ')}`)
if (colDrift.length) { console.log('  Spalten-Drift:'); colDrift.forEach((d) => console.log(d)) }

if (CHECK_ONLY) process.exit(1)
writeFileSync(SNAP_PATH, nextStr)
console.log(`[snapshot-regen] geschrieben: ${Object.keys(tables).length} Relationen.`)
process.exit(0)
