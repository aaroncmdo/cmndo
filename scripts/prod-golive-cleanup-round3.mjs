// Prod Go-Live Cleanup RUNDE 3 — Rest-Test-Muell nach Transaktions- + Accounts-Cleanup.
// Regel (Aaron 13.07.): "alles was echt ist lassen, nur Test-/verwaiste Daten weg, ansonsten alles loeschen".
// => Loeschen nach OWNERSHIP, nicht nach Kategorie. Echt-verknuepfte Zeilen bleiben.
//
// WEG: verwaiste Identitaet/Assets (personen/verified_contacts/vehicles-orphan/vehicle_vorschaeden),
//      13 Test-Rueckrufe (Colour Master bleibt), anfragen-Inbox, Notification-/Message-Rauschen
//      (benachrichtigungen/mitteilungen/notification_*/timeline), stale Tasks (dispatch/sa/reliability +
//      sv-Tasks fuer geloeschte SVs), email_log an Test-Empfaenger, consent_records (anonym Test-Zeit),
//      Telemetrie (cron_jobs_audit/health_check_runs/ai_usage_log/webhook_events), routing_cache,
//      verwaiste partner_rang.
// BLEIBT: google_bewertungen_cache + sv_kalender_events_cache (echte SVs), email_log an echte Accounts,
//      promo_clicks (echte Codes), partner_rang echt, 8 sv-Tasks fuer echte SVs, pflichtdokumente,
//      sv_leads/partner_leads/maklerpools/promotion_codes/versicherungen/Config, firmen-flotte (3 veh + 2 firmen).
//
// Service-Role-DML (kein MCP execute_sql). Backup der substanziellen Tabellen + Manifest.
//   node scripts/prod-golive-cleanup-round3.mjs --dry
//   node scripts/prod-golive-cleanup-round3.mjs --yes

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

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
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const quoted = (arr) => `(${arr.map((v) => `"${v}"`).join(',')})`

async function fetchAll(table, apply) {
  const rows = []; const size = 1000
  for (let from = 0; ; from += size) {
    let q = db.from(table).select('*').order('id', { ascending: true }).range(from, from + size - 1)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw new Error(`fetch ${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return rows
}

async function main() {
  log(`\n== Prod Go-Live Cleanup RUNDE 3 (${DRY ? 'DRY-RUN' : YES ? 'SCHARF' : 'GESPERRT'}) ==`)
  log(`   Ziel: ${URL_}\n`)
  if (!DRY && !YES) { log('  ! --dry oder --yes noetig.\n'); return }

  // ---- Keep-Kontext (echt) ----
  const { data: profs } = await db.from('profiles').select('email').not('email', 'is', null)
  const realEmails = profs.map((p) => p.email)
  const { data: svs } = await db.from('sachverstaendige').select('id')
  const svIds = svs.map((s) => s.id)
  const { data: flotte } = await db.from('flotten_fahrzeuge').select('vehicle_id').not('vehicle_id', 'is', null)
  const { data: schaden } = await db.from('schadenkarten').select('fahrzeug_id').not('fahrzeug_id', 'is', null)
  const keepVehicleIds = [...new Set([...flotte.map((f) => f.vehicle_id), ...schaden.map((s) => s.fahrzeug_id)])]
  const { data: mk } = await db.from('makler').select('id')
  const { data: ws } = await db.from('werkstaetten').select('id')
  const partnerIds = [...mk.map((m) => m.id), ...ws.map((w) => w.id), ...svIds]

  // ---- Tasks: delete-set in JS bestimmen (dispatch/sa/reliability + sv-Tasks fuer geloeschte SVs) ----
  const { data: allTasks } = await db.from('tasks').select('id, typ, entity_id')
  const svSet = new Set(svIds.map(String))
  const delTaskIds = allTasks.filter((t) => {
    if (['dispatch', 'sa_ausstehend', 'reliability'].includes(t.typ)) return true
    if ((t.typ || '').startsWith('sv')) return !(t.entity_id != null && svSet.has(String(t.entity_id)))
    return false
  }).map((t) => t.id)

  log(`  Keep-Kontext: ${realEmails.length} echte Emails · ${svIds.length} SVs · ${keepVehicleIds.length} Fahrzeuge (flotte/schadenkarte) · ${partnerIds.length} Partner`)
  log(`  Tasks: ${delTaskIds.length} loeschen / ${allTasks.length - delTaskIds.length} behalten (echte sv-Tasks + Colour-Master-Kontext)\n`)

  // ---- Delete-Schritte (FK-sichere Reihenfolge) ----
  const STEPS = [
    { label: 'notification_events (+deliveries cascade)', t: 'notification_events', f: (q) => q.not('id', 'is', null) },
    { label: 'benachrichtigungen', t: 'benachrichtigungen', f: (q) => q.not('id', 'is', null) },
    { label: 'mitteilungen', t: 'mitteilungen', f: (q) => q.not('id', 'is', null) },
    { label: 'timeline', t: 'timeline', f: (q) => q.not('id', 'is', null) },
    { label: '13 Test-Rueckrufe (Colour Master bleibt)', t: 'admin_termine', f: (q) => q.eq('typ', 'rueckruf').ilike('titel', 'Rückruf:%'), backup: true },
    { label: 'anfragen-Inbox (Test)', t: 'anfragen', f: (q) => q.not('id', 'is', null), backup: true },
    { label: 'email_log an Test-Empfaenger (echte bleiben)', t: 'email_log', f: (q) => q.not('empfaenger', 'in', quoted(realEmails)), backup: true },
    { label: 'consent_records (anonym Test-Zeit)', t: 'consent_records', f: (q) => q.not('id', 'is', null) },
    { label: 'verified_contacts (verwaist)', t: 'verified_contacts', f: (q) => q.not('id', 'is', null) },
    { label: 'personen (verwaist, 0 echt)', t: 'personen', f: (q) => q.not('id', 'is', null), backup: true },
    { label: 'vehicles verwaist (flotte bleibt)', t: 'vehicles', f: (q) => q.not('id', 'in', quoted(keepVehicleIds)), backup: true },
    { label: 'partner_rang verwaist (echte bleiben)', t: 'partner_rang', f: (q) => q.not('partner_id', 'in', quoted(partnerIds)) },
    { label: 'routing_cache (regeneriert)', t: 'routing_cache', f: (q) => q.not('von_hash', 'is', null) },
    { label: 'ai_usage_log (Test-Telemetrie)', t: 'ai_usage_log', f: (q) => q.not('id', 'is', null) },
    { label: 'webhook_events (Test-Telemetrie)', t: 'webhook_events', f: (q) => q.not('id', 'is', null) },
    { label: 'health_check_runs (Telemetrie)', t: 'health_check_runs', f: (q) => q.not('id', 'is', null) },
    { label: 'cron_jobs_audit (Telemetrie, gross)', t: 'cron_jobs_audit', f: (q) => q.not('id', 'is', null) },
  ]

  if (DRY) {
    log('  Wuerde loeschen:')
    for (const s of STEPS) {
      let q = db.from(s.t).select('*', { count: 'exact', head: true }); q = s.f(q)
      const { count, error } = await q
      log(`   ${String(error ? 'ERR' : (count ?? 0)).padStart(6)}  ${s.label}${error ? ' — ' + error.message : ''}`)
    }
    log(`   ${String(delTaskIds.length).padStart(6)}  tasks (stale/orphan)`)
    log('\n  BLEIBT (echt): google_bewertungen_cache, sv_kalender_events_cache, email_log(real), promo_clicks,')
    log('    partner_rang(real), 8 sv-Tasks, pflichtdokumente, sv_leads/partner_leads, promotion_codes, Config, firmen-flotte.')
    log('\n  DRY-RUN fertig. Scharf: --yes\n')
    return
  }

  // ---- Backup (substanzielle Tabellen) ----
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = {}
  for (const s of STEPS.filter((x) => x.backup)) backup[s.t] = await fetchAll(s.t, s.f)
  backup.tasks_deleted = allTasks.filter((t) => delTaskIds.includes(t.id))
  const backupFile = new URL(`./.prod-golive-round3-backup-${stamp}.json`, import.meta.url)
  writeFileSync(backupFile, JSON.stringify(backup, null, 2))
  const bTotal = Object.values(backup).reduce((a, b) => a + b.length, 0)
  log(`  Backup -> ${backupFile.pathname} (${bTotal} Zeilen substanziell)\n`)

  const manifest = { ranAt: new Date().toISOString(), url: URL_, steps: {}, tasks_deleted: 0 }

  // ---- Tasks zuerst (gate_task_id-Selbstref nullen, dann loeschen) ----
  log('  Tasks:')
  for (const ch of chunk(delTaskIds, 50)) await db.from('tasks').update({ gate_task_id: null }).in('gate_task_id', ch)
  let tDel = 0
  for (const ch of chunk(delTaskIds, 50)) { const { count } = await db.from('tasks').delete({ count: 'exact' }).in('id', ch); tDel += count ?? 0 }
  manifest.tasks_deleted = tDel
  log(`   ${tDel} geloescht (task_reminders cascade)\n`)

  // ---- Steps ----
  log('  Loesche:')
  for (const s of STEPS) {
    let q = db.from(s.t).delete({ count: 'exact' }); q = s.f(q)
    const { count, error } = await q
    if (error) { log(`   ERR    ${s.t}: ${error.message}`); manifest.steps[s.t] = 'ERROR: ' + error.message }
    else { log(`   ${String(count ?? 0).padStart(6)}  ${s.t}`); manifest.steps[s.t] = count ?? 0 }
  }

  // ---- Verify (echt bleibt) ----
  log('\n  Verify (echt muss bleiben):')
  const v = async (t) => { const { count } = await db.from(t).select('*', { count: 'exact', head: true }); return count ?? 0 }
  for (const t of ['profiles', 'sachverstaendige', 'werkstaetten', 'makler', 'sv_leads', 'partner_leads', 'pflichtdokumente', 'google_bewertungen_cache', 'sv_kalender_events_cache', 'promotion_codes', 'versicherungen', 'email_log', 'tasks', 'admin_termine', 'vehicles', 'personen']) {
    log(`   ${String(await v(t)).padStart(6)}  ${t}`)
  }
  const manifestFile = new URL(`./.prod-golive-round3-manifest-${stamp}.json`, import.meta.url)
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
  log(`\n  Manifest -> ${manifestFile.pathname}`)
  log('  --- RUNDE 3 FERTIG ---\n')
}

main().catch((e) => { console.error('ROUND3-FEHLER:', e.message); process.exit(1) })
