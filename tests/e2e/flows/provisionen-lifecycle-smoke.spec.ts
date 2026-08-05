import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Provisions-LIFECYCLE-Matrix (Phase B) — beweist gegen prod, dass der Release-Cron
// (/api/cron/release-provisionen) Provisionen KORREKT freigibt/storniert:
//   S8  Release  = Completion (operative_status abgeschlossen/reguliert) + 7 Tage Hold -> freigegeben
//   S10a Storno  = operative_status 'storniert' -> Provision storniert (Vorrang)
//   S10b abgelehnt (non-final, 16.07-Fix) -> bleibt PENDING (kein Storno, kein Release)
//
// Serial: der Cron ist GLOBAL (verarbeitet alle pending). Jeder Test legt SEINEN Werkstatt-Claim
// an, backdatet, triggert den echten Cron, assertet SEINE Provision. Fremde pending Provisionen
// bleiben korrekt unberuehrt (verifiziert: die eine Alt-pending ist 'abgelehnt' -> Cron laesst sie).
//
// PARTNER-SICHER: nur Test Werkstatt (aa5dd8d9). Restlos self-cleaning. Marker fall_typ='SMOKE-PROV-LC'.
// RUN_PROVISION_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY + CRON_SECRET.
//
// CI-GELD-GUARD (Aaron-Entscheid 05.08., DECISIONS): der Cron ist GLOBAL — ein CI-Schuss wuerde
// echte faellige Provisionen FRUEHER freigeben (Geld-Timing). Deshalb laeuft vor JEDEM Schuss der
// Fremd-Effekt-Precheck (Muster aus scripts/smoke/netzwerk-release-scharf-smoke.mts, prod-erprobt
// 01.08./#4927): wuerde der Schuss eine FREMDE pending-Row flippen (storno-faellig ODER
// release-berechtigt: Completion+7d — inkl. nur_gutachter-Terminpfad; P3-Suppression flippt auf
// 'unterdrueckt' und zaehlt damit ebenfalls) -> test.skip fuer DIESEN Lauf (sichtbar begruendet,
// selten: der Nacht-Cron raeumt das Fenster, der naechste CI-Lauf ist wieder frei). KEIN
// Produkt-Change am Release-Runner — Testlogik bleibt aus dem Money-Pfad draussen.

const RUN = !!process.env.RUN_PROVISION_SMOKE
test.skip(!RUN, 'set RUN_PROVISION_SMOKE=1 (laeuft echt gegen Prod)')
test.describe.configure({ mode: 'serial' })

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const CRON_SECRET = process.env.CRON_SECRET ?? ''
const WERKSTATT = 'aa5dd8d9-542f-4b7a-96ae-f1bd85acc9ac' // "Test Werkstatt", 150 EUR
const SMOKE_TAG = 'SMOKE-PROV-LC'
const HOLD_MS = 7 * 86_400_000 // FG4-A: Completion + 7 Tage Hold

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
const createdClaims = new Set<string>()

// Werkstatt-Claim anlegen -> Trigger legt pending Provision an. Gibt {claimId, provId}.
async function insertWerkstattClaimPending(db: SupabaseClient): Promise<{ claimId: string; provId: string }> {
  const { data: c, error } = await db.from('claims').insert({
    schadentag: '2026-04-15', schadenort_adresse: 'SMOKE-PROV-LC Teststrasse 1', schadenort_plz: '10115',
    schadenort_ort: 'Berlin', schadenart: 'haftpflicht', schadens_ursache: 'unfall', fall_typ: SMOKE_TAG,
    operative_status: 'ersterfassung', werkstatt_id: WERKSTATT, vermittler_typ: 'werkstatt', vermittler_id: WERKSTATT,
  }).select('id').single()
  if (error || !c) throw new Error(`claim insert: ${error?.message}`)
  createdClaims.add(c.id as string)
  const { data: pp } = await db.from('partner_provisionen').select('id, status').eq('claim_id', c.id).single()
  expect(pp?.status, 'frische Provision ist pending').toBe('pending')
  return { claimId: c.id as string, provId: pp!.id as string }
}

async function setClaim(db: SupabaseClient, claimId: string, patch: Record<string, unknown>) {
  const { error } = await db.from('claims').update(patch).eq('id', claimId)
  if (error) throw new Error(`claim update: ${error.message}`)
}
async function provStatus(db: SupabaseClient, provId: string): Promise<string> {
  const { data } = await db.from('partner_provisionen').select('status').eq('id', provId).single()
  return (data?.status as string) ?? '?'
}
async function triggerReleaseCron(): Promise<{ status: number; released: number; storniert: number }> {
  const res = await fetch(`${APP}/api/cron/release-provisionen`, {
    headers: CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {},
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, released: body.released ?? -1, storniert: body.storniert ?? -1 }
}
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

// Fremd-Effekt-Precheck (portiert aus netzwerk-release-scharf-smoke.mts:58-112): zaehlt fremde
// pending-Rows, die der globale Schuss JETZT anfassen wuerde. >0 => Geld-Guard-Skip dieses Laufs.
async function zaehleFremdEffekte(db: SupabaseClient): Promise<number> {
  const eigene = [...createdClaims]
  const { data: pend, error } = await db.from('partner_provisionen').select('id, partner_typ, claim_id').eq('status', 'pending')
  if (error) throw new Error(`precheck pending: ${error.message}`)
  const fremde = ((pend ?? []) as Array<{ id: string; partner_typ: string; claim_id: string | null }>).filter(
    (r) => r.claim_id && !eigene.includes(r.claim_id),
  )
  if (fremde.length === 0) return 0
  const { data: claims, error: cErr } = await db
    .from('claims')
    .select('id, operative_status, abgeschlossen_am, service_typ, fall_typ')
    .in('id', fremde.map((r) => r.claim_id as string))
  if (cErr) throw new Error(`precheck claims: ${cErr.message}`)
  type ClaimRow = { id: string; operative_status: string | null; abgeschlossen_am: string | null; service_typ: string | null }
  const byId = new Map(((claims ?? []) as ClaimRow[]).map((c) => [c.id, c]))
  const cutoff = Date.now() - HOLD_MS
  let betroffen = 0
  for (const r of fremde) {
    const c = byId.get(r.claim_id as string)
    if (!c) continue
    const storno = c.operative_status === 'storniert'
    const releaseVoll =
      (c.operative_status === 'abgeschlossen' || c.operative_status === 'reguliert_vollstaendig') &&
      !!c.abgeschlossen_am && new Date(c.abgeschlossen_am).getTime() <= cutoff
    // nur_gutachter released terminbasiert (durchgefuehrt_am+7d) — konservativ mitzaehlen.
    // bezug-beide-Achsen-Filter (Superset), damit bezug-native Termine nicht uebersehen werden.
    let releaseNurGutachter = false
    if (c.service_typ === 'nur_gutachter') {
      const { data: term } = await db
        .from('gutachter_termine')
        .select('durchgefuehrt_am')
        .or(`claim_id.eq.${c.id},and(bezug_typ.eq.claim,bezug_id.eq.${c.id})`)
        .not('durchgefuehrt_am', 'is', null)
        .order('durchgefuehrt_am', { ascending: false })
        .limit(1)
      const ts = (term?.[0] as { durchgefuehrt_am?: string | null } | undefined)?.durchgefuehrt_am
      releaseNurGutachter = !!ts && new Date(ts).getTime() <= cutoff
    }
    if (storno || releaseVoll || releaseNurGutachter) {
      betroffen++
      console.log(`[geld-guard] FREMDE pending-Row ${r.id} (${r.partner_typ}, claim ${r.claim_id}, ${c.operative_status}) wuerde ${storno ? 'STORNIERT' : 'FREIGEGEBEN/UNTERDRUECKT'}.`)
    }
  }
  return betroffen
}

// Vor jedem Cron-Schuss: bei Fremd-Effekt diesen Lauf sichtbar skippen (afterAll raeumt die
// eigenen Seeds trotzdem). Der Skip ist zustandsabhaengig-selten, kein Dauer-Skip.
async function geldGuardOderSkip(db: SupabaseClient): Promise<void> {
  const betroffen = await zaehleFremdEffekte(db)
  test.skip(
    betroffen > 0,
    `Geld-Guard: ${betroffen} fremde pending-Row(s) wuerden vom globalen Cron-Schuss geflippt — dieser Lauf schiesst nicht (Nacht-Cron raeumt das Fenster; naechster Lauf prueft neu).`,
  )
}

test.beforeAll(() => {
  if (!CRON_SECRET) test.skip(true, 'CRON_SECRET fehlt (aus .env.local sourcen) — Release-Cron nicht triggerbar')
})

test.afterAll(async () => {
  const db = admin()
  const ids = [...createdClaims]
  if (ids.length) {
    await db.from('partner_provisionen').delete().in('claim_id', ids)
    await db.from('faelle_claim_bridge').delete().in('claim_id', ids)
    await db.from('claims').delete().in('id', ids)
  }
  const { data: rest } = await db.from('claims').select('id').eq('fall_typ', SMOKE_TAG)
  if (rest?.length) {
    const r = rest.map((x) => x.id as string)
    await db.from('partner_provisionen').delete().in('claim_id', r)
    await db.from('faelle_claim_bridge').delete().in('claim_id', r)
    await db.from('claims').delete().in('id', r)
  }
})

test('S8 Release: Completion (abgeschlossen) + 7d Hold -> Cron gibt frei (pending->freigegeben)', async () => {
  const db = admin()
  const { claimId, provId } = await insertWerkstattClaimPending(db)
  // Completion vor >7 Tagen -> release-berechtigt.
  await setClaim(db, claimId, { operative_status: 'abgeschlossen', abgeschlossen_am: daysAgoIso(8) })
  await geldGuardOderSkip(db)
  const cron = await triggerReleaseCron()
  expect(cron.status, 'Cron 200 (CRON_SECRET ok)').toBe(200)
  expect(await provStatus(db, provId), 'Completion+7d -> freigegeben').toBe('freigegeben')
})

test('S8b HOLD: Completion erst vor 3 Tagen (<7d) -> bleibt pending', async () => {
  const db = admin()
  const { claimId, provId } = await insertWerkstattClaimPending(db)
  await setClaim(db, claimId, { operative_status: 'abgeschlossen', abgeschlossen_am: daysAgoIso(3) })
  await geldGuardOderSkip(db)
  await triggerReleaseCron()
  expect(await provStatus(db, provId), 'innerhalb 7d-Hold -> noch pending').toBe('pending')
})

test('S10a Storno: operative_status=storniert -> Provision storniert (Vorrang)', async () => {
  const db = admin()
  const { claimId, provId } = await insertWerkstattClaimPending(db)
  await setClaim(db, claimId, { operative_status: 'storniert' })
  await geldGuardOderSkip(db)
  await triggerReleaseCron()
  expect(await provStatus(db, provId), 'storniert -> Provision storniert').toBe('storniert')
})

test('S10b abgelehnt (non-final, 16.07-Fix): -> bleibt pending (NICHT storniert)', async () => {
  const db = admin()
  const { claimId, provId } = await insertWerkstattClaimPending(db)
  await setClaim(db, claimId, { operative_status: 'abgelehnt' })
  await geldGuardOderSkip(db)
  await triggerReleaseCron()
  // Regression-Pin: istClaimStorniert('abgelehnt')=false (nur 'storniert' ist Storno). Eine einfache
  // Ablehnung ist nicht terminal -> Provision darf NICHT storniert werden (geldrelevant).
  expect(await provStatus(db, provId), 'abgelehnt (non-final) -> bleibt pending').toBe('pending')
})
