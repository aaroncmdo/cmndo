// Prod Go-Live Accounts Cleanup — loescht die ~157 TEST-Accounts + Test-Verzeichnis-Records.
// Laeuft NACH prod-golive-cleanup.mjs (transaktionale Daten muessen schon weg sein — sonst blocken
// claims/gutachten/finder-FKs die Verzeichnis-Loeschung).
//
// KLASSIFIKATION (verifiziert 13.07., siehe memory/COORDINATION-prod-golive-cleanup.md):
//   KEEP (32): Staff (admin/dispatch/kb/kanzlei/Nicolas/Aaron), 8 echte SV-Bueros, 15 echte Werkstaetten,
//              2 Makler (Daniel Bundesmann/AXA + Aaron-Makler). Alle mit echten Firmen-Domains.
//   DELETE (157): jeder kunde (136, alle Test) + Test-Staff (test-admin@/smoke-*/golden-path-*) +
//                 Test-Partner (aaron.sprafke+*, nicolas.kitta+*, *@claimondo.test, test-*, maik-test@).
//   Test-Verzeichnis: 6 test-sachverstaendige (inkl. "Claimondo Test" auf Aarons behaltenem Login),
//                     3 test-werkstaetten (SMOKE + 2 Aaron-Alias), 5 test-makler.
//
// GUARDRAILS: bricht ab, wenn KEEP/DELETE-Mengen unplausibel oder ein bekannter echter/Test-Account
// falsch klassifiziert ist. FK-Blocker (mitteilungen/tasks/verifiziert_von/aktiviert_von) werden
// vorher aufgeloest (FK-Graph verifiziert). auth.users-Loeschung via Admin-API (cascade profiles + auth).
//
// Service-Role (KEIN MCP execute_sql). Backup (profiles+directory+geloeschte mitteilungen/tasks) + Manifest.
//   node scripts/prod-golive-accounts-cleanup.mjs --dry    # klassifizieren + Guardrails + Vorschau, NICHTS schreiben
//   node scripts/prod-golive-accounts-cleanup.mjs --yes    # scharf

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
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o }

const STAFF = ['admin@claimondo.de', 'dispatch@claimondo.de', 'kb@claimondo.de', 'kanzlei@claimondo.de',
  'nicolas.kitta@claimondo.de', 'aaron.sprafke@claimondo.de', 'lupus.674music@gmail.com']
const isTestWs = (w) => /^werkstatt-smoke@/i.test(w.email || '') || /^aaron\.sprafke\+/i.test(w.email || '') || /\b(smoke|test|demo)\b/i.test(w.name || '')
const isTestMk = (m) => /^test-/i.test(m.email || '') || /^maik-test@/i.test(m.email || '') || /^aaron\.sprafke\+/i.test(m.email || '') || /^nicolas\.kitta\+/i.test(m.email || '') || /\b(smoke|test|demo)\b/i.test(m.firma || '')

async function classify() {
  const { data: svs } = await db.from('sachverstaendige').select('id, profile_id, ist_testaccount, firmenname')
  const { data: wss } = await db.from('werkstaetten').select('id, user_id, email, name')
  const { data: mks } = await db.from('makler').select('id, user_id, email, firma')
  const { data: staffP } = await db.from('profiles').select('id, email').in('email', STAFF)
  const { data: allP } = await db.from('profiles').select('id, email, rolle')

  const realSvProfileIds = svs.filter((s) => !s.ist_testaccount && s.profile_id).map((s) => s.profile_id)
  const realWsUserIds = wss.filter((w) => !isTestWs(w) && w.user_id).map((w) => w.user_id)
  const realMkUserIds = mks.filter((m) => !isTestMk(m) && m.user_id).map((m) => m.user_id)
  const keep = new Set([...staffP.map((p) => p.id), ...realSvProfileIds, ...realWsUserIds, ...realMkUserIds])

  const keepArr = [...keep]
  const deleteProfiles = allP.filter((p) => !keep.has(p.id))
  const deleteIds = deleteProfiles.map((p) => p.id)
  const emailById = Object.fromEntries(allP.map((p) => [p.id, p.email]))

  const testSvIds = svs.filter((s) => s.ist_testaccount).map((s) => s.id)
  const testWsIds = wss.filter(isTestWs).map((w) => w.id)
  const testMkIds = mks.filter(isTestMk).map((m) => m.id)

  return { allP, keep, keepArr, deleteProfiles, deleteIds, emailById, testSvIds, testWsIds, testMkIds }
}

function guardrails(c) {
  const errs = []
  if (c.keep.size < 28 || c.keep.size > 40) errs.push(`KEEP-Menge ${c.keep.size} ausserhalb [28,40] — Klassifikation kaputt?`)
  if (c.deleteIds.length < 140 || c.deleteIds.length > 175) errs.push(`DELETE-Menge ${c.deleteIds.length} ausserhalb [140,175]`)
  const keepEmails = new Set(c.keepArr.map((id) => c.emailById[id]))
  const delEmails = new Set(c.deleteIds.map((id) => c.emailById[id]))
  for (const e of ['daniel.bundesmann@axa.de', 'info@unfallsafe.de', 'info@kfz-sv-kloss.de', 'admin@claimondo.de', 'nicolas.kitta@claimondo.de', 'kb@claimondo.de'])
    if (!keepEmails.has(e)) errs.push(`ECHTER Account ${e} NICHT in KEEP — Abbruch!`)
  for (const e of ['smoke-sv@claimondo.test', 'test-admin@claimondo.de', 'nicolas.kitta+kunde@claimondo.de'])
    if (!delEmails.has(e)) errs.push(`TEST-Account ${e} NICHT in DELETE — Klassifikation verdaechtig`)
  return errs
}

async function main() {
  log(`\n== Prod Go-Live ACCOUNTS Cleanup (${DRY ? 'DRY-RUN' : YES ? 'SCHARF' : 'GESPERRT'}) ==`)
  log(`   Ziel: ${URL_}\n`)
  if (!DRY && !YES) { log('  ! --dry oder --yes noetig. Nichts passiert.\n'); return }

  const c = await classify()
  const errs = guardrails(c)
  log(`  KEEP: ${c.keep.size} Accounts · DELETE: ${c.deleteIds.length} Accounts`)
  log(`  Test-Verzeichnis: ${c.testSvIds.length} SV · ${c.testWsIds.length} Werkstaetten · ${c.testMkIds.length} Makler`)
  if (errs.length) { log('\n  ✗ GUARDRAIL-FEHLER:'); errs.forEach((e) => log('    - ' + e)); log('\n  Abbruch.\n'); process.exit(1) }
  log('  ✓ Guardrails ok (echte Accounts in KEEP, Test-Accounts in DELETE).')

  const delChunks = chunk(c.deleteIds, 50)
  const kA = c.keepArr

  if (DRY) {
    log('\n  Wuerde vorher aufloesen (FK-Blocker):')
    const cnt = async (t, col) => { let q = db.from(t).select('*', { count: 'exact', head: true }).not(col, 'is', null).not(col, 'in', `(${kA.join(',')})`); const { count } = await q; return count ?? 0 }
    log(`   mitteilungen (absender)  ~${await cnt('mitteilungen', 'absender_id')}`)
    log(`   mitteilungen (empfaenger)~${await cnt('mitteilungen', 'empfaenger_id')}`)
    log(`   tasks (zugewiesen/erst.) ~${await cnt('tasks', 'zugewiesen_an')} / ${await cnt('tasks', 'erstellt_von_id')}`)
    log(`   webhook_events           ~${await cnt('webhook_events', 'user_id')}`)
    log(`   sachverstaendige.verifiziert_von (null) ~${await cnt('sachverstaendige', 'verifiziert_von')}`)
    log(`   werkstaetten.aktiviert_von (null)       ~${await cnt('werkstaetten', 'aktiviert_von')}`)
    log(`   makler.aktiviert_von (null)             ~${await cnt('makler', 'aktiviert_von')}`)
    log('\n  DRY-RUN fertig — nichts geschrieben. Scharf: --yes\n')
    return
  }

  // ---- Backup ----
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = { profiles: [], sachverstaendige: [], werkstaetten: [], makler: [], mitteilungen: [], tasks: [] }
  for (const ch of delChunks) { const { data } = await db.from('profiles').select('*').in('id', ch); backup.profiles.push(...(data ?? [])) }
  { const { data } = await db.from('sachverstaendige').select('*').in('id', c.testSvIds); backup.sachverstaendige = data ?? [] }
  { const { data } = await db.from('werkstaetten').select('*').in('id', c.testWsIds); backup.werkstaetten = data ?? [] }
  { const { data } = await db.from('makler').select('*').in('id', c.testMkIds); backup.makler = data ?? [] }
  const backupFile = new URL(`./.prod-golive-accounts-backup-${stamp}.json`, import.meta.url)
  writeFileSync(backupFile, JSON.stringify(backup, null, 2))
  log(`\n  Backup -> ${backupFile.pathname} (${backup.profiles.length} profiles + Verzeichnis)`)

  const manifest = { ranAt: new Date().toISOString(), url: URL_, keep: c.keep.size, deleted_users: 0, steps: {}, verify: {}, failures: [] }

  // ---- Phase 0: FK-Blocker aufloesen ----
  log('\n  Phase 0 — FK-Blocker aufloesen:')
  let mDel = 0, tDel = 0
  for (const ch of delChunks) {
    const a = await db.from('mitteilungen').delete({ count: 'exact' }).in('absender_id', ch); mDel += a.count ?? 0
    const e = await db.from('mitteilungen').delete({ count: 'exact' }).in('empfaenger_id', ch); mDel += e.count ?? 0
    const z = await db.from('tasks').delete({ count: 'exact' }).in('zugewiesen_an', ch); tDel += z.count ?? 0
    const v = await db.from('tasks').delete({ count: 'exact' }).in('erstellt_von_id', ch); tDel += v.count ?? 0
  }
  log(`   mitteilungen geloescht: ${mDel} · tasks geloescht: ${tDel}`)
  for (const ch of delChunks) {
    await db.from('webhook_events').update({ user_id: null }).in('user_id', ch)
    await db.from('sachverstaendige').update({ verifiziert_von: null }).in('verifiziert_von', ch)
    await db.from('sachverstaendige').update({ gesperrt_von_user_id: null }).in('gesperrt_von_user_id', ch)
    await db.from('werkstaetten').update({ aktiviert_von: null }).in('aktiviert_von', ch)
    await db.from('makler').update({ aktiviert_von: null }).in('aktiviert_von', ch)
  }
  // gutachter_monatsabrechnungen auf Test-SV (blockt sonst SV-Delete)
  if (c.testSvIds.length) await db.from('gutachter_monatsabrechnungen').delete().in('sv_id', c.testSvIds)
  manifest.steps.blocker = { mitteilungen: mDel, tasks: tDel }
  log('   verifiziert_von/aktiviert_von genullt, webhook entkoppelt, monatsabrechnung(test-sv) weg.')

  // ---- Phase 1: Test-Verzeichnis-Records loeschen (Kinder cascaden) ----
  log('\n  Phase 1 — Test-Verzeichnis loeschen:')
  const mk = c.testMkIds.length ? (await db.from('makler').delete({ count: 'exact' }).in('id', c.testMkIds)).count : 0
  const ws = c.testWsIds.length ? (await db.from('werkstaetten').delete({ count: 'exact' }).in('id', c.testWsIds)).count : 0
  const sv = c.testSvIds.length ? (await db.from('sachverstaendige').delete({ count: 'exact' }).in('id', c.testSvIds)).count : 0
  manifest.steps.directory = { makler: mk, werkstaetten: ws, sachverstaendige: sv }
  log(`   makler ${mk} · werkstaetten ${ws} · sachverstaendige ${sv} (Kinder via CASCADE)`)

  // ---- Phase 2: auth.users loeschen (cascade profiles + auth-intern + c-refs) ----
  log('\n  Phase 2 — Accounts loeschen (auth.admin.deleteUser):')
  let ok = 0
  for (let i = 0; i < c.deleteIds.length; i++) {
    const id = c.deleteIds[i]
    const { error } = await db.auth.admin.deleteUser(id)
    if (error) manifest.failures.push({ id, email: c.emailById[id], error: error.message })
    else ok++
    if ((i + 1) % 25 === 0) log(`   ${i + 1}/${c.deleteIds.length} ...`)
  }
  manifest.deleted_users = ok
  log(`   geloescht: ${ok}/${c.deleteIds.length}${manifest.failures.length ? ` · FEHLER: ${manifest.failures.length}` : ''}`)
  if (manifest.failures.length) manifest.failures.slice(0, 10).forEach((f) => log(`     ✗ ${f.email}: ${f.error}`))

  // ---- Verify ----
  log('\n  Verify:')
  const v = async (t, f) => { let q = db.from(t).select('*', { count: 'exact', head: true }); if (f) q = f(q); const { count } = await q; return count ?? 0 }
  manifest.verify.profiles = await v('profiles')
  manifest.verify.sachverstaendige = await v('sachverstaendige')
  manifest.verify.werkstaetten = await v('werkstaetten')
  manifest.verify.makler = await v('makler')
  manifest.verify.sv_testaccounts_rest = await v('sachverstaendige', (q) => q.eq('ist_testaccount', true))
  log(`   profiles ${manifest.verify.profiles} (erwartet 32) · sachverstaendige ${manifest.verify.sachverstaendige} (8) · werkstaetten ${manifest.verify.werkstaetten} (15) · makler ${manifest.verify.makler} (2)`)
  log(`   sachverstaendige ist_testaccount rest: ${manifest.verify.sv_testaccounts_rest} (erwartet 0)`)

  const manifestFile = new URL(`./.prod-golive-accounts-manifest-${stamp}.json`, import.meta.url)
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
  log(`\n  Manifest -> ${manifestFile.pathname}`)
  log('  --- ACCOUNTS-CLEANUP FERTIG ---\n')
}

main().catch((e) => { console.error('ACCOUNTS-CLEANUP-FEHLER:', e.message); process.exit(1) })
