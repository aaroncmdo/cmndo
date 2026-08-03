// /flow-Feststellungs-Gate-Smoke — beweist, dass unfallhergang jetzt im erhebt_felder-Gate von
// Kasko/Selbstzahler steht (Mig 20260801163119): Lead OHNE unfallhergang zeigt den Feststellungs-
// Step, Lead MIT ueberspringt ihn (Gate ist unfallhergang-spezifisch).
//
// Seedet 2 Selbstzahler-Leads (schuldfrage=eigenverantwortung + eigene_versicherung=nein) je mit
// einem flow_links-Token (anonymer Magic-Link, KEIN Login). Lead A: unfallhergang NULL. Lead B:
// unfallhergang gefuellt. kennzeichen+schadentyp bei BEIDEN gesetzt (die alten Gate-Felder) — so
// isoliert der Kontrast genau unfallhergang.
//
// Regel 4: throwaway-Marker (email + token), 0-Residue-Cleanup parallel-sicher (Zeitfilter, wie #4914).
//   node scripts/smoke/feststellung-flow-gate-seed.mjs           # clean + seed
//   node scripts/smoke/feststellung-flow-gate-seed.mjs --clean

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const ENV_CANDIDATES = [
  new URL('../../.env.local', import.meta.url),
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local',
  '/var/www/claimondo-v2/.env.local',
]
let envRaw = null
for (const c of ENV_CANDIDATES) { try { envRaw = readFileSync(c, 'utf8'); break } catch { /* next */ } }
const env = {}
if (envRaw) {
  for (const line of envRaw.split('\n')) {
    const l = line.replace(/\r$/, '')
    if (!l.includes('=') || l.trimStart().startsWith('#')) continue
    const i = l.indexOf('='); env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('SUPABASE URL/SERVICE_ROLE_KEY fehlen')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const APP = 'https://app.claimondo.de'
const EMAIL_MARKER = 'throwaway-flowgate-' // leads.email
const TOKEN_MARKER = 'smoke-flowgate-'     // flow_links.token
const OUT = new URL('./.feststellung-flow-gate-seed.json', import.meta.url)
const MODE = process.argv.includes('--clean') ? 'clean' : 'seed'
const log = (...a) => console.log(...a)
const loadSummary = () => existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null

// PARALLEL-SICHER: eigene Daten (Summary) IMMER, fremde marker-Daten NUR >1h alt (verwaist) — sonst
// trampelt --clean eine parallele Flow-Gate-Session. flow_links zuerst (FK lead_id -> leads).
async function clean() {
  const s = loadSummary()
  const eineStundeAgo = new Date(Date.now() - 3600e3).toISOString()
  const eigeneTokens = s ? [s.tokenA, s.tokenB].filter(Boolean) : []
  const eigeneLeadIds = s ? [s.leadIdA, s.leadIdB].filter(Boolean) : []
  if (eigeneTokens.length) await db.from('flow_links').delete().in('token', eigeneTokens)
  await db.from('flow_links').delete().like('token', TOKEN_MARKER + '%').lt('created_at', eineStundeAgo)
  if (eigeneLeadIds.length) await db.from('leads').delete().in('id', eigeneLeadIds)
  await db.from('leads').delete().like('email', EMAIL_MARKER + '%').lt('created_at', eineStundeAgo)
  log(`  cleaned: eigene ${eigeneLeadIds.length} Lead(s)/${eigeneTokens.length} Token(s) + verwaiste >1h (parallel-sicher)`)
}

async function seedLead(stamp, suffix, unfallhergang) {
  const email = `${EMAIL_MARKER}${stamp}-${suffix}@claimondo.test`
  const { data: lead, error } = await db.from('leads').insert({
    status: 'neu', schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein',
    service_typ: 'komplett', vorname: 'Smoke', nachname: 'FlowGate', email, telefon: null,
    kennzeichen: suffix === 'a' ? 'K-FG 1111' : 'K-FG 2222', schadentyp: 'parkplatz',
    unfallhergang, disqualifiziert: false,
  }).select('id').single()
  if (error) throw new Error(`leads(${suffix}): ` + error.message)
  const token = `${TOKEN_MARKER}${stamp}-${suffix}`
  const { error: fErr } = await db.from('flow_links').insert({
    lead_id: lead.id, token, expires_at: new Date(Date.now() + 72 * 3600e3).toISOString(),
    service_typ: 'komplett', sprache: 'de',
  })
  if (fErr) throw new Error(`flow_links(${suffix}): ` + fErr.message)
  return { leadId: lead.id, token }
}

async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)
  const a = await seedLead(stamp, 'a', null) // positiv: unfallhergang LEER -> Feststellungs-Step erscheint
  const b = await seedLead(stamp, 'b', 'Beim Ausparken gegen einen Poller gerollt (SMOKE).') // negativ: gefuellt -> uebersprungen
  const summary = {
    stamp, leadIdA: a.leadId, tokenA: a.token, leadIdB: b.leadId, tokenB: b.token,
    urlA: `${APP}/flow/${a.token}`, urlB: `${APP}/flow/${b.token}`, seededAt: new Date().toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('  --- 2 Selbstzahler-Leads + Flow-Tokens geseedet ---')
  log('  A (unfallhergang LEER):     ', summary.urlA)
  log('  B (unfallhergang GEFUELLT): ', summary.urlB)
  log('  Summary ->', OUT.pathname, '\n')
}

async function main() {
  log(`\n== Feststellung-Flow-Gate-Smoke [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  fertig.\n'); return }
  await clean(); await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
