// Fundament J6 (Kanzlei-Übergabe) — Service-Role Seed / Assert / Clean.
//
// Beweist (via kanzlei-uebergabe-smoke.spec.ts): der Kunde übergibt seinen Fall an die eigene Kanzlei
// ("Kanzleipaket versenden") → versendeKanzleiPaketAnEigeneKanzlei (kanzlei-wunsch/actions.ts:270-365)
// schreibt claims.operative_status='an_externe_kanzlei_uebergeben' + kanzlei_uebergeben_am + abgeschlossen_am.
//
// Fahrbar mit EXTERNEM Wegwerf-Kunde-Login (kein Auth-Wall, keine echte Kanzlei-Gegenseite). Der
// "Kanzleipaket versenden"-Button (EigeneKanzleiPaketCard) rendert nur wenn (kunde-claim-view.ts /
// GeldZone.tsx:144): service_typ != 'nur_gutachter', kanzlei_wunsch='eigene_kanzlei',
// kanzlei_ansprechpartner_email gesetzt, kanzlei_uebergeben_am NULL, UND ein erstgutachten-Auftrag mit
// gutachten_final_freigegeben=true (gutachtenFreigegeben-Gate, kunde-claim-view.ts:384,548).
//
// ISOLATION (Regel 4): Wegwerf-Kunde @claimondo.test/telefon=NULL, Kanzlei-Ansprechpartner-Mail
// @claimondo.test (Send-Layer suppressed), Marker in schadenort_adresse → --clean. Der Übergabe-Write
// ist ein sanktionierter Direkt-Writer (operative-status-writes-baseline.json).
//
// Nutzung (aus Repo-Root, node >= 18; env process.env-first, .env.local nur lokal):
//   node scripts/smoke/kanzlei-uebergabe-seed.mjs           # raeumt alte Reste + seedet frisch
//   node scripts/smoke/kanzlei-uebergabe-seed.mjs --assert  # prueft den Uebergabe-Endzustand (nach UI-Klick)
//   node scripts/smoke/kanzlei-uebergabe-seed.mjs --clean   # nur aufraeumen

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// --- env: process.env-first (CI hat kein .env.local), sonst .env.local (Prod-Mirror) ---
const ENV_CANDIDATES = [
  new URL('../../.env.local', import.meta.url),
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local',
  '/var/www/claimondo-v2/.env.local',
]
const env = {}
for (const c of ENV_CANDIDATES) {
  try {
    const raw = readFileSync(c, 'utf8')
    for (const line of raw.split('\n')) {
      const l = line.replace(/\r$/, '')
      if (!l.includes('=') || l.trimStart().startsWith('#')) continue
      const i = l.indexOf('=')
      env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
    break
  } catch { /* naechster Kandidat */ }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (weder .env.local noch process.env)')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// --- Konstanten ---
const KOELN = { lat: 50.9413, lng: 6.9583, plz: '50667', ort: 'Köln' }
const MARKER = 'SMOKE-KANZLEI Koeln (Test)'
const EMAIL_PREFIX = 'throwaway-kunde-kanzlei-'
const OUT = new URL('./.kanzlei-uebergabe-seed.json', import.meta.url)
const MODE = process.argv.includes('--clean') ? 'clean' : process.argv.includes('--assert') ? 'assert' : 'seed'
const log = (...a) => console.log(...a)

async function createUser(email, password) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error) return data.user.id
  if (!/already|registered|exists/i.test(error.message)) throw error
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    const u = list?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (u) { await db.auth.admin.updateUserById(u.id, { password, email_confirm: true }); return u.id }
    if (!list || list.users.length < 1000) break
  }
  throw new Error(`User ${email} existiert, via listUsers nicht gefunden`)
}

async function upsertProfile(id, email, rolle, vorname, nachname) {
  const { error } = await db.from('profiles').upsert(
    { id, email, rolle, vorname, nachname, telefon: null, force_password_change: false },
    { onConflict: 'id' },
  )
  if (error) log('  ! profiles-upsert warn:', error.message)
}

async function ensureBridge(claimId) {
  let { data: bridge } = await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', claimId).maybeSingle()
  if (!bridge) {
    const { error } = await db.from('faelle_claim_bridge').insert({ claim_id: claimId, fall_id: claimId })
    if (error) throw new Error('bridge insert: ' + error.message)
    bridge = { fall_id: claimId }
  }
  return bridge.fall_id
}

async function loadSummary() {
  if (!existsSync(OUT)) throw new Error('.kanzlei-uebergabe-seed.json fehlt — erst seeden.')
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

// ---------------------------------------------------------------- CLEAN
async function clean() {
  const { data: claims } = await db.from('claims').select('id').eq('schadenort_adresse', MARKER)
  for (const c of claims ?? []) {
    const { data: files } = await db.storage.from('fall-dokumente').list(c.id)
    if (files?.length) await db.storage.from('fall-dokumente').remove(files.map((f) => `${c.id}/${f.name}`))
    await db.from('auftraege').delete().eq('fall_id', c.id)
    await db.from('kanzlei_faelle').delete().eq('fall_id', c.id)
    await db.from('kanzlei_pakete').delete().eq('claim_id', c.id)
    await db.from('fall_dokumente').delete().eq('claim_id', c.id)
    await db.from('timeline').delete().eq('fall_id', c.id)
    await db.from('phase_transitions').delete().eq('fall_id', c.id)
    await db.from('claims').delete().eq('id', c.id) // CASCADE -> faelle_claim_bridge
  }
  const { data: profs } = await db.from('profiles').select('id').ilike('email', `${EMAIL_PREFIX}%@claimondo.test`)
  for (const p of profs ?? []) {
    await db.from('mitteilungen').delete().eq('empfaenger_id', p.id)
    await db.from('profiles').delete().eq('id', p.id)
    await db.auth.admin.deleteUser(p.id).catch(() => {})
  }
  log(`  cleaned: ${(claims ?? []).length} claim(s) + ${(profs ?? []).length} Kunde(n) (Marker "${MARKER}")`)
}

// ---------------------------------------------------------------- SEED
async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)
  const kEmail = `${EMAIL_PREFIX}${stamp}@claimondo.test`
  const kPw = `Thrw-${stamp}-Ku9!`
  const kanzleiEmail = `throwaway-kanzlei-${stamp}@claimondo.test`

  const kundeUid = await createUser(kEmail, kPw)
  await upsertProfile(kundeUid, kEmail, 'kunde', 'Smoke', 'KanzleiKunde')

  // Claim: haftpflicht + komplett (nicht nur_gutachter -> Cards rendern). Marker.
  const today = new Date().toISOString().slice(0, 10)
  const { data: claim, error: cErr } = await db
    .from('claims')
    .insert({
      geschaedigter_user_id: kundeUid,
      schadentag: today,
      abrechnungsweg: 'haftpflicht',
      service_typ: 'komplett',
      schadenort_adresse: MARKER,
      schadenort_ort: KOELN.ort,
      schadenort_plz: KOELN.plz,
      schadenort_lat: KOELN.lat,
      schadenort_lng: KOELN.lng,
    })
    .select('id')
    .single()
  if (cErr) throw new Error('claim insert: ' + cErr.message)
  const claimId = claim.id

  // Uebergabe-bereit: eigene_kanzlei + Ansprechpartner-Mail + regulierung; kanzlei_uebergeben_am NULL.
  const { error: uErr } = await db
    .from('claims')
    .update({
      kanzlei_wunsch: 'eigene_kanzlei',
      kanzlei_ansprechpartner_name: 'SMOKE Kanzlei',
      kanzlei_ansprechpartner_email: kanzleiEmail,
      operative_status: 'regulierung',
      onboarding_complete: true,
    })
    .eq('id', claimId)
  if (uErr) throw new Error('claim kanzlei-update: ' + uErr.message)

  const fallId = await ensureBridge(claimId)

  // erstgutachten-Auftrag freigegeben -> gutachtenFreigegeben-Gate (Button rendert). fall_id + claim_id.
  const { error: aErr } = await db.from('auftraege').insert({
    fall_id: fallId,
    claim_id: claimId,
    typ: 'erstgutachten',
    status: 'gutachten',
    sv_id: '0469524f-0547-4979-8068-a2d00b7fdaec', // Test-SV (test-sv@claimondo.de) — auftraege.sv_id ist NOT NULL
    gutachten_final_freigegeben: true,
    gutachten_url: 'https://example.com/smoke-gutachten.pdf',
  })
  if (aErr) throw new Error('auftraege insert: ' + aErr.message)

  const summary = {
    stamp, claimId, fallId, kundeUid,
    kundeEmail: kEmail, kundePw: kPw, kanzleiEmail,
    fallakteUrl: `/kunde/faelle/${claimId}`,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- SEED FERTIG (Claim übergabe-bereit an eigene Kanzlei) ---')
  log('  Claim:', claimId, '(fall_id =', fallId + ')')
  log('  Kunde-Fallakte:', summary.fallakteUrl, '(Login', kEmail + ')')
  log('  Summary ->', OUT.pathname, '\n')
}

// ---------------------------------------------------------------- ASSERT (nach UI-Klick)
async function assertHandover() {
  const s = await loadSummary()
  const results = []
  const check = (name, ok, detail) => { results.push({ ok }); log(`  ${ok ? '✅' : '❌'} ${name}${detail != null ? ' — ' + detail : ''}`) }

  const { data: claim } = await db
    .from('claims')
    .select('operative_status, kanzlei_uebergeben_am')
    .eq('id', s.claimId)
    .maybeSingle()
  check("operative_status = 'an_externe_kanzlei_uebergeben'", claim?.operative_status === 'an_externe_kanzlei_uebergeben', claim?.operative_status)
  check('kanzlei_uebergeben_am gesetzt', !!claim?.kanzlei_uebergeben_am, claim?.kanzlei_uebergeben_am)

  const passed = results.filter((r) => r.ok).length
  log(`\n  === ${passed}/${results.length} Assertions gruen ===\n`)
  if (passed < results.length) process.exitCode = 1
}

// ---------------------------------------------------------------- DISPATCH
async function main() {
  log(`\n== Kanzlei-Uebergabe J6-Seed [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  --clean fertig.\n'); return }
  if (MODE === 'assert') { await assertHandover(); return }
  await clean() // frischer Start
  await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
