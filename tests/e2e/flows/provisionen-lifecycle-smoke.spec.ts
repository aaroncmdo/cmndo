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
// Opt-in: RUN_PROVISION_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY + CRON_SECRET.

const RUN = !!process.env.RUN_PROVISION_SMOKE
test.skip(!RUN, 'set RUN_PROVISION_SMOKE=1 (laeuft echt gegen Prod)')
test.describe.configure({ mode: 'serial' })

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const CRON_SECRET = process.env.CRON_SECRET ?? ''
const WERKSTATT = 'aa5dd8d9-542f-4b7a-96ae-f1bd85acc9ac' // "Test Werkstatt", 150 EUR
const SMOKE_TAG = 'SMOKE-PROV-LC'

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
  const cron = await triggerReleaseCron()
  expect(cron.status, 'Cron 200 (CRON_SECRET ok)').toBe(200)
  expect(await provStatus(db, provId), 'Completion+7d -> freigegeben').toBe('freigegeben')
})

test('S8b HOLD: Completion erst vor 3 Tagen (<7d) -> bleibt pending', async () => {
  const db = admin()
  const { claimId, provId } = await insertWerkstattClaimPending(db)
  await setClaim(db, claimId, { operative_status: 'abgeschlossen', abgeschlossen_am: daysAgoIso(3) })
  await triggerReleaseCron()
  expect(await provStatus(db, provId), 'innerhalb 7d-Hold -> noch pending').toBe('pending')
})

test('S10a Storno: operative_status=storniert -> Provision storniert (Vorrang)', async () => {
  const db = admin()
  const { claimId, provId } = await insertWerkstattClaimPending(db)
  await setClaim(db, claimId, { operative_status: 'storniert' })
  await triggerReleaseCron()
  expect(await provStatus(db, provId), 'storniert -> Provision storniert').toBe('storniert')
})

test('S10b abgelehnt (non-final, 16.07-Fix): -> bleibt pending (NICHT storniert)', async () => {
  const db = admin()
  const { claimId, provId } = await insertWerkstattClaimPending(db)
  await setClaim(db, claimId, { operative_status: 'abgelehnt' })
  await triggerReleaseCron()
  // Regression-Pin: istClaimStorniert('abgelehnt')=false (nur 'storniert' ist Storno). Eine einfache
  // Ablehnung ist nicht terminal -> Provision darf NICHT storniert werden (geldrelevant).
  expect(await provStatus(db, provId), 'abgelehnt (non-final) -> bleibt pending').toBe('pending')
})
