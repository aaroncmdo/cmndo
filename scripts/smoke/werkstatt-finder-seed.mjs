// Werkstatt-Finder Prod-Smoke — Service-Role-Seed (KEIN MCP execute_sql, reines JS-Client-DML
// wie die MFA-Seed-Skripte). ISOLATION (Aaron 08.07. "darf in Tests keine echte Person treffen"):
//   * Dedizierter Smoke-Kunde mit telefon=NULL  -> Kunde-Vermittlungs-Notify kann KEIN WhatsApp/SMS
//     an eine echte Nummer schicken (nur Email an aaron.sprafke+-Alias = Aarons eigenes Postfach).
//   * Claim/Lead sitzen exakt auf den Koordinaten der "SMOKE Werkstatt (Test)" (Köln 50667) ->
//     die Smoke-Werkstatt rankt distanz 0 = Platz 1 im Finder. Der Playwright-Test klickt NUR diese
//     Karte -> assignReparaturWerkstatt -> notifyWerkstattNeuerAuftrag geht NUR an werkstatt-smoke@claimondo.de.
//   * Marker in schadenort_adresse/besichtigungsort_adresse = 'SMOKE-WF ...' -> --clean findet alles wieder.
//
// Nutzung (aus dem Repo-Root, node >= 18):
//   node scripts/smoke/werkstatt-finder-seed.mjs           # räumt alte SMOKE-WF-Reste weg + seedet frisch
//   node scripts/smoke/werkstatt-finder-seed.mjs --clean   # nur aufräumen (Assignments/Notifies bleiben, nur Testdaten weg)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// --- env aus .env.local (Prod-Mirror) ---
const envRaw = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
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

// --- Konstanten ---
const CLEAN = process.argv.includes('--clean')
const APP = 'https://app.claimondo.de'
const KUNDE_EMAIL = 'aaron.sprafke+smokewf@claimondo.de'
const KUNDE_PW = 'SmokeWF-2026!'
const SMOKE_WERKSTATT_ID = 'badecb82-aa29-461c-876b-007455aa8dd3' // "SMOKE Werkstatt (Test)", Köln 50667
const SMOKE_WERKSTATT_USER = 'd5c2940d-5ddd-48c6-8624-97633fd37edf' // werkstatt-smoke@claimondo.de
const KOELN = { lat: 50.9413, lng: 6.9583, plz: '50667', ort: 'Köln' }
const MARKER = 'SMOKE-WF Köln (Test)'
const OUT = new URL('./.werkstatt-finder-seed.json', import.meta.url)

const log = (...a) => console.log(...a)

async function findOrCreateKunde() {
  // createUser schlägt fehl, wenn die Email schon existiert -> dann via listUsers finden.
  const { data: created, error } = await db.auth.admin.createUser({
    email: KUNDE_EMAIL,
    password: KUNDE_PW,
    email_confirm: true,
  })
  let userId = created?.user?.id
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error
    // existiert schon -> paginiert suchen
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      const u = data?.users?.find((x) => x.email?.toLowerCase() === KUNDE_EMAIL.toLowerCase())
      if (u) userId = u.id
      if (!data || data.users.length < 1000) break
    }
    if (!userId) throw new Error('Smoke-Kunde existiert, wurde aber via listUsers nicht gefunden')
    // PW sicher zuruecksetzen (falls frueher anders gesetzt) + confirmen
    await db.auth.admin.updateUserById(userId, { password: KUNDE_PW, email_confirm: true })
  }
  // Profil: rolle=kunde, telefon=NULL (Isolation!), Namen. upsert deckt "Trigger legt Profil an"
  // wie "kein Trigger" gleichermassen ab (profiles Pflicht = id+email).
  const { error: pErr } = await db.from('profiles').upsert(
    // force_password_change=false: sonst Redirect nach /passwort-aendern vor jedem Portal-Zugriff (AAR-562).
    { id: userId, email: KUNDE_EMAIL, rolle: 'kunde', vorname: 'Smoke', nachname: 'Finder', telefon: null, force_password_change: false },
    { onConflict: 'id' },
  )
  if (pErr) log('  ! profiles-upsert warn:', pErr.message)
  // Werkstatt-Smoke-Konto: gleichen Gate lösen (Login im Test-3) — PW NICHT anfassen (bleibt SmokeWerkstatt-2026!).
  const { error: wErr } = await db.from('profiles').update({ force_password_change: false }).eq('id', SMOKE_WERKSTATT_USER)
  if (wErr) log('  ! werkstatt force_password_change warn:', wErr.message)
  return userId
}

async function clean(kundeId) {
  // flow_links zuerst (FK auf leads), dann leads, dann claims — nur die Marker-Reihen.
  const { data: leads } = await db.from('leads').select('id').eq('besichtigungsort_adresse', MARKER)
  const leadIds = (leads ?? []).map((l) => l.id)
  if (leadIds.length) {
    await db.from('flow_links').delete().in('lead_id', leadIds)
    await db.from('leads').delete().in('id', leadIds)
  }
  await db.from('claims').delete().eq('schadenort_adresse', MARKER)
  // In-App-Mitteilungen aus der Zuweisungs-Benachrichtigung (kein FK auf claim/lead -> per Empfaenger).
  // Smoke-Kunde = frisches Konto -> alle; Smoke-Werkstatt = geteiltes Testkonto -> nur die letzten 2h.
  const zweiStdVor = new Date(Date.now() - 2 * 3600e3).toISOString()
  await db.from('mitteilungen').delete().eq('empfaenger_id', kundeId)
  await db.from('mitteilungen').delete().eq('empfaenger_id', SMOKE_WERKSTATT_USER).gt('created_at', zweiStdVor)
  log(`  cleaned: ${leadIds.length} lead(s) + flow_links + SMOKE-WF claims + Zuweisungs-Mitteilungen`)
}

async function seedLeadAndFlow() {
  const { data: lead, error } = await db
    .from('leads')
    .insert({
      status: 'flow-gesendet',
      reparaturwunsch: 'fiktiv', // fiktive Abrechnung -> Finder muss laut #3922-Fix trotzdem erscheinen
      reparatur_werkstatt_id: null,
      werkstatt_id: null,
      reparatur_vermittlung_status: 'offen',
      email: KUNDE_EMAIL, // safe alias
      telefon: null, // KEIN echtes Telefon -> kein WhatsApp/SMS
      vorname: 'Smoke',
      nachname: 'Finder',
      kunde_plz: KOELN.plz,
      kunde_stadt: KOELN.ort,
      besichtigungsort_adresse: MARKER,
      besichtigungsort_lat: KOELN.lat,
      besichtigungsort_lng: KOELN.lng,
      schadenskategorie: null, // -> computePasst=true, Smoke-Werkstatt "passt"
    })
    .select('id')
    .single()
  if (error) throw new Error('lead insert: ' + error.message)
  const token = 'smokewf-' + randomUUID()
  const expires = new Date(Date.now() + 7 * 864e5).toISOString()
  const { error: fErr } = await db
    .from('flow_links')
    .insert({ lead_id: lead.id, token, status: 'erstellt', expires_at: expires })
  if (fErr) throw new Error('flow_links insert: ' + fErr.message)
  return { leadId: lead.id, token }
}

async function seedClaim(kundeId) {
  const today = new Date().toISOString().slice(0, 10)
  const { data: claim, error } = await db
    .from('claims')
    .insert({
      geschaedigter_user_id: kundeId,
      schadentag: today,
      reparaturwunsch: 'fiktiv',
      reparatur_werkstatt_id: null,
      werkstatt_id: null,
      reparatur_vermittlung_status: 'offen',
      schadenort_adresse: MARKER,
      schadenort_ort: KOELN.ort,
      schadenort_plz: KOELN.plz,
      schadenort_lat: KOELN.lat,
      schadenort_lng: KOELN.lng,
      schadenskategorie: null,
    })
    .select('id')
    .single()
  if (error) throw new Error('claim insert: ' + error.message)
  // onboarding_complete best-effort (Spalte evtl. type-lagged) -> Kunde-Layout redirectet sonst.
  const { error: oErr } = await db.from('claims').update({ onboarding_complete: true }).eq('id', claim.id)
  if (oErr) log('  ! onboarding_complete warn (nicht fatal):', oErr.message)
  return claim.id
}

async function main() {
  log(`\n== Werkstatt-Finder Smoke-Seed (${CLEAN ? 'CLEAN' : 'SEED'}) gegen ${URL_} ==`)
  const kundeId = await findOrCreateKunde()
  log('  Smoke-Kunde:', KUNDE_EMAIL, '->', kundeId, '(telefon=NULL)')

  await clean(kundeId)
  if (CLEAN) {
    log('  --clean fertig.\n')
    return
  }

  const { leadId, token } = await seedLeadAndFlow()
  const claimId = await seedClaim(kundeId)

  const summary = {
    kundeId,
    kundeEmail: KUNDE_EMAIL,
    kundePw: KUNDE_PW,
    claimId,
    leadId,
    flowToken: token,
    smokeWerkstattId: SMOKE_WERKSTATT_ID,
    fallakteUrl: `${APP}/kunde/faelle/${claimId}`,
    flowUrl: `${APP}/flow/${token}`,
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- SEED FERTIG ---')
  log('  Fallakte (Login-Kunde):', summary.fallakteUrl)
  log('  Flow (Self-Service, kein Login):', summary.flowUrl)
  log('  Kunde:', KUNDE_EMAIL, '/', KUNDE_PW)
  log('  Smoke-Werkstatt:', SMOKE_WERKSTATT_ID, '(nur DIESE im Test anklicken!)')
  log('  Summary ->', OUT.pathname, '\n')
}

main().catch((e) => {
  console.error('SEED-FEHLER:', e.message)
  process.exit(1)
})
