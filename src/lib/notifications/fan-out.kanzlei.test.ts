import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeRecipients } from './fan-out'
import type { NotificationEvent } from './types'

// P1.2 (Operativ-Audit 17.07.): Die Kanzlei-Glocke war strukturell leer (0 Call-Sites).
// Diese Tests beweisen: kanzlei-User werden NUR beliefert, wenn der Claim eine
// kanzlei_faelle-Row hat (an Kanzlei uebergeben) — sonst bleibt die Rolle stumm.

type TableResults = Record<string, unknown>
let currentResults: TableResults = {}
let callLog: { table: string; method: string }[] = []

function makeBuilder(table: string) {
  // profiles wird im fan-out mehrfach mit VERSCHIEDENEN rolle-Filtern gequert (admin,
  // kanzlei) — der Fake waehlt das Result nach dem eq('rolle', X)-Filter, sonst wuerden
  // dieselben IDs zuerst als admin gemappt (addRecipient behaelt die erste Rolle).
  const eqArgs: unknown[][] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in', 'limit']) {
    builder[m] = (...args: unknown[]) => {
      if (m === 'eq') eqArgs.push(args)
      callLog.push({ table, method: m })
      return builder
    }
  }
  const resolveData = () => {
    if (table === 'profiles') {
      const rolle = eqArgs.find((a) => a[0] === 'rolle')?.[1]
      return currentResults[`profiles_${String(rolle)}`] ?? null
    }
    return currentResults[table] ?? null
  }
  builder.maybeSingle = async () => {
    const data = resolveData()
    return { data: Array.isArray(data) ? (data[0] ?? null) : data }
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: resolveData() }).then(resolve)
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

function uebergabeEvent(): NotificationEvent {
  return {
    id: 'evt-kanzlei-1',
    event_type: 'claim.an_externe_kanzlei_uebergeben',
    payload: {},
    fall_id: null,
    claim_id: 'claim-9',
    triggered_by_user_id: null,
    created_at: '2026-07-17T10:00:00Z',
    processed_at: null,
    status: 'pending',
    error_message: null,
    retry_count: 0,
    next_retry_at: null,
  } as NotificationEvent
}

beforeEach(() => {
  callLog = []
  currentResults = {
    claims: { geschaedigter_user_id: null, sv_id: null, kundenbetreuer_id: null, vehicle_id: null },
    makler_fall_consent: [],
    kanzlei_faelle: [{ id: 'kf-1' }],
    profiles_admin: [],
    profiles_kanzlei: [{ id: 'kanzlei-user-1' }, { id: 'kanzlei-user-2' }],
  }
})

describe('computeRecipients — Kanzlei-Aufloesung (P1.2)', () => {
  it('Claim MIT kanzlei_faelle-Row -> alle kanzlei-User bekommen in_app', async () => {
    const recipients = await computeRecipients(uebergabeEvent())
    const kanzlei = recipients.filter((r) => r.role === 'kanzlei')
    expect(kanzlei.map((r) => r.userId).sort()).toEqual(['kanzlei-user-1', 'kanzlei-user-2'])
    expect(kanzlei.every((r) => r.channels.includes('in_app'))).toBe(true)
  })

  it('Claim OHNE kanzlei_faelle-Row -> keine kanzlei-Recipients', async () => {
    currentResults.kanzlei_faelle = []
    const recipients = await computeRecipients(uebergabeEvent())
    expect(recipients.filter((r) => r.role === 'kanzlei')).toEqual([])
  })

  it('Gate-Query auf kanzlei_faelle wird immer gestellt (claim-gebunden, mit limit)', async () => {
    await computeRecipients(uebergabeEvent())
    expect(callLog.some((c) => c.table === 'kanzlei_faelle' && c.method === 'eq')).toBe(true)
    expect(callLog.some((c) => c.table === 'kanzlei_faelle' && c.method === 'limit')).toBe(true)
  })
})
