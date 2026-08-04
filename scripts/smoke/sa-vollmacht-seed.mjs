// Fundament J3 (Unterschriften SA/Vollmacht) — Service-Role Seed / Assert / Clean.
//
// Beweist (via sa-vollmacht-smoke.spec.ts): der SA-Signatur-Weg (Schaden-Abtretung) konvertiert einen
// Lead zu einem Claim mit claims.sa_unterschrieben=true. Fahrbar über den WerkstattIntake-Signatur-
// Surface (/flow/[token], anon → KEIN Login/Auth-Wall): ein Lead mit werkstatt_intake_am kurzschliesst
// (page.tsx:189) direkt auf SaSignaturStep (Canvas + Checkbox + "SA unterzeichnen").
//
// Signier-Kette (belegt): SaSignaturStep.handleSignSA -> uploadFlowSignatur -> signSAandCreateFall ->
// convertLeadToClaim schreibt claims.sa_unterschrieben=true / sa_unterschrieben_am / abtretung_pdf
// (convert-lead-to-claim.ts:411-416) + spiegelt auf leads (actions.ts:1009-1018). Der Kunde-Account
// wird ERST beim Signieren erzeugt (createKundeAccount, lead.email) → Seed legt ihn NICHT an.
// unfallort=MARKER wird nach claims.schadenort_adresse kopiert (convert:278-281) → --clean findet es.
//
// Die VOLLMACHT hat keinen Kunde-UI-Canvas (server-intern via LexDrive/confirmVollmacht) → nicht Teil
// dieses UI-Smokes (Journey j03 Schritt 3, dokumentiert im Spec).
//
// ISOLATION (Regel 4): Wegwerf-Lead/-Kunde @claimondo.test (telefon=NULL → Willkommens-WA guarded weg,
// Send-Layer suppressed @claimondo.test). Marker → --clean. Interne KB-Round-Robin-Zuweisung (echter KB)
// = interne Nebenwirkung ohne Kunden-Comms, via Marker/Konten-clean aufgeräumt.
//
// Nutzung (aus Repo-Root, node >= 18; env process.env-first, .env.local nur lokal):
//   node scripts/smoke/sa-vollmacht-seed.mjs           # raeumt alte Reste + seedet frisch
//   node scripts/smoke/sa-vollmacht-seed.mjs --assert  # prueft claims.sa_unterschrieben (nach UI-Sign)
//   node scripts/smoke/sa-vollmacht-seed.mjs --clean   # nur aufraeumen

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
const MARKER = 'SMOKE-SA Koeln (Test)'
const EMAIL_PREFIX = 'throwaway-kunde-sa-'
const OUT = new URL('./.sa-vollmacht-seed.json', import.meta.url)
const MODE = process.argv.includes('--clean') ? 'clean' : process.argv.includes('--assert') ? 'assert' : 'seed'
const log = (...a) => console.log(...a)

async function loadSummary() {
  if (!existsSync(OUT)) throw new Error('.sa-vollmacht-seed.json fehlt — erst seeden.')
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

// ---------------------------------------------------------------- CLEAN
async function clean() {
  // 1) Claims per Marker (der Sign-Flow legt sie an) — FK-sicher.
  const { data: claims } = await db.from('claims').select('id').eq('schadenort_adresse', MARKER)
  for (const c of claims ?? []) {
    const { data: files } = await db.storage.from('fall-dokumente').list(c.id)
    if (files?.length) await db.storage.from('fall-dokumente').remove(files.map((f) => `${c.id}/${f.name}`))
    await db.from('fall_dokumente').delete().eq('claim_id', c.id)
    await db.from('reparatur_termine').delete().eq('claim_id', c.id)
    await db.from('partner_provisionen').delete().eq('claim_id', c.id)
    await db.from('timeline').delete().eq('fall_id', c.id)
    await db.from('phase_transitions').delete().eq('fall_id', c.id)
    await db.from('claims').delete().eq('id', c.id) // CASCADE -> faelle_claim_bridge
  }
  // 2) Leads per email-Muster (flow_links zuerst, FK) — auch alte Reste ohne Summary.
  const { data: leads } = await db.from('leads').select('id').ilike('email', `${EMAIL_PREFIX}%@claimondo.test`)
  const leadIds = (leads ?? []).map((l) => l.id)
  if (leadIds.length) {
    await db.from('flow_links').delete().in('lead_id', leadIds)
    await db.from('leads').delete().in('id', leadIds)
  }
  // 3) Der vom Sign-Flow erzeugte Kunde (profiles + auth-user) per email-Muster.
  const { data: profs } = await db.from('profiles').select('id').ilike('email', `${EMAIL_PREFIX}%@claimondo.test`)
  for (const p of profs ?? []) {
    await db.from('mitteilungen').delete().eq('empfaenger_id', p.id)
    await db.from('profiles').delete().eq('id', p.id)
    await db.auth.admin.deleteUser(p.id).catch(() => {})
  }
  log(`  cleaned: ${(claims ?? []).length} claim(s) + ${leadIds.length} lead(s) + ${(profs ?? []).length} Sign-Kunde(n) (Marker "${MARKER}")`)
}

// ---------------------------------------------------------------- SEED
async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)
  const kEmail = `${EMAIL_PREFIX}${stamp}@claimondo.test`

  // Lead im WerkstattIntake-SA-offen-Zustand: werkstatt_intake_am gesetzt -> /flow/[token]
  // kurzschliesst auf die SA-Signatur (page.tsx:189). abrechnungsweg=haftpflicht (SA-Weg, NICHT
  // selbstzahler/kasko -> sonst greift der Reparatur-Kurzschluss). service_typ=nur_gutachter (ohne
  // Kanzlei/Vollmacht-Verstrickung). unfallort=MARKER -> claims.schadenort_adresse (clean).
  const { data: lead, error: lErr } = await db
    .from('leads')
    .insert({
      status: 'flow-gesendet',
      email: kEmail,
      telefon: null,
      vorname: 'Smoke',
      nachname: 'SaVollmacht',
      abrechnungsweg: 'haftpflicht',
      service_typ: 'nur_gutachter',
      werkstatt_intake_am: new Date().toISOString(),
      unfallort: MARKER,
      kunde_plz: KOELN.plz,
      kunde_stadt: KOELN.ort,
    })
    .select('id')
    .single()
  if (lErr) throw new Error('lead insert: ' + lErr.message)
  const leadId = lead.id

  // flow_links: Token wird DB-seitig generiert (Insert setzt ihn NICHT). Muster ensure-flowlink-for-lead.
  const { data: fl, error: fErr } = await db
    .from('flow_links')
    .insert({ lead_id: leadId, expires_at: new Date(Date.now() + 72 * 3600e3).toISOString(), service_typ: 'nur_gutachter', sprache: 'de' })
    .select('token')
    .single()
  if (fErr) throw new Error('flow_links insert: ' + fErr.message)
  const token = fl.token

  const summary = { stamp, leadId, token, kundeEmail: kEmail, flowUrl: `/flow/${token}`, seededAt: new Date().toISOString() }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- SEED FERTIG (Lead im WerkstattIntake-SA-offen-Zustand) ---')
  log('  Lead:', leadId, '(email', kEmail + ', telefon=NULL)')
  log('  Flow (anon, SA-Signatur):', summary.flowUrl)
  log('  Summary ->', OUT.pathname, '\n')
}

// ---------------------------------------------------------------- ASSERT (nach UI-Sign)
async function assertSigned() {
  const s = await loadSummary()
  const results = []
  const check = (name, ok, detail) => { results.push({ ok }); log(`  ${ok ? '✅' : '❌'} ${name}${detail != null ? ' — ' + detail : ''}`) }

  const { data: claim } = await db
    .from('claims')
    .select('id, sa_unterschrieben, sa_unterschrieben_am, abtretung_pdf')
    .eq('lead_id', s.leadId)
    .maybeSingle()
  check('Claim aus Lead konvertiert', !!claim, claim?.id)
  check('claims.sa_unterschrieben = true', claim?.sa_unterschrieben === true, String(claim?.sa_unterschrieben))
  check('claims.sa_unterschrieben_am gesetzt', !!claim?.sa_unterschrieben_am, claim?.sa_unterschrieben_am)
  check('claims.abtretung_pdf gesetzt', !!claim?.abtretung_pdf, claim?.abtretung_pdf ? 'ja' : 'nein')

  const passed = results.filter((r) => r.ok).length
  log(`\n  === ${passed}/${results.length} Assertions gruen ===\n`)
  if (passed < results.length) process.exitCode = 1
}

// ---------------------------------------------------------------- DISPATCH
async function main() {
  log(`\n== SA-Vollmacht J3-Seed [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  --clean fertig.\n'); return }
  if (MODE === 'assert') { await assertSigned(); return }
  await clean() // frischer Start
  await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
