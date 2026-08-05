// Fundament J7 (Storno / DSGVO-Loeschung) — Service-Role Seed / Assert / Clean.
//
// Beweist (via storno-dsgvo-smoke.spec.ts) die beiden J7-Ausstiege:
//   A · STORNO (intern Admin/KB — j07:18 "Kunde storniert" hat KEINE Kunde-UI; markClaimAsStorniert
//       ist requireRole(admin/kb), endzustand-actions.ts:309): EndzustandDropdown -> Modal in der
//       internen Fallakte /faelle/[id] -> operative_status='storniert' + abgeschlossen_am +
//       endzustand_gesetzt_am/_grund (Row-Check-Guard #4625-Klasse in setEndzustandFields).
//   B · DSGVO-Loeschung (2-Schritt, dsgvo-loeschung.ts): Kunde stellt Antrag (/kunde/profil,
//       stelleLoeschAntrag -> status='eingereicht') -> Admin BESTAETIGT (bestaetigt_am! s.u.) ->
//       Admin "Direkt ausfuehren" (fuehreLoeschungAus: rpc dsgvo_anonymize_user_data + auth-Delete).
//       ⚠ chk_bestaetigt_logic verlangt bestaetigt_am fuer status='ausgefuehrt' — Ausfuehren OHNE
//       vorheriges Bestaetigen wuerde den Status-Write silent verlieren (Update-Result wird in
//       fuehreLoeschungAus ignoriert). Der Smoke faehrt deshalb IMMER den 2-Schritt-Weg.
//
// 3 GETRENNTE Wegwerf-Konten (DSGVO ist irreversibel — nur eigene Wegwerf-Daten):
//   1. Throwaway-Admin  throwaway-admin-j7-<stamp>@claimondo.test (rolle=admin, KEIN TOTP)
//      -> faehrt BEIDE UI-Teile; entkoppelt vom geteilten test-admin (kein Pool-Drift).
//      Praefix bewusst mit "-j7-" — throwaway-account.mjs anderer Sessions nutzt throwaway-admin-<ts>,
//      der Clean hier darf NUR die eigenen J7-Konten treffen.
//   2. Storno-Kunde + Claim  throwaway-kunde-storno-<stamp>@... (operative_status='regulierung'
//      = nicht-terminal -> EndzustandDropdown enabled; Kunde loggt sich nie ein).
//   3. DSGVO-Kunde + EIGENER Claim  throwaway-kunde-dsgvo-<stamp>@... — GETRENNT vom Storno-Kunden,
//      sonst anonymisiert die Loeschung den Storno-Owner. Der Claim ist das Anonymisierungs-Objekt
//      (Assert: kunde_email -> 'deleted-…' via RPC; geschaedigter_user_id -> NULL via
//      profiles-CASCADE + FK SET NULL).
//
// ISOLATION (Regel 4): @claimondo.test + telefon=NULL (kein WA/SMS), Marker in schadenort_adresse,
// notify_customer beim Storno default false. Self-cleaning: seed ruft erst clean; clean raeumt
// Marker-Claims + Praefix-Konten + dsgvo_loeschauftraege (per email-ilike).
// ⚠ Clean-Reihenfolge ist FK-getrieben: dsgvo_loeschauftraege VOR den Usern loeschen —
// bestaetigt_von_user_id -> auth.users hat KEIN ON DELETE (NO ACTION) und wuerde den
// Throwaway-Admin-Delete blockieren.
//
// Nutzung (aus Repo-Root, node >= 18; env process.env-first, .env.local nur lokal):
//   node scripts/smoke/storno-dsgvo-seed.mjs           # raeumt alte Reste + seedet frisch
//   node scripts/smoke/storno-dsgvo-seed.mjs --assert  # prueft BEIDE Endzustaende (nach UI-Lauf)
//   node scripts/smoke/storno-dsgvo-seed.mjs --clean   # nur aufraeumen

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
const MARKER = 'SMOKE-STORNO-DSGVO Koeln (Test)'
const ADMIN_PREFIX = 'throwaway-admin-j7-'
const STORNO_PREFIX = 'throwaway-kunde-storno-'
const DSGVO_PREFIX = 'throwaway-kunde-dsgvo-'
const OUT = new URL('./.storno-dsgvo-seed.json', import.meta.url)
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

// Claim-Grundmuster wie kanzlei-uebergabe-seed (prod-bewaehrt): insert Grunddaten, dann
// Zustands-Update. onboarding_complete=true haelt den Kunde-Login aus dem Onboarding-Redirect.
async function createClaim(kundeUid) {
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
  const { error: uErr } = await db
    .from('claims')
    .update({ operative_status: 'regulierung', onboarding_complete: true })
    .eq('id', claim.id)
  if (uErr) throw new Error('claim status-update: ' + uErr.message)
  await ensureBridge(claim.id)
  return claim.id
}

async function loadSummary() {
  if (!existsSync(OUT)) throw new Error('.storno-dsgvo-seed.json fehlt — erst seeden.')
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

// ---------------------------------------------------------------- CLEAN
async function clean() {
  // 1) dsgvo_loeschauftraege ZUERST (FK bestaetigt_von_user_id NO ACTION blockiert sonst den
  //    Admin-Delete in Schritt 3). email-Spalte im Auftrag behaelt die Wegwerf-Email (die RPC
  //    anonymisiert dsgvo_loeschauftraege nicht) -> ilike findet auch ausgefuehrte Auftraege.
  const { data: auftraege } = await db
    .from('dsgvo_loeschauftraege')
    .select('id')
    .ilike('email', `${DSGVO_PREFIX}%@claimondo.test`)
  for (const a of auftraege ?? []) {
    await db.from('dsgvo_loeschauftraege').delete().eq('id', a.id)
  }

  // 2) Marker-Claims (Storno + DSGVO; der Marker ueberlebt die Anonymisierung — die RPC fasst
  //    schadenort_adresse nicht an). CASCADE raeumt faelle_claim_bridge.
  const { data: claims } = await db.from('claims').select('id').eq('schadenort_adresse', MARKER)
  for (const c of claims ?? []) {
    await db.from('timeline').delete().eq('fall_id', c.id)
    await db.from('phase_transitions').delete().eq('fall_id', c.id)
    await db.from('claims').delete().eq('id', c.id)
  }

  // 3) Wegwerf-Konten aller drei Praefixe. Der ausgefuehrte DSGVO-Kunde ist hier schon weg
  //    (auth-Delete + profiles-CASCADE im Test) — ilike raeumt nur Crash-Reste.
  let konten = 0
  for (const prefix of [ADMIN_PREFIX, STORNO_PREFIX, DSGVO_PREFIX]) {
    const { data: profs } = await db.from('profiles').select('id').ilike('email', `${prefix}%@claimondo.test`)
    for (const p of profs ?? []) {
      await db.from('mitteilungen').delete().eq('empfaenger_id', p.id)
      await db.from('profiles').delete().eq('id', p.id)
      await db.auth.admin.deleteUser(p.id).catch(() => {})
      konten++
    }
  }
  log(`  cleaned: ${(auftraege ?? []).length} Loeschauftrag/e + ${(claims ?? []).length} Claim(s) + ${konten} Konto/en (Marker "${MARKER}")`)
}

// ---------------------------------------------------------------- SEED
async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)

  // 1) Throwaway-Admin (kein TOTP -> Passwort-Login reicht; rolle=admin genuegt fuers Portal-Gate)
  const adminEmail = `${ADMIN_PREFIX}${stamp}@claimondo.test`
  const adminPw = `Thrw-${stamp}-Ad9!`
  const adminUid = await createUser(adminEmail, adminPw)
  await upsertProfile(adminUid, adminEmail, 'admin', 'Smoke', 'J7Admin')

  // 2) Storno-Kunde + Claim (Kunde loggt sich nie ein — Admin faehrt die Fallakte)
  const stornoEmail = `${STORNO_PREFIX}${stamp}@claimondo.test`
  const stornoUid = await createUser(stornoEmail, `Thrw-${stamp}-St9!`)
  await upsertProfile(stornoUid, stornoEmail, 'kunde', 'Smoke', 'StornoKunde')
  const stornoClaimId = await createClaim(stornoUid)

  // 3) DSGVO-Kunde + eigener Claim (getrennt! Loeschung darf nur DIESEN Kunden treffen)
  const dsgvoEmail = `${DSGVO_PREFIX}${stamp}@claimondo.test`
  const dsgvoPw = `Thrw-${stamp}-Ds9!`
  const dsgvoUid = await createUser(dsgvoEmail, dsgvoPw)
  await upsertProfile(dsgvoUid, dsgvoEmail, 'kunde', 'Smoke', 'DsgvoKunde')
  const dsgvoClaimId = await createClaim(dsgvoUid)

  const summary = {
    stamp,
    adminUid, adminEmail, adminPw,
    stornoClaimId, stornoKundeUid: stornoUid, stornoKundeEmail: stornoEmail,
    dsgvoClaimId, dsgvoKundeUid: dsgvoUid, dsgvoKundeEmail: dsgvoEmail, dsgvoKundePw: dsgvoPw,
    stornoFallakteUrl: `/faelle/${stornoClaimId}`,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- SEED FERTIG (J7: Storno-Claim + DSGVO-Kunde, 3 getrennte Wegwerf-Konten) ---')
  log('  Admin:        ', adminEmail)
  log('  Storno-Claim: ', stornoClaimId, `(intern: /faelle/${stornoClaimId})`)
  log('  DSGVO-Kunde:  ', dsgvoEmail, `(Claim ${dsgvoClaimId})`)
  log('  Summary ->', OUT.pathname, '\n')
}

// ---------------------------------------------------------------- ASSERT (nach UI-Lauf)
async function assertEndzustaende() {
  const s = await loadSummary()
  const results = []
  const check = (name, ok, detail) => { results.push({ ok }); log(`  ${ok ? '✅' : '❌'} ${name}${detail != null ? ' — ' + detail : ''}`) }

  // A · Storno
  const { data: sc } = await db
    .from('claims')
    .select('operative_status, abgeschlossen_am, endzustand_gesetzt_am, endzustand_grund')
    .eq('id', s.stornoClaimId)
    .maybeSingle()
  check("A operative_status = 'storniert'", sc?.operative_status === 'storniert', sc?.operative_status)
  check('A abgeschlossen_am gesetzt', !!sc?.abgeschlossen_am, sc?.abgeschlossen_am)
  check('A endzustand_gesetzt_am + grund gesetzt', !!sc?.endzustand_gesetzt_am && !!sc?.endzustand_grund)

  // B · DSGVO
  const { data: auftrag } = await db
    .from('dsgvo_loeschauftraege')
    .select('status, bestaetigt_am, ausgefuehrt_am')
    .eq('email', s.dsgvoKundeEmail)
    .maybeSingle()
  check("B auftrag.status = 'ausgefuehrt'", auftrag?.status === 'ausgefuehrt', auftrag?.status)
  check('B ausgefuehrt_am gesetzt', !!auftrag?.ausgefuehrt_am, auftrag?.ausgefuehrt_am)

  const { data: userRes } = await db.auth.admin.getUserById(s.dsgvoKundeUid).catch(() => ({ data: { user: null } }))
  check('B auth.users geloescht (Login entzogen)', !userRes?.user)

  const { count: profCount } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('id', s.dsgvoKundeUid)
  check('B profiles weg (CASCADE)', (profCount ?? 0) === 0, `count=${profCount}`)

  // Claim bleibt (Anonymisierung, kein Delete); Personen-Bezug faellt via FK-Kette
  // (auth-Delete -> profiles-CASCADE -> geschaedigter_user_id SET NULL). claims.kunde_email
  // existiert nicht mehr (Schema-Drift-Fix 20260804193646).
  const { data: dc } = await db
    .from('claims')
    .select('id, geschaedigter_user_id')
    .eq('id', s.dsgvoClaimId)
    .maybeSingle()
  check('B claim existiert weiter (kein Delete)', dc != null, dc?.id)
  check('B claim.geschaedigter_user_id NULL (FK SET NULL)', dc != null && dc.geschaedigter_user_id === null, dc?.geschaedigter_user_id)

  const passed = results.filter((r) => r.ok).length
  log(`\n  === ${passed}/${results.length} Assertions gruen ===\n`)
  if (passed < results.length) process.exitCode = 1
}

// ---------------------------------------------------------------- DISPATCH
async function main() {
  log(`\n== Storno/DSGVO J7-Seed [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  --clean fertig.\n'); return }
  if (MODE === 'assert') { await assertEndzustaende(); return }
  await clean() // frischer Start
  await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
