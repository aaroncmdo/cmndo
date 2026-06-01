// AAR-939 Smoke fuer die embed-B WA-Inbound JA/NEIN-Aufloesung (Stream 6a).
//
// Verifiziert die NEUE Webhook-Logik (src/app/api/webhooks/twilio/inbound/route.ts)
// gegen die echte DB, OHNE Dev-Server (connection-schonend bei vielen parallelen
// Sessions) und OHNE Twilio-Signatur (kein Dev-Bypass vorhanden). Statt den HTTP-
// Layer zu mocken, repliziert das Script die novel Kernlogik VERBATIM:
//   1. matchInboundToFall(phone)  -> Kandidaten-Faelle des Kunden
//   2. die exakte .or-Stale-Gate-Query aus der Route  -> findet stale nur_gutachter-Termin
//   3. JA  -> closeNurGutachterTerminAlsDurchgefuehrt-Writes (Termin + Claim terminal)
//   4. NEIN -> createEmbedBKlaerungTask-Insert (idempotent)
// Beweist: PostgREST-Query-Syntax gueltig, CHECK-Constraints erfuellt, Gate idempotent.
//
// REVERSIBEL: nutzt den bestehenden TEST-Claim (smoke-kunde @claimondo.test), der
// bereits mit der Fake-Nummer +4915112345678 auf Lead + Kunde-Profil verdrahtet ist.
// cleanup (finally + standalone mode) raeumt restlos auf. Beruehrt KEINEN echten Fall.
//
// Modi:  node scripts/smoke-embed-b-wa-inbound.mjs [run|cleanup]
//
// Service-Client (RLS-Bypass) — DML hier statt via execute_sql (AGENTS.md Regel 2).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// Test-Claim CLM-2026-00109 — Lead + Kunde-Profil tragen +4915112345678.
const TEST = {
  claimId: 'c5480a99-4f7b-4cf2-a089-f6d09eeb7ba8',
  fallId: 'e8549396-ab25-48be-aeb9-7606371508a8',
  leadId: 'a038a8cf-89ec-401b-b4fc-900217fd7132',
  userId: '478d8c97-c867-4357-a929-7c3b8f947d22',
  phone: '+4915112345678',
}
const MARKER = 'AAR939-WA-INBOUND-SMOKE'

// Identisch zu TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE (embed-b-klaerung-task.ts).
const EXCLUDED_IN = '("storniert","abgesagt","abgelehnt","verlegt","verlegung_pending","abgeschlossen","verschoben")'
// Identisch zu CLAIM_TERMINAL_STATUSES (close-nur-gutachter-termin.ts).
const CLAIM_TERMINAL = [
  'reguliert_vollstaendig', 'storniert', 'klage_rechtsstreit',
  'verjaehrt', 'abgelehnt_final', 'an_externe_kanzlei_uebergeben', 'termin_durchgefuehrt',
]
const CLAIM_TERMINAL_IN = `(${CLAIM_TERMINAL.map((s) => `"${s}"`).join(',')})`

let pass = 0
let fail = 0
function check(name, cond, extra) {
  if (cond) { console.log('  PASS  ' + name); pass++ }
  else { console.log('  FAIL  ' + name + (extra ? '  ' + JSON.stringify(extra) : '')); fail++ }
}

async function getClaim() {
  const { data } = await db
    .from('claims')
    .select('service_typ, status, onboarding_complete')
    .eq('id', TEST.claimId)
    .maybeSingle()
  return data
}

// --- Replik von matchInboundToFall (src/lib/inbound/match-fall.ts) ---
async function resolveCandidates(phone) {
  const suffix = phone.replace(/[^0-9]/g, '').slice(-9)
  const [{ data: leads }, { data: kunden }] = await Promise.all([
    db.from('leads').select('id, konvertiert_zu_fall_id').ilike('telefon', `%${suffix}%`).limit(10),
    db.from('profiles').select('id').eq('rolle', 'kunde').ilike('telefon', `%${suffix}%`).limit(5),
  ])
  const kundeIds = (kunden ?? []).map((k) => k.id)
  const fallIdsFromLeads = (leads ?? []).map((l) => l.konvertiert_zu_fall_id).filter(Boolean)
  const leadId = (leads ?? [])[0]?.id ?? null
  let q = db.from('faelle').select('id, status').not('status', 'in', '("abgeschlossen","storniert")')
  if (kundeIds.length && fallIdsFromLeads.length) {
    q = q.or(`kunde_id.in.(${kundeIds.join(',')}),id.in.(${fallIdsFromLeads.join(',')})`)
  } else if (kundeIds.length) {
    q = q.in('kunde_id', kundeIds)
  } else if (fallIdsFromLeads.length) {
    q = q.in('id', fallIdsFromLeads)
  } else {
    return { candidateFallIds: [], leadId }
  }
  const { data: faelle } = await q
  return { candidateFallIds: (faelle ?? []).map((f) => f.id), leadId }
}

// --- Replik der exakten Stale-Gate-Query aus route.ts (Resolution-Block) ---
async function findStaleTermin(candidateFallIds, leadId) {
  const orParts = []
  if (candidateFallIds.length) orParts.push(`fall_id.in.(${candidateFallIds.join(',')})`)
  if (leadId) orParts.push(`lead_id.eq.${leadId}`)
  if (!orParts.length) return null
  const { data } = await db
    .from('gutachter_termine')
    .select('id, claim_id, fall_id, lead_id, claims:claim_id(service_typ, status)')
    .or(orParts.join(','))
    .lt('end_zeit', new Date().toISOString())
    .is('durchgefuehrt_am', null)
    .is('sv_no_show_am', null)
    .is('sv_ablehnung_am', null)
    .not('status', 'in', EXCLUDED_IN)
    .order('end_zeit', { ascending: false })
    .limit(5)
  return (data ?? []).find((t) => {
    const c = Array.isArray(t.claims) ? t.claims[0] : t.claims
    const svc = c?.service_typ ?? null
    const st = c?.status ?? null
    return svc === 'nur_gutachter' && !CLAIM_TERMINAL.includes(st ?? '')
  }) ?? null
}

async function deleteMarkerTermine() {
  const { data: tm } = await db.from('gutachter_termine').select('id').eq('notiz_intern', MARKER)
  const ids = (tm ?? []).map((x) => x.id)
  if (ids.length) {
    await db.from('tasks').delete().eq('entity_type', 'termin').in('entity_id', ids)
    await db.from('gutachter_termine').delete().in('id', ids)
  }
  return ids.length
}

async function run() {
  const original = await getClaim()
  let restoreSvc = original?.service_typ ?? 'komplett'
  let restoreStatus = original?.status ?? 'dispatch_done'
  const restoreOnb = original?.onboarding_complete ?? false
  if (restoreSvc === 'nur_gutachter') { restoreSvc = 'komplett'; restoreStatus = 'dispatch_done' } // Leftover-Guard
  let terminId = null
  try {
    // --- SEED ---
    console.log('STEP seed')
    await deleteMarkerTermine()
    await db.from('claims').update({ service_typ: 'nur_gutachter', status: 'dispatch_done', onboarding_complete: true }).eq('id', TEST.claimId)
    const start = new Date(Date.now() - 49 * 3600 * 1000).toISOString()
    const end = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
    const { data: t, error: tErr } = await db
      .from('gutachter_termine')
      .insert({ claim_id: TEST.claimId, fall_id: TEST.fallId, lead_id: TEST.leadId, status: 'bestaetigt', typ: 'sv_begutachtung', start_zeit: start, end_zeit: end, notiz_intern: MARKER })
      .select('id')
      .single()
    if (tErr) throw new Error('seed termin: ' + tErr.message)
    terminId = t.id
    console.log('  seeded termin ' + terminId)

    // --- MATCH (novel: phone -> stale nur_gutachter termin) ---
    console.log('STEP match')
    const rc = await resolveCandidates(TEST.phone)
    check('matchInboundToFall findet Test-Fall ueber +4915112345678', rc.candidateFallIds.includes(TEST.fallId), { candidateFallIds: rc.candidateFallIds })
    const stale = await findStaleTermin(rc.candidateFallIds, rc.leadId)
    check('Stale-Gate-Query findet den seeded Termin', stale?.id === terminId, { found: stale?.id })
    check('Stale-Gate liefert claim_id fuer den Close', stale?.claim_id === TEST.claimId, { claim_id: stale?.claim_id })

    // --- JA (close) ---
    console.log('STEP JA')
    const { data: f } = await db.from('faelle').select('kunde_id').eq('id', stale.fall_id).maybeSingle()
    const byUser = f?.kunde_id ?? null
    const now = new Date().toISOString()
    const { error: jaTErr } = await db.from('gutachter_termine').update({ status: 'abgeschlossen', durchgefuehrt_am: now }).eq('id', terminId).is('durchgefuehrt_am', null)
    check('JA: termin-update ohne CHECK-Fehler', !jaTErr, { err: jaTErr?.message })
    const { error: jaCErr } = await db.from('claims').update({ status: 'termin_durchgefuehrt', endzustand_gesetzt_durch_user_id: byUser, endzustand_gesetzt_am: now, endzustand_grund: 'Termin durchgefuehrt (vom Kunden per WhatsApp bestaetigt)' }).eq('id', TEST.claimId).not('status', 'in', CLAIM_TERMINAL_IN)
    check('JA: claim-update ohne CHECK-Fehler', !jaCErr, { err: jaCErr?.message })
    const { data: tAfter } = await db.from('gutachter_termine').select('status, durchgefuehrt_am').eq('id', terminId).maybeSingle()
    const { data: cAfter } = await db.from('claims').select('status, endzustand_gesetzt_durch_user_id').eq('id', TEST.claimId).maybeSingle()
    check('JA: termin.durchgefuehrt_am gesetzt', !!tAfter?.durchgefuehrt_am)
    check('JA: termin.status = abgeschlossen', tAfter?.status === 'abgeschlossen', { status: tAfter?.status })
    check('JA: claim.status = termin_durchgefuehrt', cAfter?.status === 'termin_durchgefuehrt', { status: cAfter?.status })
    check('JA: endzustand_gesetzt_durch_user_id = kunde (faelle.kunde_id)', cAfter?.endzustand_gesetzt_durch_user_id === byUser, { byUser })
    const rcJa = await resolveCandidates(TEST.phone)
    const staleAfterJa = await findStaleTermin(rcJa.candidateFallIds, rcJa.leadId)
    check('JA: Gate findet danach KEINEN stale-Termin mehr (idempotent)', staleAfterJa === null, { still: staleAfterJa?.id })

    // --- RESET fuer NEIN ---
    console.log('STEP reset')
    await db.from('gutachter_termine').update({ status: 'bestaetigt', durchgefuehrt_am: null }).eq('id', terminId)
    await db.from('claims').update({ status: 'dispatch_done', endzustand_gesetzt_durch_user_id: null, endzustand_gesetzt_am: null, endzustand_grund: null }).eq('id', TEST.claimId)

    // --- NEIN (klaerungs-task, idempotent) ---
    console.log('STEP NEIN')
    const rc2 = await resolveCandidates(TEST.phone)
    const stale2 = await findStaleTermin(rc2.candidateFallIds, rc2.leadId)
    check('NEIN: Stale-Termin nach reset wieder gefunden', stale2?.id === terminId)
    async function createKlaerungTask() {
      const { data: existing } = await db.from('tasks').select('id').eq('entity_type', 'termin').eq('entity_id', terminId).eq('task_typ', 'embed_b_termin_klaerung').eq('status', 'offen').limit(1).maybeSingle()
      if (existing) return { created: false }
      const { error } = await db.from('tasks').insert({ fall_id: stale2.fall_id, lead_id: stale2.lead_id ?? TEST.leadId, typ: 'dispatch', task_typ: 'embed_b_termin_klaerung', titel: 'Kunde meldet: Gutachter nicht erschienen (Smoke)', beschreibung: 'WA-Inbound-Smoke Klaerungs-Task.', status: 'offen', prioritaet: 'dringend', auto_erstellt: true, entity_type: 'termin', entity_id: terminId, faellig_am: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })
      if (error) throw new Error('task insert: ' + error.message)
      return { created: true }
    }
    const r1 = await createKlaerungTask()
    check('NEIN: Klaerungs-Task erstellt (created=true)', r1.created === true)
    const r2 = await createKlaerungTask()
    check('NEIN: 2. Aufruf idempotent (created=false)', r2.created === false)
    const { data: tasks } = await db.from('tasks').select('id, typ, task_typ, status, prioritaet').eq('entity_type', 'termin').eq('entity_id', terminId)
    const offene = (tasks ?? []).filter((x) => x.status === 'offen')
    check('NEIN: genau 1 offener dispatch-Task', offene.length === 1 && offene[0].typ === 'dispatch', { tasks })
  } finally {
    // --- CLEANUP ---
    console.log('STEP cleanup')
    if (terminId) {
      await db.from('tasks').delete().eq('entity_type', 'termin').eq('entity_id', terminId)
      await db.from('gutachter_termine').delete().eq('id', terminId)
    } else {
      await deleteMarkerTermine()
    }
    await db.from('claims').update({ service_typ: restoreSvc, status: restoreStatus, onboarding_complete: restoreOnb, endzustand_gesetzt_durch_user_id: null, endzustand_gesetzt_am: null, endzustand_grund: null }).eq('id', TEST.claimId)
    const c = await getClaim()
    console.log('  restored claim -> ' + JSON.stringify({ service_typ: c?.service_typ, status: c?.status, onboarding_complete: c?.onboarding_complete }))
  }
  console.log('\n=== RESULT: ' + pass + ' pass, ' + fail + ' fail ===')
  process.exit(fail > 0 ? 1 : 0)
}

const mode = process.argv[2] ?? 'run'
if (mode === 'cleanup') {
  const n = await deleteMarkerTermine()
  await db.from('claims').update({ service_typ: 'komplett', status: 'dispatch_done', onboarding_complete: false, endzustand_gesetzt_durch_user_id: null, endzustand_gesetzt_am: null, endzustand_grund: null }).eq('id', TEST.claimId)
  console.log('CLEANED: ' + n + ' marker-termin(e) + claim restored')
  process.exit(0)
}
await run()
