#!/usr/bin/env node
// Seed fuer den Regel-4-Prod-Smoke „SV-Dokumente: Unterschriftsfeld + Partnervertrag"
// (Soll-Blatt: memory/abnahmen/2026-09-20-sv-dokumente-unterschriftsfeld-und-partnervertrag.md).
//
// Erzeugt den realistischen AUSGANGSZUSTAND, den ein vorgelagerter Schritt hergestellt haette —
// nicht mehr. Jeder Zustandsuebergang, der zum getesteten Soll gehoert, ist im Smoke ein echter
// UI-Klick (Regel 4): Upload, Unterschriftsfeld setzen, Vertrag unterschreiben, Kunde signiert.
//
//   create   Wegwerf-Gutachter (Basic, FREIGESCHALTET, ohne Partnervertrag, ohne Dokumente)
//            + Test-Lead mit FlowLink und bestaetigtem Gutachter-Termin bei diesem Gutachter
//   cleanup  entfernt alles restlos (Konto, SV, Lead, Claim, Termin, Dokumente, Storage)
//
// Aufruf (absoluter Pfad auf die .env.local des Haupt-Checkouts):
//   node --env-file="<repo>/.env.local" scripts/smoke/sv-dokumente-unterschriftsfeld-seed.mjs create
//
// Sicherheit (Regel 4): telefon = NULL auf Lead und Profil -> es gehen keine SMS/WhatsApp an
// echte Nummern. Die E-Mail-Adressen tragen das Praefix unten und existieren nur hier.

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file vergessen?)')
  process.exit(1)
}
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const SEED_PATH = join(process.cwd(), 'scripts/smoke/.sv-dokumente-unterschriftsfeld-seed.json')
const SV_PREFIX = 'e2e-svdok-'
const KUNDE_PREFIX = 'e2e-svdok-kunde-'

// Pellworm — weit weg von jedem echten Gutachter, damit der Wegwerf-SV keine echten Leads
// anzieht und umgekehrt kein echter SV in die Messung geraet.
const STANDORT = { plz: '25849', ort: 'Pellworm', lat: 54.5206, lng: 8.6494, adresse: 'Pellworm' }

const cmd = process.argv[2]

async function create() {
  const runId = randomBytes(4).toString('hex')
  const email = `${SV_PREFIX}${runId}@claimondo.de`
  const password = `E2eDok-${randomBytes(9).toString('base64url')}`
  const kundenEmail = `${KUNDE_PREFIX}${runId}@claimondo.de`

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr || !authUser?.user) throw new Error(`auth.createUser: ${authErr?.message}`)
  const uid = authUser.user.id

  const { error: profErr } = await db.from('profiles').upsert({
    id: uid,
    email,
    vorname: 'Smoke',
    nachname: `Dokument-${runId}`,
    telefon: null,
    rolle: 'sachverstaendiger',
    // Wie die echte Registrierung: der erste Login verlangt ein neues Passwort.
    force_password_change: true,
  })
  if (profErr) throw new Error(`profiles: ${profErr.message}`)

  // Der Gutachter ist BEREITS freigeschaltet (das ist der Stand nach dem Basic-Onboarding seit
  // dem 19.09.) und hat KEINEN Partnervertrag — genau die Lage der 16 Bestands-Konten.
  const { data: sv, error: svErr } = await db
    .from('sachverstaendige')
    .insert({
      profile_id: uid,
      firmenname: `Smoke Dokumente ${runId}`,
      email,
      telefon: null,
      paket: 'basic',
      strasse: 'Inselweg 1',
      plz: STANDORT.plz,
      ort: STANDORT.ort,
      standort_lat: STANDORT.lat,
      standort_lng: STANDORT.lng,
      portal_zugang_freigeschaltet: true,
      ist_aktiv: true,
      verifiziert: true,
      verifiziert_am: new Date().toISOString(),
      vertrag_unterschrieben: false,
      partnervertrag_hinweis_am: null,
      basic_onboarding_abgeschlossen_am: new Date().toISOString(),
      // Kein Testaccount-Flag: der Smoke prueft u. a. die Dispatch-Sicht, und
      // ist_testaccount=true wuerde den SV dort ausblenden (applyDispatchableFilter).
      ist_testaccount: false,
    })
    .select('id')
    .single()
  if (svErr || !sv) throw new Error(`sachverstaendige: ${svErr?.message}`)

  // --- Kundenseite: Lead + FlowLink + gebuchter Termin bei genau diesem Gutachter -----------
  //
  // Das ist der Ausgangszustand, den die vorgelagerten Schritte (Quali, Feststellung,
  // Terminwahl) hergestellt haetten — Regel 4 erlaubt den Seed genau dafuer. Der Schritt, den
  // dieser Smoke beweist (der Kunde unterschreibt), bleibt ein echter Klick.
  //
  // Die Lead-Felder sind so gesetzt, dass die DB-getriebene Step-Matrix den Kunden bis zum
  // 'sa'-Schritt durchfallen laesst: Szenario 'haftpflicht' verlangt schuldfrage='gegner', und
  // jeder Schritt verschwindet, sobald ALLE seine erhebt_felder befuellt sind.
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .insert({
      vorname: 'Smoke',
      nachname: `Kunde-${runId}`,
      email: kundenEmail,
      telefon: null, // Regel 4: keine echten SMS/WhatsApp
      service_typ: 'komplett',
      source_channel: 'self_service',
      status: 'neu',
      qualifizierungs_phase: 'erstkontakt',
      sprache: 'de',
      // Szenario-Weiche: nur 'haftpflicht' hat den sa-Schritt
      schuldfrage: 'gegner',
      // feststellung-Schritt: alle vier Felder, sonst bleibt er stehen
      schadentyp: 'auffahrunfall',
      kennzeichen: `NF-SM ${runId.slice(0, 3).toUpperCase()}`,
      unfallhergang: 'Auffahrunfall beim Anfahren an der Ampel (Abnahme-Smoke, keine echten Daten).',
      unfallort: STANDORT.adresse,
      gegner_versicherung: 'HUK-Coburg',
      // ort_besichtigung + ort_fahrzeug
      besichtigungsort_adresse: STANDORT.adresse,
      besichtigungsort_lat: STANDORT.lat,
      besichtigungsort_lng: STANDORT.lng,
      fahrzeug_standort_adresse: STANDORT.adresse,
      fahrzeug_standort_lat: STANDORT.lat,
      fahrzeug_standort_lng: STANDORT.lng,
    })
    .select('id')
    .single()
  if (leadErr || !lead) throw new Error(`leads: ${leadErr?.message}`)

  const token = randomBytes(16).toString('hex')
  const { error: flErr } = await db.from('flow_links').insert({
    token,
    lead_id: lead.id,
    status: 'aktiv',
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (flErr) throw new Error(`flow_links: ${flErr.message}`)

  // Termin BEZUG-NATIV (bezug_typ/bezug_id), niemals zusaetzlich lead_id — ein doppelter
  // Bezug reizt den Validate-Trigger. assignee_typ MUSS 'sachverstaendiger' sein, sonst
  // leitet der Flow keine sv_id ab und das SA-Tool laeuft nie. typ='sv_begutachtung' ist
  // fuer den Lookup der Flow-Seite Pflicht (seit 09.09.2026).
  //
  // Slot zufaellig: ein Exclusion-Constraint verbietet ueberlappende Termine desselben
  // Assignees — ein fixer Slot liefe beim zweiten Lauf in 23P01.
  const tagVersatz = 3 + Math.floor(Math.random() * 25)
  const stunde = 8 + Math.floor(Math.random() * 8)
  const start = new Date(Date.now() + tagVersatz * 24 * 60 * 60 * 1000)
  start.setUTCHours(stunde, 0, 0, 0)
  const ende = new Date(start.getTime() + 40 * 60 * 1000)
  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .insert({
      assignee_typ: 'sachverstaendiger',
      assignee_id: sv.id,
      start_zeit: start.toISOString(),
      end_zeit: ende.toISOString(),
      status: 'bestaetigt',
      quelle: 'self_service',
      typ: 'sv_begutachtung',
      bezug_typ: 'lead',
      bezug_id: lead.id,
      besichtigungsort_adresse: STANDORT.adresse,
      besichtigungsort_lat: STANDORT.lat,
      besichtigungsort_lng: STANDORT.lng,
    })
    .select('id')
    .single()
  if (tErr || !termin) throw new Error(`gutachter_termine: ${tErr?.message}`)

  const seed = {
    runId,
    email,
    password,
    kundenEmail,
    uid,
    svId: sv.id,
    leadId: lead.id,
    token,
    terminId: termin.id,
    plz: STANDORT.plz,
    erzeugt: new Date().toISOString(),
  }
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2))
  console.log(
    JSON.stringify({ ok: true, email, svId: sv.id, leadId: lead.id, token, seedPath: SEED_PATH }, null, 2),
  )
}

async function cleanup() {
  const geloescht = { profile: 0, sv: 0, leads: 0, claims: 0, termine: 0, dokumente: 0, dateien: 0 }

  const { data: profs, error: profErr } = await db
    .from('profiles')
    .select('id, email')
    .like('email', `${SV_PREFIX}%`)
  if (profErr) throw new Error(`profiles-Read: ${profErr.message}`)

  for (const prof of profs ?? []) {
    const { data: svs } = await db.from('sachverstaendige').select('id').eq('profile_id', prof.id)
    for (const s of svs ?? []) {
      // Storage: hochgeladene Pflichtdokumente + erzeugte Vertrags-PDFs
      const { data: pd } = await db
        .from('pflichtdokumente')
        .select('id, dokument_url')
        .eq('sv_id', s.id)
      const pfade = (pd ?? []).map((r) => r.dokument_url).filter(Boolean)
      if (pfade.length > 0) {
        const { error } = await db.storage.from('fall-dokumente').remove(pfade)
        if (error) console.warn(`  Storage fall-dokumente: ${error.message}`)
        else geloescht.dateien += pfade.length
      }
      const { error: pdErr } = await db.from('pflichtdokumente').delete().eq('sv_id', s.id)
      if (pdErr) console.warn(`  pflichtdokumente: ${pdErr.message}`)
      else geloescht.dokumente += pd?.length ?? 0

      const { data: vertraege } = await db
        .from('vertraege_unterzeichnet')
        .select('id, pdf_storage_path')
        .eq('sv_id', s.id)
      const vertragsPfade = (vertraege ?? []).map((v) => v.pdf_storage_path).filter(Boolean)
      if (vertragsPfade.length > 0) {
        const { error } = await db.storage.from('vertraege').remove(vertragsPfade)
        if (error) console.warn(`  Storage vertraege: ${error.message}`)
        else geloescht.dateien += vertragsPfade.length
      }
      const { error: vuErr } = await db.from('vertraege_unterzeichnet').delete().eq('sv_id', s.id)
      if (vuErr) console.warn(`  vertraege_unterzeichnet: ${vuErr.message}`)

      const { error: tErr } = await db.from('gutachter_termine').delete().eq('assignee_id', s.id)
      if (tErr) console.warn(`  gutachter_termine: ${tErr.message}`)
      else geloescht.termine += 1

      const { error: svDelErr } = await db.from('sachverstaendige').delete().eq('id', s.id)
      if (svDelErr) console.warn(`  sachverstaendige: ${svDelErr.message}`)
      else geloescht.sv += 1
    }

    const { error: authDelErr } = await db.auth.admin.deleteUser(prof.id)
    if (authDelErr) console.warn(`  auth.deleteUser: ${authDelErr.message}`)
    else geloescht.profile += 1
  }

  // Kunden-Seite: Lead, Claim und deren Dokumente
  const { data: leads } = await db.from('leads').select('id').like('email', `${KUNDE_PREFIX}%`)
  for (const lead of leads ?? []) {
    const { data: claims } = await db.from('claims').select('id').eq('lead_id', lead.id)
    for (const c of claims ?? []) {
      const { data: fd } = await db
        .from('fall_dokumente')
        .select('id, storage_path')
        .eq('fall_id', c.id)
      const pfade = (fd ?? []).map((r) => r.storage_path).filter(Boolean)
      if (pfade.length > 0) {
        const { error } = await db.storage.from('fall-dokumente').remove(pfade)
        if (error) console.warn(`  Storage claim-Dokumente: ${error.message}`)
        else geloescht.dateien += pfade.length
      }
      const { error: fdErr } = await db.from('fall_dokumente').delete().eq('fall_id', c.id)
      if (fdErr) console.warn(`  fall_dokumente: ${fdErr.message}`)
      const { error: cErr } = await db.from('claims').delete().eq('id', c.id)
      if (cErr) console.warn(`  claims: ${cErr.message}`)
      else geloescht.claims += 1
    }
    const { error: flErr } = await db.from('flow_links').delete().eq('lead_id', lead.id)
    if (flErr) console.warn(`  flow_links: ${flErr.message}`)
    const { error: tErr } = await db.from('gutachter_termine').delete().eq('lead_id', lead.id)
    if (tErr) console.warn(`  gutachter_termine (lead): ${tErr.message}`)
    const { error: lErr } = await db.from('leads').delete().eq('id', lead.id)
    if (lErr) console.warn(`  leads: ${lErr.message}`)
    else geloescht.leads += 1
  }

  if (existsSync(SEED_PATH)) unlinkSync(SEED_PATH)

  const { count: restSv } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .like('email', `${SV_PREFIX}%`)
  const { count: restLeads } = await db
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .like('email', `${KUNDE_PREFIX}%`)
  console.log(JSON.stringify({ ok: true, geloescht, verbleibend: { sv: restSv ?? 0, leads: restLeads ?? 0 } }, null, 2))
}

try {
  if (cmd === 'create') await create()
  else if (cmd === 'cleanup') await cleanup()
  else {
    console.error('Nutzung: sv-dokumente-unterschriftsfeld-seed.mjs create|cleanup')
    process.exit(1)
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
