// src/lib/claims/__tests__/claim-phase-parity.test.ts
// Integration: proves getClaimLifecycle (TS SSoT) === v_claim_phase (SQL SSoT) on live claims.
// Opt-in (RUN_PARITY=1 + service env). NUR lesend. Reused getClaimLifecycleForClaim (kein Rebuild).
//
// Keying (post-faelle-drop, verified 2026-07-08): resolveClaimId trifft claims.id DIREKT, und
// auftraege/kanzlei_faelle.fall_id == claim_id -> ein claim_id als Loader-Arg lädt korrekt
// (Status/Lead via resolveClaimId, Aufträge/Kanzleifall via fall_id==claim_id). Daher sampeln wir
// v_claim_phase (claim-gekeyt) und geben claim_id direkt in den Loader -> volle Claim-Abdeckung.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RUN = !!process.env.RUN_PARITY && !!URL && !!SERVICE

describe.skipIf(!RUN)('claim-phase parity (getClaimLifecycle <-> v_claim_phase)', () => {
  it('stimmt auf einem Live-Sample bit-gleich ueberein', async () => {
    const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: rows, error } = await admin
      .from('v_claim_phase')
      .select('claim_id, main_phase, sub_phase')
      .limit(300)
    expect(error).toBeNull()
    const mismatches: { claim_id: string; sql: string; ts: string }[] = []
    let checked = 0
    for (const r of rows ?? []) {
      const { lifecycle } = await getClaimLifecycleForClaim(admin, r.claim_id as string)
      checked++
      const sql = `${r.main_phase}/${r.sub_phase}`
      const ts = `${lifecycle.mainPhase}/${lifecycle.subPhase}`
      if (sql !== ts) mismatches.push({ claim_id: r.claim_id as string, sql, ts })
    }
    // process.stdout.write is NOT intercepted by vitest -> the summary is always visible.
    process.stdout.write(`\n[parity] checked=${checked} mismatches=${mismatches.length}\n`)
    if (mismatches.length) process.stdout.write('MISMATCHES: ' + JSON.stringify(mismatches, null, 2) + '\n')
    expect(checked, 'Sample muss > 0 Claims pruefen (sonst vacuous)').toBeGreaterThan(0)
    expect(mismatches, `${mismatches.length} Claims driften zwischen TS und SQL`).toHaveLength(0)
  }, 180_000)
})
