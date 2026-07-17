import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Provisions-STAFFEL-Smoke (Phase C / S11) — beweist gegen prod, dass der LIVE DB-Trigger
// trg_award_partner_staffel -> award_werkstatt_staffel_boni die Staffel-Boni KORREKT vergibt:
//   count(partner_provisionen WHERE partner_typ,partner_id AND status IN (freigegeben,ausgezahlt))
//   >= werkstatt_staffel_stufen.schwelle  ->  INSERT partner_staffel_bonus
//   ON CONFLICT (partner_typ, partner_id, schwelle) DO NOTHING  (idempotent).
//
// Getestet durch Direkt-Insert freigegebener Provisionen mit claim_id=NULL: keine Claim-Anlage noetig
// und der partielle UNIQUE(partner_typ, claim_id) WHERE claim_id IS NOT NULL greift nicht -> N distinkte
// Zeilen fuer denselben Partner moeglich. Rein DB (Trigger feuert AFTER INSERT OF status) — kein Cron,
// kein HTTP, keine Notification.
//
// PARTNER-SICHER: nur Test Werkstatt (aa5dd8d9), Stufen 5/10/20 -> 200/250/300 (prod-verifiziert).
// Marker claim_nummer='SMOKE-STAFFEL-LC'. Restlos self-cleaning (Provisionen + Boni), beforeAll cleant
// ebenfalls (idempotenter Start). Opt-in: RUN_PROVISION_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY.

const RUN = !!process.env.RUN_PROVISION_SMOKE
test.skip(!RUN, 'set RUN_PROVISION_SMOKE=1 (laeuft echt gegen Prod)')

const WERKSTATT = 'aa5dd8d9-542f-4b7a-96ae-f1bd85acc9ac' // "Test Werkstatt"
const MARKER = 'SMOKE-STAFFEL-LC'

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// n freigegebene Werkstatt-Provisionen anlegen (claim_id=NULL, Marker fuer Cleanup).
async function insertFreigegeben(db: SupabaseClient, n: number) {
  const rows = Array.from({ length: n }, () => ({
    partner_typ: 'werkstatt', partner_id: WERKSTATT, claim_id: null,
    betrag_netto_eur: 150, status: 'freigegeben', trigger_event: 'claim_created',
    claim_nummer: MARKER, trigger_at: new Date().toISOString(),
  }))
  const { error } = await db.from('partner_provisionen').insert(rows)
  if (error) throw new Error(`insert freigegeben: ${error.message}`)
}

async function boniCount(db: SupabaseClient, schwelle?: number): Promise<number> {
  let q = db.from('partner_staffel_bonus').select('id', { count: 'exact', head: true })
    .eq('partner_typ', 'werkstatt').eq('partner_id', WERKSTATT)
  if (schwelle !== undefined) q = q.eq('schwelle', schwelle)
  const { count } = await q
  return count ?? -1
}

async function cleanup(db: SupabaseClient) {
  await db.from('partner_provisionen').delete().eq('partner_id', WERKSTATT).eq('claim_nummer', MARKER)
  await db.from('partner_staffel_bonus').delete().eq('partner_typ', 'werkstatt').eq('partner_id', WERKSTATT)
}

test.beforeAll(async () => {
  const db = admin()
  await cleanup(db) // idempotenter Start (raeumt Reste eines evtl. gecrashten Vorlaufs)
  const { count: freig } = await db.from('partner_provisionen').select('id', { count: 'exact', head: true })
    .eq('partner_typ', 'werkstatt').eq('partner_id', WERKSTATT).in('status', ['freigegeben', 'ausgezahlt'])
  // Baseline MUSS 0 sein — der Trigger zaehlt ALLE freigegebenen Provisionen des Partners.
  expect(freig ?? 0, 'Test-WS Baseline 0 freigegeben/ausgezahlt').toBe(0)
  expect(await boniCount(db), 'Test-WS Baseline 0 Boni').toBe(0)
})

test.afterAll(async () => { await cleanup(admin()) })

test('S11 Staffel: 5 freigegebene Werkstatt-Provisionen -> Bonus schwelle=5 (200 EUR), idempotent', async () => {
  const db = admin()

  // 4 freigegebene -> unter Schwelle 5 -> noch KEIN Bonus.
  await insertFreigegeben(db, 4)
  expect(await boniCount(db), '4 < 5 -> kein Bonus').toBe(0)

  // 5. freigegebene -> Schwelle 5 erreicht -> genau 1 Bonus schwelle=5, 200 EUR, status freigegeben.
  await insertFreigegeben(db, 1)
  expect(await boniCount(db, 5), 'schwelle 5 erreicht -> 1 Bonus').toBe(1)
  const { data: bonus } = await db.from('partner_staffel_bonus')
    .select('schwelle, bonus_betrag_netto, status')
    .eq('partner_typ', 'werkstatt').eq('partner_id', WERKSTATT).eq('schwelle', 5).single()
  expect(Number(bonus?.bonus_betrag_netto), 'Bonus schwelle 5 = 200 EUR').toBe(200)
  expect(bonus?.status, 'Bonus status = freigegeben').toBe('freigegeben')

  // 6. freigegebene -> Trigger feuert erneut; ON CONFLICT DO NOTHING -> weiterhin genau 1 Bonus.
  // (6 < 10 -> Schwelle 10 noch NICHT erreicht -> kein 2. Bonus.)
  await insertFreigegeben(db, 1)
  expect(await boniCount(db, 5), 'idempotent -> weiterhin genau 1 Bonus schwelle 5').toBe(1)
  expect(await boniCount(db), '6 < 10 -> genau 1 Bonus gesamt (keine Schwelle 10)').toBe(1)
})
