// Read-only Live-Schema-Probe fuer CMM-44 Phase 4.1 (v_claim_listing + v_claim_timeline Re-Base).
// Bypassed den MCP-Pooler via PostgREST OpenAPI (Port 443). cwd MUSS das Haupt-Repo sein (.env.local).
// Nutzung (aus Haupt-Repo-cwd):
//   node ".claude/worktrees/cmm44-phase-41-light-views/scripts/probe-phase41-schema.mjs"
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
if (!KEY) { console.error('FEHLER: SUPABASE_SERVICE_ROLE_KEY fehlt'); process.exit(1) }
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// Tabellen/Views deren Spalten-Existenz Phase 4.1 entscheidet
const CHECKS = {
  claims: ['sv_id', 'id', 'claim_nummer', 'phase', 'status'],
  faelle: ['id', 'claim_id', 'sv_id'],
  phase_transitions: ['claim_id', 'fall_id', 'id', 'from_phase', 'to_phase', 'transition_at'],
  timeline: ['claim_id', 'fall_id', 'id', 'titel', 'erstellt_von'],
  gutachter_termine: ['claim_id', 'fall_id'],
  leads: ['konvertiert_zu_claim_id'],
  notification_events: ['claim_id', 'fall_id'],
}
// Views deren Output-Shape ich gegen die Migration cross-checke
const VIEWS = ['v_claim_listing', 'v_claim_timeline']

async function main() {
  const res = await fetch(`${URL}/rest/v1/`, { headers: HEADERS })
  if (!res.ok) { console.error(`OpenAPI-Fetch ${res.status}`); console.error(await res.text()); process.exit(2) }
  const spec = await res.json()
  const defs = spec.definitions || spec.components?.schemas || {}

  console.log('=== Spalten-Existenz (Phase-4.1-entscheidend) ===')
  for (const [tbl, cols] of Object.entries(CHECKS)) {
    const d = defs[tbl]
    if (!d) { console.log(`\n## ${tbl}: NICHT VORHANDEN (PostgREST-unsichtbar)`); continue }
    const props = d.properties || {}
    console.log(`\n## ${tbl}`)
    for (const c of cols) {
      const present = Object.prototype.hasOwnProperty.call(props, c)
      console.log(`   ${present ? 'JA ' : 'NEIN'}  ${c}${present ? '  (' + (props[c].format || props[c].type) + ')' : ''}`)
    }
  }

  console.log('\n=== View-Output-Shapes (live, cross-check vs Migration) ===')
  for (const v of VIEWS) {
    const d = defs[v]
    if (!d) { console.log(`\n## ${v}: NICHT VORHANDEN`); continue }
    const cols = Object.keys(d.properties || {})
    console.log(`\n## ${v} (${cols.length} Spalten)`)
    console.log('   ' + cols.join(', '))
  }

  // Row-Counts (Kontext fuer Backfill-Aufwand)
  console.log('\n=== Row-Counts (Backfill-Aufwand) ===')
  for (const tbl of ['phase_transitions', 'timeline', 'claims', 'faelle']) {
    try {
      const r = await fetch(`${URL}/rest/v1/${tbl}?select=id&limit=1`, {
        headers: { ...HEADERS, Prefer: 'count=exact', Range: '0-0' },
      })
      const cr = r.headers.get('content-range') // format: 0-0/<total>
      console.log(`   ${tbl}: ${cr ? cr.split('/')[1] : 'HTTP ' + r.status}`)
    } catch (e) { console.log(`   ${tbl}: Fehler ${e.message}`) }
  }

  // Wie viele phase_transitions / timeline haben einen aufloesbaren fall->claim Pfad?
  console.log('\n=== fall_id->claim_id Aufloesbarkeit (Backfill-Vollstaendigkeit) ===')
  try {
    const r = await fetch(`${URL}/rest/v1/phase_transitions?select=fall_id&fall_id=is.null`, {
      headers: { ...HEADERS, Prefer: 'count=exact', Range: '0-0' },
    })
    const cr = r.headers.get('content-range')
    console.log(`   phase_transitions mit fall_id IS NULL: ${cr ? cr.split('/')[1] : 'HTTP ' + r.status}`)
  } catch (e) { console.log(`   Fehler ${e.message}`) }
  try {
    const r = await fetch(`${URL}/rest/v1/timeline?select=fall_id&fall_id=is.null`, {
      headers: { ...HEADERS, Prefer: 'count=exact', Range: '0-0' },
    })
    const cr = r.headers.get('content-range')
    console.log(`   timeline mit fall_id IS NULL: ${cr ? cr.split('/')[1] : 'HTTP ' + r.status}`)
  } catch (e) { console.log(`   Fehler ${e.message}`) }
}
main().catch((e) => { console.error(e); process.exit(3) })
