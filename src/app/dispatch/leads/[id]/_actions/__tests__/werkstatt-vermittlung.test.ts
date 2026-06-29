// AAR Werkstatt-Vermittlung (Phase 1, Task 4): Tests fuer die Dispatcher-
// Zuweisung einer Reparatur-Werkstatt an einen Lead bzw. Claim.
//
// Wir testen primaer die reine Patch-Bau-Logik (buildZuweisungPatch) — sie
// kapselt das fachliche Kern-Verhalten (4 Felder + quelle='dispatcher') ohne
// die Supabase-Builder-Kette mocken zu muessen. Zusaetzlich ein schlanker
// Integrations-Smoke der vermittleWerkstatt-Action gegen einen gemockten
// auth-Guard + Supabase-Client (richtige Tabelle je target, DB-Error -> ok:false).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── buildZuweisungPatch (pure) ──────────────────────────────────────────────
import { buildZuweisungPatch } from '../werkstatt-vermittlung-patch'

describe('buildZuweisungPatch', () => {
  it('setzt die 4 reparatur_werkstatt_* Felder + quelle=dispatcher', () => {
    const patch = buildZuweisungPatch('werkstatt-1', 'dispatcher-user-9')
    expect(patch).toMatchObject({
      reparatur_werkstatt_id: 'werkstatt-1',
      reparatur_werkstatt_zugewiesen_von: 'dispatcher-user-9',
      reparatur_werkstatt_quelle: 'dispatcher',
    })
    // zugewiesen_am ist ein gueltiger ISO-Timestamp
    expect(typeof patch.reparatur_werkstatt_zugewiesen_am).toBe('string')
    expect(Number.isNaN(Date.parse(patch.reparatur_werkstatt_zugewiesen_am as string))).toBe(false)
  })

  it('genau diese vier Keys, keine ueberzaehligen', () => {
    const patch = buildZuweisungPatch('w', 'u')
    expect(Object.keys(patch).sort()).toEqual([
      'reparatur_werkstatt_id',
      'reparatur_werkstatt_quelle',
      'reparatur_werkstatt_zugewiesen_am',
      'reparatur_werkstatt_zugewiesen_von',
    ])
  })
})

// ─── vermittleWerkstatt (Action-Smoke) ───────────────────────────────────────
// Guard liefert dispatch-User + Supabase-Client; wir tracken update-Payloads
// und die getroffene Tabelle. Notification-Pfad laeuft non-critical durch
// (maybeSingle/Reads liefern null) und darf das Ergebnis nicht beeinflussen.

type UpdateCapture = { table: string; payload: Record<string, unknown> }
const updates: UpdateCapture[] = []
let updateError: { message: string } | null = null

function makeSupabaseStub() {
  return {
    from(table: string) {
      return {
        update: (payload: Record<string, unknown>) => {
          updates.push({ table, payload })
          return {
            eq: () => Promise.resolve({ error: updateError }),
          }
        },
        // Notification-Reads (Werkstatt-Row, Lead/Claim-Kontakt) -> null/no-op.
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }
    },
  }
}

let guardOk = true
vi.mock('@/lib/auth/guards', () => ({
  requireRole: vi.fn(async () =>
    guardOk
      ? { success: true, user: { id: 'dispatcher-user-9', rolle: 'dispatch' }, supabase: makeSupabaseStub() }
      : { success: false, error: 'Rolle "kunde" nicht berechtigt', user: null, supabase: makeSupabaseStub() },
  ),
}))

// createMitteilung (Customer-Notify) wird nur bei vorhandenem kunde_id gerufen —
// im Smoke ist der Read null, der Aufruf entfaellt. Trotzdem stubben, damit ein
// versehentlicher Call nicht den Admin-Client zieht.
vi.mock('@/lib/mitteilungen/create-mitteilung', () => ({
  createMitteilung: vi.fn(async () => ({ id: 'm-1' })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  updates.length = 0
  updateError = null
  guardOk = true
})

describe('vermittleWerkstatt', () => {
  it('schreibt die Felder auf leads bei target=lead', async () => {
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'lead', id: 'lead-1', werkstattId: 'w-1' })
    expect(r.ok).toBe(true)
    const upd = updates.find((u) => u.table === 'leads')
    expect(upd).toBeTruthy()
    expect(upd!.payload).toMatchObject({
      reparatur_werkstatt_id: 'w-1',
      reparatur_werkstatt_quelle: 'dispatcher',
      reparatur_werkstatt_zugewiesen_von: 'dispatcher-user-9',
    })
  })

  it('schreibt die Felder auf claims bei target=claim', async () => {
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'claim', id: 'claim-1', werkstattId: 'w-2' })
    expect(r.ok).toBe(true)
    const upd = updates.find((u) => u.table === 'claims')
    expect(upd).toBeTruthy()
    expect(upd!.payload.reparatur_werkstatt_id).toBe('w-2')
  })

  it('liefert ok:false bei DB-Error', async () => {
    updateError = { message: 'boom' }
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'lead', id: 'lead-1', werkstattId: 'w-1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('boom')
  })

  it('liefert ok:false wenn der Guard die Rolle ablehnt', async () => {
    guardOk = false
    const { vermittleWerkstatt } = await import('../werkstatt-vermittlung')
    const r = await vermittleWerkstatt({ target: 'lead', id: 'lead-1', werkstattId: 'w-1' })
    expect(r.ok).toBe(false)
    // Keine Mutation darf passiert sein.
    expect(updates).toHaveLength(0)
  })
})
