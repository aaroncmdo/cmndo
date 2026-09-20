#!/usr/bin/env node
// Seed + Cleanup fuer den Regel-4-Prod-Smoke „SV-Onboarding von ueberall — Freischaltung
// automatisch" (tests/e2e/flows/sv-onboarding-auto-freischaltung-prod.spec.ts).
//
// Soll (Aaron 19.09.2026): Ein Gutachter, der den Basic-Wizard bis zur Unterschrift
// durchlaeuft, ist OHNE Admin-Klick freigeschaltet, verifiziert, auf der Karte und buchbar —
// auch ohne ein einziges Dokument; Dokumente kann er im Wizard hochladen.
//
// Was der Seed anlegt (= der Zustand NACH /sv/registrieren, VOR dem ersten Login):
//   auth.user + profiles (rolle sachverstaendiger, Telefon bereits bestaetigt, telefon=NULL)
//   sachverstaendige: paket basic, self_service_neu, ist_testaccount=FALSE (sonst filtert der
//     Finder/Dispatch ihn per Design aus — genau das soll der Smoke ja beweisen), portal=false,
//     ist_aktiv=false, verifiziert=false, Standort Pellworm (faehr-isoliert, ~0 Kunden-Traffic,
//     dasselbe Muster wie seedThrowawayFinderSv), KEINE Isochrone (die berechnet die Freigabe).
//   e2e_test_fixtures-Eintrag: fuer das Matching echt, fuer den Test-SV-Guard Test.
// Warum kein Wegwerf-Konto ueber /sv/registrieren per UI: die Registrierung verschickt einen
// Magic-Link per Mail und verlangt eine SMS-Bestaetigung — beides ist per Playwright nicht
// fahrbar; der Seed stellt den Zustand her, den diese beiden vorgelagerten Schritte erzeugen.
// Alles ab dem ersten Login (Wizard, Upload, Unterschrift, Freischaltung) laeuft per UI.
//
// SICHERHEIT: telefon=NULL (keine SMS/WhatsApp), E-Mail @claimondo.de (intern -> Team-WA
// unterdrueckt), Standort offshore. Cleanup loescht ALLES wieder (FK-Kette), Fallback Soft-Delete.
//
// NUTZUNG:
//   node --env-file=<abs>/.env.local scripts/smoke/sv-onboarding-auto-freischaltung-seed.mjs create
//   node --env-file=<abs>/.env.local scripts/smoke/sv-onboarding-auto-freischaltung-seed.mjs cleanup
// Schreibt/liest scripts/smoke/.sv-onboarding-auto-freischaltung-seed.json (gitignored: .*.json).

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (node --env-file=<pfad>/.env.local …)')
  process.exit(2)
}
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const SEED_PATH = join(process.cwd(), 'scripts/smoke/.sv-onboarding-auto-freischaltung-seed.json')
const EMAIL_PREFIX = 'claimondo-e2e-onboarding-sv-'
const STANDORT_MARKER = 'Pellworm (E2E-Wegwerf-Onboarding-SV)'
// Pellworm, Schleswig-Holstein — PLZ 25849
const STANDORT = { lat: 54.5206, lng: 8.6494, plz: '25849' }

const cmd = process.argv[2]
if (cmd === 'create') await create()
else if (cmd === 'cleanup') await cleanup()
else {
  console.error('Usage: … create | cleanup')
  process.exit(2)
}

async function create() {
  await purgeStale()
  const runId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const email = `${EMAIL_PREFIX}${runId}@claimondo.de`
  const password = `E2eOnb-${randomBytes(9).toString('base64url')}`

  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { onboarding_quelle: 'self_service_neu', e2e_smoke: 'sv-onboarding-auto-freischaltung' },
  })
  if (authErr || !created?.user) throw new Error(`createUser: ${authErr?.message ?? 'kein user'}`)
  const uid = created.user.id

  const { error: profErr } = await db.from('profiles').upsert(
    {
      id: uid,
      email,
      rolle: 'sachverstaendiger',
      vorname: 'E2E',
      nachname: `Onboarding-${runId.slice(-4)}`,
      telefon: null,
      // Telefon-Schritt gilt als erledigt (die SMS-Bestaetigung ist per Playwright nicht fahrbar).
      twofa_telefon_verifiziert_am: new Date().toISOString(),
      // Wie die echte Registrierung (registriereSvBasicNeu, force_password_change): der erste
      // Login fuehrt auf /passwort-aendern. Die Spec faehrt diesen Schritt per UI mit — er
      // gehoert zum Nutzerweg, nicht zum Test-Aufbau.
      force_password_change: true,
    },
    { onConflict: 'id' },
  )
  if (profErr) {
    await db.auth.admin.deleteUser(uid).catch(() => {})
    throw new Error(`profiles: ${profErr.message}`)
  }

  const { data: sv, error: svErr } = await db
    .from('sachverstaendige')
    .insert({
      profile_id: uid,
      paket: 'basic',
      onboarding_quelle: 'self_service_neu',
      onboarding_status: 'pending',
      ist_testaccount: false,
      verifiziert: false,
      verifizierung_status: 'ausstehend',
      ist_aktiv: false,
      portal_zugang_freigeschaltet: false,
      gutachter_typ: 'kfz-gutachter',
      paket_umkreis_km: 20,
      paket_faelle_gesamt: 0,
      paket_faelle_genutzt: 0,
      offene_faelle: 0,
      ablehnungen_30_tage: 0,
      standort_adresse: STANDORT_MARKER,
      standort_plz: STANDORT.plz,
      standort_lat: STANDORT.lat,
      standort_lng: STANDORT.lng,
      isochrone_polygon: null,
    })
    .select('id')
    .single()
  if (svErr || !sv) {
    await db.from('profiles').delete().eq('id', uid)
    await db.auth.admin.deleteUser(uid).catch(() => {})
    throw new Error(`sachverstaendige: ${svErr?.message ?? 'kein row'}`)
  }

  const { error: fixErr } = await db
    .from('e2e_test_fixtures')
    .insert({ sv_id: sv.id, notiz: `sv-onboarding-auto-freischaltung runId=${runId}` })
  if (fixErr) console.warn('[seed] e2e_test_fixtures:', fixErr.message)

  const seed = { runId, email, password, uid, svId: sv.id, plz: STANDORT.plz, lat: STANDORT.lat, lng: STANDORT.lng, erzeugt: new Date().toISOString() }
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2))
  console.log(JSON.stringify({ ok: true, email, uid, svId: sv.id, seedPath: SEED_PATH }, null, 2))
}

async function purgeStale() {
  const { data: profs } = await db.from('profiles').select('id, email').like('email', `${EMAIL_PREFIX}%`)
  for (const p of profs ?? []) await purgeUser(p.id)
  const { data: svs } = await db.from('sachverstaendige').select('id, profile_id').eq('standort_adresse', STANDORT_MARKER)
  for (const s of svs ?? []) {
    if (s.profile_id) await purgeUser(s.profile_id)
    else await purgeSv(s.id)
  }
}

async function purgeSv(svId) {
  // Artefakte, die Wizard + Freigabe erzeugt haben koennen — in FK-Reihenfolge, best-effort.
  const { data: docs } = await db.from('pflichtdokumente').select('id, dokument_url').eq('sv_id', svId)
  const pfade = (docs ?? []).map((d) => d.dokument_url).filter(Boolean)
  if (pfade.length) await db.storage.from('fall-dokumente').remove(pfade).catch(() => {})
  await db.from('pflichtdokumente').delete().eq('sv_id', svId)
  // Der unterschriebene Partnervertrag liegt als PDF im Bucket `vertraege`
  // (vertraege_unterzeichnet.pdf_storage_path = "<svId>/<vertragId>.pdf") — mit entfernen,
  // sonst bleibt je Lauf ein verwaistes PDF liegen.
  const { data: vertraege } = await db.from('vertraege_unterzeichnet').select('pdf_storage_path').eq('sv_id', svId)
  const pdfPfade = (vertraege ?? []).map((v) => v.pdf_storage_path).filter(Boolean)
  if (pdfPfade.length) await db.storage.from('vertraege').remove(pdfPfade).catch(() => {})
  await db.from('vertraege_unterzeichnet').delete().eq('sv_id', svId)
  await db.from('tasks').delete().eq('entity_id', svId)
  await db.from('e2e_test_fixtures').delete().eq('sv_id', svId)
  await db.from('gutachter_termine').delete().eq('assignee_id', svId)
  const { error } = await db.from('sachverstaendige').delete().eq('id', svId)
  if (error) {
    console.warn(`[cleanup] sachverstaendige ${svId} hart loeschen fehlgeschlagen (${error.message}) → Soft-Delete`)
    await db
      .from('sachverstaendige')
      .update({ geloescht_am: new Date().toISOString(), ist_aktiv: false, ist_testaccount: true, portal_zugang_freigeschaltet: false })
      .eq('id', svId)
  }
}

async function purgeUser(uid) {
  const { data: svs } = await db.from('sachverstaendige').select('id').eq('profile_id', uid)
  for (const s of svs ?? []) await purgeSv(s.id)
  // Widget aus dem Wizard-Schritt (embed_sites, inhaber_profile_id) + Kalender-Opt-out.
  await db.from('embed_sites').delete().eq('inhaber_profile_id', uid).then(() => {}, () => {})
  await db.from('kalender_verbindungen').delete().eq('profile_id', uid).then(() => {}, () => {})
  const { error: pErr } = await db.from('profiles').delete().eq('id', uid)
  if (pErr) console.warn(`[cleanup] profiles ${uid}: ${pErr.message}`)
  await db.auth.admin.deleteUser(uid).catch((e) => console.warn(`[cleanup] auth ${uid}: ${e.message}`))
}

async function cleanup() {
  if (existsSync(SEED_PATH)) {
    const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'))
    if (seed.uid) await purgeUser(seed.uid)
    unlinkSync(SEED_PATH)
  }
  await purgeStale()
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).like('email', `${EMAIL_PREFIX}%`)
  console.log(JSON.stringify({ ok: true, verbleibend: count ?? 0 }))
}
