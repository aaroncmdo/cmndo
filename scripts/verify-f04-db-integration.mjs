// Direkter DB-Integrationstest für F-04 Schritt 12.
// Erstellt minimal Fall + Claim, führt die gleiche Logik wie Schritt 12
// aus, prüft ob auftraege-Row entsteht, löscht danach auf.

import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const env = readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const eq = line.indexOf('='); if (eq < 0) return acc
  acc[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  return acc
}, {})

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const SV_ID = '7f79e570-776b-4525-82ce-c35654ed6ecc' // test-sv sachverstaendige.id

async function run() {
  let fallId = null
  let claimId = null
  let leadId = null

  // 1. Minimaler Lead
  const { data: lead, error: leadErr } = await db.from('leads').insert({
    vorname: 'F04-Int',
    nachname: 'Test',
    email: `f04-int-${Date.now()}@example.test`,
    telefon: '+4915100000077',
    source_channel: 'webform_direkt',
    status: 'quali-offen',
    schadens_art: 'unfall',
    service_typ: 'nur_gutachter',
    sachschaden_flag: true,
    unfallhergang: 'F04-Integration-Test',
    schuldfrage: 'gegner',
    schaden_sichtbar: true,
    polizei_vor_ort: false,
    schadentyp: 'auffahrunfall',
    kunde_lat: 51.2024,
    kunde_lng: 6.7818,
  }).select('id').single()
  if (leadErr) { console.error('[f04-int] Lead-Insert fehlgeschlagen:', leadErr.message); process.exit(1) }
  leadId = lead.id
  console.log('[f04-int] Lead:', leadId)

  // 2. Minimaler Claim (claim_nummer optional)
  const { data: claim, error: claimErr } = await db.from('claims').insert({
    lead_id: leadId,
    schadenart: 'haftpflicht',
    schadentag: new Date().toISOString().slice(0, 10),
    status: 'in_bearbeitung',
  }).select('id').single()
  if (claimErr) { console.error('[f04-int] Claim-Insert fehlgeschlagen:', claimErr.message); process.exit(1) }
  claimId = claim.id
  console.log('[f04-int] Claim:', claimId)

  // 3. Minimaler Fall mit sv_id gesetzt (Kernbedingung für Schritt 12)
  const fallNummer = `CLM-TEST-${Date.now()}`
  const { data: fall, error: fallErr } = await db.from('faelle').insert({
    lead_id: leadId,
    claim_id: claimId,
    fall_nummer: fallNummer,
    status: 'sv-zugewiesen',
    sv_id: SV_ID,
  }).select('id').single()
  if (fallErr) { console.error('[f04-int] Fall-Insert fehlgeschlagen:', fallErr.message); process.exit(1) }
  fallId = fall.id
  console.log('[f04-int] Fall:', fallId, '(sv_id:', SV_ID, ')')

  // 4. Schritt 12 — analog zu convert-lead-to-claim.ts
  console.log('[f04-int] Führe Schritt 12 aus...')
  try {
    const svIdAufFall = SV_ID
    if (svIdAufFall) {
      const { data: vorhandenAuftrag } = await db
        .from('auftraege')
        .select('id')
        .eq('fall_id', fallId)
        .eq('typ', 'erstgutachten')
        .maybeSingle()

      if (!vorhandenAuftrag) {
        const { error: auftragErr } = await db.from('auftraege').insert({
          fall_id: fallId,
          claim_id: claimId,
          sv_id: svIdAufFall,
          typ: 'erstgutachten',
          status: 'termin',
          reihenfolge: 1,
        })
        if (auftragErr) {
          console.error('[f04-int] FEHLER — auftraege-Insert fehlgeschlagen:', auftragErr.message)
          await cleanup(leadId, fallId, claimId)
          process.exit(1)
        }
        console.log('[f04-int] auftraege-Insert ausgeführt')
      } else {
        console.log('[f04-int] Auftrag war schon vorhanden (idempotent):', vorhandenAuftrag.id)
      }
    }
  } catch (err) {
    console.error('[f04-int] FEHLER in Schritt 12:', err.message)
    await cleanup(leadId, fallId, claimId)
    process.exit(1)
  }

  // 5. Verifizieren
  const { data: auftrag, error: verifyErr } = await db
    .from('auftraege')
    .select('id, typ, status, sv_id, fall_id, claim_id, reihenfolge')
    .eq('fall_id', fallId)
    .eq('typ', 'erstgutachten')
    .single()

  if (verifyErr || !auftrag) {
    console.error('[f04-int] FEHLER — kein auftraege-Row nach Insert:', verifyErr?.message)
    await cleanup(leadId, fallId, claimId)
    process.exit(1)
  }

  console.log('[f04-int] ✅ auftraege-Row vorhanden:')
  console.log('  id:', auftrag.id)
  console.log('  typ:', auftrag.typ)
  console.log('  status:', auftrag.status)
  console.log('  sv_id:', auftrag.sv_id)
  console.log('  fall_id:', auftrag.fall_id)
  console.log('  claim_id:', auftrag.claim_id)
  console.log('  reihenfolge:', auftrag.reihenfolge)

  // Prüfe Idempotenz: zweiter Aufruf darf keinen zweiten Row erzeugen
  console.log('[f04-int] Idempotenz-Check...')
  const { data: vorher } = await db.from('auftraege').select('id').eq('fall_id', fallId).eq('typ', 'erstgutachten')
  // Schritt 12 nochmal
  const { data: vorhanden2 } = await db.from('auftraege').select('id').eq('fall_id', fallId).eq('typ', 'erstgutachten').maybeSingle()
  if (!vorhanden2) {
    await db.from('auftraege').insert({ fall_id: fallId, claim_id: claimId, sv_id: SV_ID, typ: 'erstgutachten', status: 'beauftragt', reihenfolge: 1 })
  }
  const { data: nachher } = await db.from('auftraege').select('id').eq('fall_id', fallId).eq('typ', 'erstgutachten')
  if (vorher.length === nachher.length) {
    console.log('[f04-int] ✅ Idempotenz: kein doppelter Insert (', nachher.length, 'Row(s))')
  } else {
    console.error('[f04-int] ❌ Idempotenz-Fehler: vorher', vorher.length, '→ nachher', nachher.length)
  }

  // 6. Cleanup
  await cleanup(leadId, fallId, claimId)
  console.log('[f04-int] Cleanup abgeschlossen')
  console.log('[f04-int] === F-04 Integrations-Verifikation: BESTANDEN ===')
}

async function cleanup(leadId, fallId, claimId) {
  if (fallId) await db.from('auftraege').delete().eq('fall_id', fallId)
  if (fallId) await db.from('pflichtdokumente').delete().eq('fall_id', fallId)
  if (fallId) await db.from('faelle').delete().eq('id', fallId)
  if (claimId) await db.from('claims').delete().eq('id', claimId)
  if (leadId) await db.from('leads').delete().eq('id', leadId)
}

run().catch(e => { console.error('[f04-int] Uncaught:', e.message); process.exit(1) })
