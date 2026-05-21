#!/usr/bin/env node
/**
 * scripts/probe-lead-dispatcher-visibility.mjs
 *
 * Stufe 1 — DB-Probe: Sieht der Dispatcher einen frisch angelegten Lead?
 *
 * Was hier passiert:
 *  1. Service-Role legt einen Lead an (analog zu lib/leads/create-lead.ts:createLead).
 *  2. Test-Dispatcher loggt sich via Email/Passwort ein (test-dispatch@claimondo.de).
 *  3. Dispatcher-Client liest leads → erwarte 1 Match auf den Probe-Marker.
 *  4. Cleanup: Service-Role löscht den Lead.
 *
 * Was hier NICHT passiert:
 *  - Kein Realtime, kein UI, keine Toast-Verifikation — das macht
 *    `scripts/probe-lead-realtime-visibility.mjs` (Stufe 2).
 *
 * Verwendung:
 *   node scripts/probe-lead-dispatcher-visibility.mjs
 *
 * Exit-Codes: 0 = Lead sichtbar, 1 = nicht sichtbar oder DB-Fehler.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()

const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const ANON_KEY = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('FEHLER: .env.local braucht NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const DISPATCHER_EMAIL = 'test-dispatch@claimondo.de'
const DISPATCHER_PASSWORD = 'Test1234!'

const MARKER = `ProbeLead-${Date.now()}`
const PROBE_LEAD = {
  vorname: MARKER,
  nachname: 'DispatcherVisibility',
  email: 'probe-dispatcher-visibility@claimondo.de',
  telefon: '+4915199990000',
  source_channel: 'probe-dispatcher-visibility',
  status: 'neu',
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let leadId = null

async function vorabAufraeumen() {
  // Verwaiste Probe-Leads aus früheren Runs killen.
  const { error } = await svc.from('leads').delete().like('vorname', 'ProbeLead-%')
  if (error) console.warn(`[WARN] Vorab-Cleanup nicht möglich: ${error.message}`)
}

async function probeLeadAnlegen() {
  const { data, error } = await svc
    .from('leads')
    .insert(PROBE_LEAD)
    .select('id, vorname, nachname, source_channel, status, created_at')
    .single()
  if (error || !data) {
    console.error(`[FEHLER] Probe-Lead konnte nicht angelegt werden: ${error?.message}`)
    process.exit(1)
  }
  leadId = data.id
  console.log(`✓ Probe-Lead angelegt: id=${data.id} marker=${data.vorname}`)
  console.log(`  source_channel=${data.source_channel} status=${data.status}`)
  return data
}

async function dispatcherClient() {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email: DISPATCHER_EMAIL,
    password: DISPATCHER_PASSWORD,
  })
  if (error || !data?.session) {
    console.error(`[FEHLER] Dispatcher-Login fehlgeschlagen: ${error?.message}`)
    process.exit(1)
  }
  console.log(`✓ Dispatcher eingeloggt: ${data.user.email}`)
  return client
}

async function dispatcherSiehtLead(client) {
  const { data, error } = await client
    .from('leads')
    .select('id, vorname, nachname, source_channel, status, zugewiesen_an')
    .eq('vorname', MARKER)
    .limit(5)
  if (error) {
    console.error(`[FEHLER] Dispatcher-SELECT fehlgeschlagen: ${error.message}`)
    return false
  }
  if (!data || data.length === 0) {
    console.error(`[FEHLER] Dispatcher findet Lead nicht — RLS blockiert oder Lead fehlt`)
    return false
  }
  if (data.length > 1) {
    console.warn(`[WARN] ${data.length} Leads mit Marker ${MARKER} — sollte 1 sein`)
  }
  const lead = data[0]
  console.log(`✓ Dispatcher sieht Lead: id=${lead.id}`)
  console.log(`  vorname=${lead.vorname} nachname=${lead.nachname}`)
  console.log(`  source_channel=${lead.source_channel} status=${lead.status}`)
  console.log(`  zugewiesen_an=${lead.zugewiesen_an ?? '(null — niemand assigned)'}`)
  return lead.id === leadId
}

async function listingQuerySimulation(client) {
  // Simuliert die Query aus src/app/dispatch/leads/page.tsx (LIMIT 200, ORDER BY created_at DESC)
  // — Dispatcher sieht den Lead, wenn er in den TOP 200 ist.
  const { data, error } = await client
    .from('leads')
    .select('id, vorname')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error(`[FEHLER] Listing-Query fehlgeschlagen: ${error.message}`)
    return false
  }
  const drin = data.some((l) => l.id === leadId)
  if (drin) {
    const position = data.findIndex((l) => l.id === leadId) + 1
    console.log(`✓ Lead in /dispatch/leads-Listing (LIMIT 200, ORDER created_at DESC): Position ${position}`)
  } else {
    console.error(`[FEHLER] Lead NICHT in den ersten 200 — Listing zeigt ihn nicht`)
  }
  return drin
}

async function cleanup() {
  if (!leadId) return
  const { error } = await svc.from('leads').delete().eq('id', leadId)
  if (error) {
    console.error(`[WARN] Cleanup fehlgeschlagen für ${leadId}: ${error.message}`)
  } else {
    console.log(`✓ Probe-Lead ${leadId} gelöscht`)
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Probe: Lead-Dispatcher-Visibility (DB-Ebene)')
  console.log('═══════════════════════════════════════════════════\n')

  await vorabAufraeumen()
  await probeLeadAnlegen()

  const client = await dispatcherClient()
  const direktSichtbar = await dispatcherSiehtLead(client)
  const imListing = await listingQuerySimulation(client)

  await cleanup()

  console.log('\n═══════════════════════════════════════════════════')
  if (direktSichtbar && imListing) {
    console.log('  ERGEBNIS: ✓ Dispatcher sieht frisch angelegte Leads')
    process.exit(0)
  } else {
    console.log('  ERGEBNIS: ✗ Dispatcher findet Lead nicht — RLS oder Routing prüfen')
    process.exit(1)
  }
}

main().catch(async (err) => {
  console.error(`[CRASH] ${err.message}`)
  await cleanup()
  process.exit(1)
})
