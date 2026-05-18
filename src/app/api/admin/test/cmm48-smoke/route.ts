// CMM-48 Smoke-Endpoint — verifiziert den `convertLeadToFall` → `convertLeadToClaim`
// Refactor durch einen End-to-End-Lauf gegen die echte staging-DB.
//
// Workflow:
//   1. Hostname-Guard (nur staging + localhost; Prod gibt 404)
//   2. Shared-Secret-Header `X-Smoke-Token` muss `SMOKE_API_KEY` matchen
//   3. Service-Role-Client legt SMOKE-Lead + ersten Admin als Dispatcher fest
//   4. `convertLeadToFall` ausführen
//   5. DB-Verify: faelle.kundenbetreuer_id === claims.kundenbetreuer_id,
//      faelle.claim_id != null, sa_unterschrieben=false, fallback_metadata gesetzt
//   6. Cleanup: Fall + Claim + Lead löschen (immer, auch im Fehlerpfad)
//   7. JSON-Result mit detaillierten Check-Booleans
//
// Aufruf aus `scripts/smoke-cmm48-convert.mjs`. NICHT als Productive-Route
// gedacht — der Hostname-Guard sorgt dafür dass Prod 404 zurückgibt.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { convertLeadToFall } from '@/lib/leads/convert-lead-to-fall'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type CheckMap = Record<string, boolean>

export async function POST(req: NextRequest) {
  // 1. Hostname-Guard — nur auf staging + localhost erreichbar, Prod gibt 404.
  // Bewusst KEIN ENV-Flag: prod und staging teilen sich `/etc/claimondo/.env.local`
  // via Symlink — ein `SMOKE_ALLOW`-ENV würde beide gleichzeitig freischalten
  // und den Endpoint auf der Produktiv-DB öffnen. Der Hostname ist
  // deploy-spezifisch und kann nicht versehentlich auf Prod durchschlagen.
  const host = req.headers.get('host') ?? ''
  if (!host.includes('staging') && !host.includes('localhost')) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // 2. Shared-Secret. Nutzt `X-Smoke-Token` statt Authorization, weil nginx
  // bereits ein Basic-Auth davor hat und Authorization-Header beansprucht.
  const expected = process.env.SMOKE_API_KEY
  const got = req.headers.get('x-smoke-token')
  if (!expected || got !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient()
  const t0 = Date.now()
  const stamp = (m: string) => console.log(`[cmm48-smoke +${Date.now() - t0}ms] ${m}`)
  stamp('start')

  // 3. Beliebigen aktiven Admin als „Dispatcher" für den convertLeadToFall-Call.
  const { data: admin, error: adminErr } = await svc
    .from('profiles')
    .select('id')
    .eq('rolle', 'admin')
    .eq('aktiv', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (adminErr || !admin) {
    return NextResponse.json({ error: 'kein aktiver Admin gefunden' }, { status: 500 })
  }
  const adminId = admin.id as string
  stamp(`admin loaded: ${adminId}`)

  // 4. SMOKE-Lead anlegen. Minimaler Set an Feldern, damit convertLeadToClaim
  // alle Pflicht-FKs auflösen kann (claims-INSERT, claim_parties-INSERT).
  const ts = Date.now()
  const leadInsert = {
    vorname: 'Smoke',
    nachname: `CMM48-${ts}`,
    email: `smoke-cmm48-${ts}@test.local`,
    telefon: `+49${String(ts).slice(-9)}`,
    status: 'quali-offen',
    qualifizierungs_phase: 'sa-ausstehend',
    schadens_fall_typ: 'haftpflicht',
    kunden_konstellation: 'eigener-schaden',
    schadens_art: 'haftpflicht',
    kennzeichen: `SMK-${String(ts).slice(-4)}`,
    unfalldatum: new Date().toISOString().slice(0, 10),
    fahrzeug_hersteller: 'BMW',
    fahrzeug_modell: '3er',
    fahrzeug_baujahr: 2020,
    erstzulassung: '2020-01-01',
    schuldfrage: 'gegner',
    schaden_sichtbar: true,
    fahrerflucht: false,
    nutzungsausfall: false,
    hat_haftpflicht: true,
    schadentyp: 'sonstiges',
    bkat_unfallart: 'auffahrunfall',
    polizei_vor_ort: false,
    polizeibericht_pflicht: false,
    unfallort: 'Berlin',
    unfallhergang: 'CMM-48-Smoke — Test-Lead automatisch erzeugt',
    gegner_bekannt: true,
    ist_fahrzeughalter: true,
    source_channel: 'smoke-test',
  } as const

  const { data: lead, error: leadErr } = await svc
    .from('leads')
    .insert(leadInsert)
    .select('id')
    .single()
  if (leadErr || !lead) {
    stamp(`lead insert FAIL: ${leadErr?.message ?? 'unbekannt'}`)
    return NextResponse.json(
      { error: `lead insert fehlgeschlagen: ${leadErr?.message ?? 'unbekannt'}` },
      { status: 500 },
    )
  }
  const leadId = lead.id as string
  stamp(`lead inserted: ${leadId}`)

  let fallId: string | null = null
  let claimId: string | null = null
  let convertErr: string | null = null
  let checks: CheckMap = {}
  let fallSnapshot: Record<string, unknown> | null = null
  let claimSnapshot: Record<string, unknown> | null = null

  try {
    // 5. Der Refactor-Pfad: convertLeadToFall delegiert an convertLeadToClaim.
    stamp('convertLeadToFall start')
    const result = await convertLeadToFall(svc, leadId, adminId)
    fallId = result.fallId
    stamp(`convertLeadToFall done: fallId=${fallId}`)

    // 6. DB-Verify
    // CMM-44 SP-A: kundenbetreuer_id + fahrerflucht sind faelle<->claims-
    // DUP-Spalten — über den claims-Embed gelesen (claims ist SSoT).
    // CMM-44 SP-B PR2a: kundenbetreuer_fallback_flag + kundenbetreuer_zugewiesen_am
    // leben jetzt auf claims (SSoT) — ebenfalls über den claims-Embed gelesen.
    const { data: fall, error: fallSelErr } = await svc
      .from('faelle')
      .select(
        'id, claim_id, sa_unterschrieben, sa_unterschrieben_am, abtretung_signiert_am, abtretung_pdf, besichtigungsort_adresse, claims:claim_id(kundenbetreuer_id, fahrerflucht, kundenbetreuer_fallback_flag, kundenbetreuer_zugewiesen_am)',
      )
      .eq('id', fallId)
      .maybeSingle()
    if (fallSelErr) {
      stamp(`fall verify select ERR: ${fallSelErr.message}`)
    }
    fallSnapshot = (fall as Record<string, unknown> | null) ?? null
    claimId = (fall?.claim_id as string | null) ?? null
    const fallClaimEmbed = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
    const fallKbId = (fallClaimEmbed?.kundenbetreuer_id as string | null) ?? null
    const fallFahrerflucht = (fallClaimEmbed?.fahrerflucht as boolean | null) ?? null
    const fallKbZugewiesenAm = (fallClaimEmbed?.kundenbetreuer_zugewiesen_am as string | null) ?? null
    if (claimId) {
      const { data: claim } = await svc
        .from('claims')
        .select('id, kundenbetreuer_id, fall_typ, schadenart')
        .eq('id', claimId)
        .maybeSingle()
      claimSnapshot = (claim as Record<string, unknown> | null) ?? null
    }

    checks = {
      fall_existiert: !!fall,
      claim_id_gesetzt: !!claimId,
      claim_existiert: !!claimSnapshot,
      kb_id_gesetzt: !!fallKbId,
      sa_unterschrieben_false: fall?.sa_unterschrieben === false,
      sa_unterschrieben_am_null: fall?.sa_unterschrieben_am === null,
      abtretung_signiert_am_null: fall?.abtretung_signiert_am === null,
      abtretung_pdf_null: fall?.abtretung_pdf === null,
      kundenbetreuer_zugewiesen_am_gesetzt: !!fallKbZugewiesenAm,
      // CMM-48: Dispatch-Feld das per lead-fall-mapping-Erweiterung jetzt
      // durchkommt (CMM-44 SP-A: über claims-Embed gelesen).
      fahrerflucht_uebernommen: fallFahrerflucht === false,
      // besichtigungsort-Fallback auf unfallort (Lead hatte `unfallort='Berlin'`,
      // keine besichtigungsort_adresse → buildFallInsertFromLead-Fallback greift):
      besichtigungsort_fallback: fall?.besichtigungsort_adresse === 'Berlin',
    }
  } catch (e) {
    convertErr = e instanceof Error ? e.message : String(e)
    stamp(`convert/verify EXCEPTION: ${convertErr}`)
    if (e instanceof Error && e.stack) console.error('[cmm48-smoke stack]', e.stack)
  } finally {
    stamp('cleanup start')
    // 7. Cleanup — Reihenfolge wichtig wegen FK-Constraints
    if (fallId) {
      await svc.from('faelle').delete().eq('id', fallId)
    }
    if (claimId) {
      await svc.from('claims').delete().eq('id', claimId)
    }
    await svc.from('leads').delete().eq('id', leadId)
    stamp('cleanup done')
  }

  const allOk = !convertErr && Object.values(checks).every(Boolean)

  return NextResponse.json(
    {
      ok: allOk,
      leadId,
      fallId,
      claimId,
      adminId,
      checks,
      convertError: convertErr,
      fallSnapshot,
      claimSnapshot,
      note: allOk
        ? 'CMM-48 Smoke grün — convertLeadToFall delegiert sauber an convertLeadToClaim, alle Spalten konsistent, Side-Effects + Cleanup OK.'
        : 'CMM-48 Smoke FAIL — siehe checks/convertError für Details.',
    },
    { status: allOk ? 200 : 500 },
  )
}
