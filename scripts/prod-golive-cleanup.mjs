// Prod Go-Live Cleanup — loescht NUR transaktionale Testdaten, damit Prod sauber live geht.
// Audit-Grundlage: JEDER Lead/Claim/Finder-Anfrage/kunde-Profil in Prod ist verifiziert Test/Demo
// (Aaron/Nicolas/Smoke/abandoned) — 0 echte Endkunden. Siehe memory/COORDINATION-prod-golive-cleanup.md.
//
// SCOPE (Aaron 13.07.: "nur transaktionale Daten", Accounts/Anker behalten, sofort scharf):
//   RAUS  : leads, claims, gutachter_finder_anfragen + Workflow-Kinder (via FK-CASCADE bzw. explizit)
//   BLEIBT: profiles + auth.users (Test + echt), Partner-Verzeichnis (sachverstaendige/werkstaetten/makler),
//           Master-Data (personen/firmen/vehicles/verified_contacts), Config/Referenz, Telemetrie/Logs
//           (email_log/ai_usage_log/webhook_events — nur claim_id/lead_id werden genullt),
//           Prospecting (sv_leads/partner_leads), standalone Tasks (152)/admin_termine (14),
//           anfragen-Inbox ("niemals DELETE"-Design), benachrichtigungen/mitteilungen (Bell-Historie).
//
// FK-Reihenfolge aus pg_constraint verifiziert: Blocker (NO ACTION/RESTRICT mit Zeilen) VOR den Roots,
// Rest raeumt CASCADE. Master-Data wird bewusst NICHT gewiped (echte Werkstaetten referenzieren personen
// als ansprechpartner_person_id / firmen-flotte-Lane haengt an firmen+vehicles).
//
// Service-Role-DML (KEIN MCP execute_sql — AGENTS.md Regel 2). Idempotent (re-run safe), Voll-Backup der
// direkt geloeschten Zeilen + Manifest.
//
//   node scripts/prod-golive-cleanup.mjs --dry    # nur zaehlen + Blast-Radius zeigen, NICHTS schreiben
//   node scripts/prod-golive-cleanup.mjs --yes    # scharf: Backup -> Delete (FK-safe) -> Verify -> Manifest

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

// --- env aus .env.local (Prod-Mirror) ---
const envRaw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envRaw.split('\n')) {
  const l = line.replace(/\r$/, '')
  if (!l.includes('=') || l.trimStart().startsWith('#')) continue
  const i = l.indexOf('=')
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const DRY = process.argv.includes('--dry')
const YES = process.argv.includes('--yes')
const log = (...a) => console.log(...a)

// --- Filter-Uebersetzung (supabase-js / PostgREST) ---
function applyFilter(q, f) {
  if (f === 'all') return q.not('id', 'is', null)                                   // alle Zeilen (id = PK, nie null)
  if (f === 'lead') return q.not('lead_id', 'is', null)                             // nur lead-verknuepft
  if (f === 'linked3') return q.or('claim_id.not.is.null,lead_id.not.is.null,fall_id.not.is.null')
  throw new Error('unknown filter ' + f)
}

// --- FK-sichere Loeschreihenfolge (Blocker zuerst, dann Roots -> CASCADE raeumt den Rest) ---
const STEPS = [
  { t: 'partner_provisionen',        f: 'all',     note: 'alle (test, kein echtes Geld, blockt bridge-cascade)' },
  { t: 'gutachter_termine',          f: 'all',     note: 'alle (test, blockt leads + bridge)' },
  { t: 'tasks',                      f: 'lead',    note: 'nur lead-verknuepft; ~152 standalone bleiben' },
  { t: 'gutachter_finder_anfragen',  f: 'all',     note: 'alle (test/abandoned, blockt leads + bridge)' },
  { t: 'auftraege',                  f: 'all',     note: 'alle (claim-verknuepft, kein cascade)' },
  { t: 'admin_termine',              f: 'linked3', note: 'nur claim/lead/fall-verknuepft; ~14 standalone bleiben' },
  { t: 'fall_dokumente',             f: 'linked3', note: 'nur claim/lead/fall-verknuepft' },
  { t: 'anspruch_schaetzungen',      f: 'lead',    note: 'nur lead-verknuepft' },
  { t: 'flow_links',                 f: 'all',     note: 'alle (test magic-links)' },
  { t: 'claims',                     f: 'all',     note: 'alle -> CASCADE ~30 Kind-Tabellen' },
  { t: 'leads',                      f: 'all',     note: 'alle -> CASCADE lead_historie/dokument_upload/timeline/...' },
]

// Nur zur DRY-Anzeige: was CASCADE zusaetzlich mitnimmt (kein eigener Delete-Schritt).
const CASCADE_PREVIEW = [
  'claim_parties', 'gutachten', 'timeline', 'nachrichten', 'sla_tracking', 'faelle_claim_bridge',
  'lead_historie', 'dokument_upload_anfragen', 'notification_events', 'phase_transitions',
  'reparatur_termine', 'chat_threads', 'personenschaden_personen', 'pflichtdokumente',
]
// Bleibt bewusst erhalten (Kontroll-Anzeige nach dem Lauf):
const KEEP_CHECK = [
  'profiles', 'sachverstaendige', 'werkstaetten', 'makler', 'personen', 'firmen', 'vehicles',
  'sv_leads', 'partner_leads', 'versicherungen', 'benachrichtigungen', 'mitteilungen', 'email_log',
]

async function countRows(t, f) {
  let q = db.from(t).select('*', { count: 'exact', head: true })
  if (f) q = applyFilter(q, f)
  const { count, error } = await q
  if (error) throw new Error(`count ${t}: ${error.message}`)
  return count ?? 0
}

// paginierter Voll-Export der zu loeschenden Zeilen (PostgREST cappt bei 1000/Request)
async function fetchAll(t, f) {
  const rows = []
  const size = 1000
  for (let from = 0; ; from += size) {
    let q = db.from(t).select('*').order('id', { ascending: true }).range(from, from + size - 1)
    q = applyFilter(q, f)
    const { data, error } = await q
    if (error) throw new Error(`backup ${t}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return rows
}

async function del(t, f) {
  let q = db.from(t).delete({ count: 'exact' })
  q = applyFilter(q, f)
  const { count, error } = await q
  if (error) throw new Error(`delete ${t}: ${error.message}`)
  return count ?? 0
}

async function main() {
  log(`\n== Prod Go-Live Cleanup (${DRY ? 'DRY-RUN' : YES ? 'SCHARF' : 'GESPERRT'}) ==`)
  log(`   Ziel: ${URL_}`)
  log(`   Scope: nur transaktionale Testdaten. Accounts/Master-Data/Config/Logs/Prospecting BLEIBEN.\n`)

  if (!DRY && !YES) {
    log('  ! Kein --dry und kein --yes. Aus Sicherheit passiert nichts.')
    log('    Vorschau:  node scripts/prod-golive-cleanup.mjs --dry')
    log('    Scharf  :  node scripts/prod-golive-cleanup.mjs --yes\n')
    return
  }

  // ---- Vorschau (immer, auch vor scharfem Lauf) ----
  log('  Direkt geloescht (Delete-Schritte, FK-sichere Reihenfolge):')
  let sumDirect = 0
  for (const s of STEPS) {
    const n = await countRows(s.t, s.f)
    sumDirect += n
    log(`   ${String(n).padStart(5)}  ${s.t.padEnd(26)} ${s.note}`)
  }
  log(`   ${String(sumDirect).padStart(5)}  = Summe direkt\n`)

  log('  Zusaetzlich via CASCADE (kein eigener Schritt):')
  for (const t of CASCADE_PREVIEW) {
    const n = await countRows(t, null)
    log(`   ${String(n).padStart(5)}  ${t}`)
  }
  log('')

  log('  Bleibt erhalten (Kontrolle):')
  for (const t of KEEP_CHECK) {
    const n = await countRows(t, null)
    log(`   ${String(n).padStart(5)}  ${t}`)
  }
  log('')

  if (DRY) {
    log('  DRY-RUN fertig — nichts geschrieben. Scharf: node scripts/prod-golive-cleanup.mjs --yes\n')
    return
  }

  // ---- Scharf: Backup -> Delete -> Verify -> Manifest ----
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const manifest = { ranAt: new Date().toISOString(), url: URL_, steps: [], verify: {}, backupFile: null }

  log('  Backup der direkt geloeschten Zeilen...')
  const backup = {}
  for (const s of STEPS) backup[s.t] = { filter: s.f, rows: await fetchAll(s.t, s.f) }
  const backupFile = new URL(`./.prod-golive-cleanup-backup-${stamp}.json`, import.meta.url)
  writeFileSync(backupFile, JSON.stringify(backup, null, 2))
  manifest.backupFile = backupFile.pathname
  const bTotal = Object.values(backup).reduce((a, b) => a + b.rows.length, 0)
  log(`   -> ${bTotal} Zeilen gesichert in ${backupFile.pathname}\n`)

  log('  Loesche (in Reihenfolge):')
  for (const s of STEPS) {
    const deleted = await del(s.t, s.f)
    manifest.steps.push({ table: s.t, filter: s.f, deleted })
    log(`   ${String(deleted).padStart(5)}  ${s.t}`)
  }

  log('\n  Verify (Roots + Stichprobe Kinder muessen 0 sein):')
  for (const t of ['claims', 'leads', 'gutachter_finder_anfragen', 'gutachter_termine', 'claim_parties', 'gutachten', 'faelle_claim_bridge', 'lead_historie', 'flow_links', 'partner_provisionen']) {
    const n = await countRows(t, null)
    manifest.verify[t] = n
    log(`   ${String(n).padStart(5)}  ${t}${n === 0 ? '' : '   <-- WARN: nicht leer!'}`)
  }

  const manifestFile = new URL(`./.prod-golive-cleanup-manifest-${stamp}.json`, import.meta.url)
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
  log(`\n  Manifest -> ${manifestFile.pathname}`)
  log('  --- CLEANUP FERTIG ---\n')
}

main().catch((e) => { console.error('CLEANUP-FEHLER:', e.message); process.exit(1) })
