// Read-only Schema-Introspektion fuer Monika-Embed Stream 0.
// Bypassed den MCP-Pooler (Port 6543) via PostgREST OpenAPI (Port 443).
// Nutzung: node scripts/probe-monika-schema.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function env(key) {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  const m = raw.match(new RegExp('^' + key + '=(.+)$', 'm'))
  return m?.[1]?.trim()
}

const URL =
  env('NEXT_PUBLIC_SUPABASE_URL') ||
  env('SUPABASE_URL') ||
  'https://paizkjajbuxxksdoycev.supabase.co'
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')

if (!KEY) {
  console.error('FEHLER: SUPABASE_SERVICE_ROLE_KEY nicht in .env.local gefunden')
  process.exit(1)
}

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const INTEREST = [
  'abrechnungen', 'abrechnung_positionen', 'leads', 'faelle', 'claims',
  'claim_parties', 'claim_payments', 'gutachter_termine', 'sachverstaendige',
  'profiles', 'makler', 'kanzleien', 'gutachter_finder_anfragen', 'auftraege',
  'kanzlei_faelle',
]
const SHOULD_NOT_EXIST = [
  'anfragen', 'embed_sites', 'embed_abrechnung_positionen',
  'embed_widget_events', 'embed_backlink_impressions',
]

async function main() {
  // 1) OpenAPI-Spec (alle public-Tabellen + Spalten + FK/PK-Notes)
  const res = await fetch(`${URL}/rest/v1/`, { headers: HEADERS })
  if (!res.ok) {
    console.error(`OpenAPI-Fetch fehlgeschlagen: ${res.status} ${res.statusText}`)
    console.error(await res.text())
    process.exit(2)
  }
  const spec = await res.json()
  const defs = spec.definitions || spec.components?.schemas || {}
  const allTables = Object.keys(defs).sort()

  console.log('=== ALLE public-Tabellen/Views (PostgREST-sichtbar) ===')
  console.log(allTables.join(', '))
  console.log('\n=== Namens-Clash-Check (muessen FEHLEN) ===')
  for (const t of SHOULD_NOT_EXIST) {
    console.log(`  ${t}: ${allTables.includes(t) ? '!!! EXISTIERT BEREITS !!!' : 'frei (ok)'}`)
  }

  console.log('\n=== Interessante Tabellen — Spalten + FK/PK ===')
  for (const t of INTEREST) {
    const d = defs[t]
    if (!d) { console.log(`\n## ${t}: NICHT VORHANDEN`); continue }
    console.log(`\n## ${t}`)
    const required = new Set(d.required || [])
    const props = d.properties || {}
    for (const [name, p] of Object.entries(props)) {
      const fmt = p.format || p.type || '?'
      const note = (p.description || '').replace(/\s+/g, ' ').trim()
      const req = required.has(name) ? ' NOT NULL' : ''
      console.log(`   - ${name}: ${fmt}${req}${note ? '  // ' + note : ''}`)
    }
  }

  // 2) RPC-Test fuer rohes SQL (falls exec_sql o.ae. existiert)
  console.log('\n=== RPC-Probe fuer rohes SQL ===')
  for (const fn of ['exec_sql', 'execute_sql', 'exec', 'sql', 'run_sql']) {
    try {
      const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: 'select 1 as ping', query: 'select 1 as ping' }),
      })
      console.log(`  rpc/${fn}: HTTP ${r.status}${r.status === 404 ? ' (nicht vorhanden)' : ''}`)
      if (r.ok) console.log('    -> ' + (await r.text()).slice(0, 200))
    } catch (e) {
      console.log(`  rpc/${fn}: Fehler ${e.message}`)
    }
  }

  // 3) Storage-Buckets (Q9: existiert 'rechnungen'?)
  console.log('\n=== Storage-Buckets ===')
  try {
    const b = await fetch(`${URL}/storage/v1/bucket`, { headers: HEADERS })
    if (b.ok) {
      const buckets = await b.json()
      for (const bk of buckets) console.log(`  ${bk.name} (public=${bk.public})`)
    } else {
      console.log(`  HTTP ${b.status}`)
    }
  } catch (e) {
    console.log(`  Fehler ${e.message}`)
  }
}

main().catch((e) => { console.error(e); process.exit(3) })
