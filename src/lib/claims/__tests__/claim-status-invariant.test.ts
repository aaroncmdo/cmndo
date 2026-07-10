// src/lib/claims/__tests__/claim-status-invariant.test.ts
// Guards the 3-axis status model (B0-Audit): operative_status-terminal ⇒ claims.status-terminal.
// state-machine (transitionFallStatus mappt op->status) + endzustand „Abschluss-Konvergenz"
// (:105-118 co-write operative_status beim Terminal) halten das — dieser Test fängt künftige
// Writer-Regressionen (ein neuer Pfad der nur EINE Achse setzt). Opt-in (RUN_PARITY=1 + service
// env), read-only. Verifiziert 2026-07-08: 32 Claims, 0 Violations.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RUN = !!process.env.RUN_PARITY && !!URL && !!SERVICE

// claims.status-Terminal-Werte (ABSCHLUSS_SUBSTATE-Domain, src/lib/claims/lifecycle.ts).
const STATUS_TERMINAL = [
  'reguliert_vollstaendig', 'storniert', 'klage_rechtsstreit', 'verjaehrt',
  'abgelehnt_final', 'an_externe_kanzlei_uebergeben', 'termin_durchgefuehrt',
]
// operative_status-Terminal-Werte (Cursor-Endzustände).
const OP_TERMINAL = ['abgeschlossen', 'storniert']

describe.skipIf(!RUN)('claim status invariant (operative_status-terminal => claims.status-terminal)', () => {
  it('haelt auf allen Live-Claims', async () => {
    const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: rows, error } = await admin.from('claims').select('id, status, operative_status').limit(2000)
    expect(error).toBeNull()
    const violations = (rows ?? []).filter(
      (c) =>
        OP_TERMINAL.includes((c.operative_status as string) ?? '') &&
        !STATUS_TERMINAL.includes((c.status as string) ?? ''),
    )
    process.stdout.write(`\n[status-invariant] checked=${rows?.length ?? 0} op-terminal-violations=${violations.length}\n`)
    if (violations.length) {
      process.stdout.write('VIOLATIONS: ' + JSON.stringify(violations.map((v) => ({ id: v.id, status: v.status, op: v.operative_status })), null, 2) + '\n')
    }
    expect(violations, `${violations.length} Claims: operative_status terminal aber claims.status nicht terminal`).toHaveLength(0)
  }, 60_000)
})
