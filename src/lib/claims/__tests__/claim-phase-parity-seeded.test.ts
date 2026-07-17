// src/lib/claims/__tests__/claim-phase-parity-seeded.test.ts
//
// Self-contained SEEDED Parity-Harness: seedet die Lifecycle-Szenarien (lifecycle-seed),
// beweist v_claim_phase (SQL-SSoT) === getClaimLifecycle (TS-SSoT) auf ihnen, raeumt dann
// wieder ab (afterAll — laeuft auch bei Test-Fail). Opt-in (RUN_PARITY=1 + service env),
// daher von CI uebersprungen. Schreibt NUR die SMOKE-LC-Seed-Claims und loescht sie wieder.
//
// Warum zusaetzlich zum Basis-Test claim-phase-parity.test.ts: der liest die LIVE-claims
// (prod = leer -> vacuous). Dieser seedet selbst -> deterministisch + non-vacuous, deckt
// die operative_status-getriebene o_sub-Ableitung + die feinen Terminal-Outcomes (B2/#4285) ab.
//
// Lauf: set -a; . "<main-repo>/.env.local"; set +a; \
//       RUN_PARITY=1 npx vitest run src/lib/claims/__tests__/claim-phase-parity-seeded.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { seedAllScenarios, resetAllScenarios, type SeededRow } from '@/lib/smoke/lifecycle-seed'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'
import { toClaimMainPhase, toClaimSubPhase } from '@/lib/claims/lifecycle'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RUN = !!process.env.RUN_PARITY && !!URL && !!SERVICE

describe.skipIf(!RUN)('claim-phase parity (seeded, getClaimLifecycle <-> v_claim_phase)', () => {
  let seeded: SeededRow[] = []

  beforeAll(async () => {
    const r = await seedAllScenarios()
    if (!r.ok) throw new Error(`seed failed: ${r.error}`)
    seeded = r.rows
  }, 180_000)

  // Cleanup laeuft IMMER (auch bei Test-Fail) -> keine Seed-Leichen auf prod.
  afterAll(async () => {
    await resetAllScenarios()
  }, 60_000)

  it('stimmt auf den geseedeten Szenarien bit-gleich ueberein', async () => {
    const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
    const claimIds = seeded.map((r) => r.claimId)
    const { data: rows, error } = await admin
      .from('v_claim_phase')
      .select('claim_id, main_phase, sub_phase')
      .in('claim_id', claimIds)
    expect(error).toBeNull()

    const mismatches: { claim_id: string; sql: string; ts: string }[] = []
    for (const r of rows ?? []) {
      const { lifecycle } = await getClaimLifecycleForClaim(admin, r.claim_id as string)
      // WS6/Kasko (17.07.): NORMALISIERTER Vergleich — die Reparatur-Lane hat ein View-eigenes
      // Vokabular (main 'reparatur', subs 'reparatur-werkstatt-suche'…), das toClaimMainPhase/
      // toClaimSubPhase kanonisch auf die TS-Taxonomie uebersetzen. Fuer alle uebrigen Szenarien
      // sind die Normalisierer identitiv -> weiterhin bit-gleiche Parity.
      const sql = `${toClaimMainPhase(r.main_phase as string | null)}/${toClaimSubPhase(r.sub_phase as string | null)}`
      const ts = `${lifecycle.mainPhase}/${lifecycle.subPhase}`
      if (sql !== ts) mismatches.push({ claim_id: r.claim_id as string, sql: `${r.main_phase}/${r.sub_phase}`, ts })
    }
    // process.stdout.write ist NICHT von vitest abgefangen -> Summary immer sichtbar.
    process.stdout.write(`\n[parity-seeded] seeded=${seeded.length} checked=${rows?.length ?? 0} mismatches=${mismatches.length}\n`)
    if (mismatches.length) process.stdout.write('MISMATCHES: ' + JSON.stringify(mismatches, null, 2) + '\n')

    expect(rows?.length ?? 0, 'v_claim_phase muss die geseedeten Claims sehen (service_role-Visibility)').toBeGreaterThan(0)
    expect(mismatches, `${mismatches.length} Claims driften zwischen TS und SQL`).toHaveLength(0)
  }, 180_000)
})
