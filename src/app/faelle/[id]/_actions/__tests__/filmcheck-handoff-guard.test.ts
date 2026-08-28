import { describe, it, expect, vi, beforeEach } from 'vitest'

// Filmcheck-Audit 01.07.2026 (Robustheit): "QC bestanden" (saveFilmcheck) auf einem komplett-
// Claim, der noch VOR dem Filmcheck haengt (z.B. ohne Gutachten in 'begutachtung-laeuft'),
// rief transitionFallStatus('kanzlei-uebergeben') — laut State-Machine ein ungueltiger Uebergang
// -> Wurf -> rohe 500 im Browser statt eines sauberen Toasts. saveFilmcheck prueft jetzt via
// kanzleiHandoffMoeglich VOR dem Transition-Call und liefert stattdessen { success:false }.
// Diese Tests sichern: (1) sauberer Fehler statt Wurf/Handoff aus einem Nicht-Filmcheck-Status,
// (2) der regulaere Handoff aus 'filmcheck' laeuft weiter, (3) Idempotenz + nur_gutachter intakt.

let state: {
  user: { id: string } | null
  rolle: string
  claimId: string | null
  serviceTyp: string
  opStatus: string
  /** P4-Gate: Default true = Normalfall (Claim am SA-Signing geboren). */
  saUnterschrieben: boolean
}
const transitionMock = vi.fn()
const resolveMock = vi.fn()

function resolveRow(table: string, sel: string) {
  if (table === 'profiles' && sel.includes('rolle')) return { rolle: state.rolle }
  if (table === 'auftraege') return { id: 'auftrag-1' }
  if (table === 'claims' && sel.includes('service_typ')) {
    return { service_typ: state.serviceTyp, operative_status: state.opStatus, sa_unterschrieben: state.saUnterschrieben }
  }
  if (table === 'claims' && sel.includes('sv_id')) return { sv_id: null, claim_nummer: 'CLM-1' }
  if (table === 'claims') return { claim_nummer: 'CLM-1' }
  return null
}

// Chainable Supabase-Builder: .single()/.maybeSingle() liefern eine Row (resolveRow),
// ein direkt-awaited Chain (z.B. profiles.select('email').eq('rolle','kanzlei')) liefert
// via thenable eine leere Liste -> der Kanzlei-Mail-Loop wird uebersprungen.
function makeBuilder(table: string) {
  let sel = ''
  const b: Record<string, unknown> = {
    select: (arg: string) => {
      sel = arg
      return b
    },
    eq: () => b,
    order: () => b,
    limit: () => b,
    insert: async () => ({ error: null }),
    update: () => ({ eq: async () => ({ error: null }) }),
    single: async () => ({ data: resolveRow(table, sel), error: null }),
    maybeSingle: async () => ({ data: resolveRow(table, sel), error: null }),
    then: (onF: (v: { data: unknown[]; error: null }) => unknown) => onF({ data: [], error: null }),
  }
  return b
}

function makeServerClient() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => makeBuilder(table),
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => makeServerClient()) }))
vi.mock('@/lib/claims/get-claim-for-role', () => ({ resolveClaimId: (...a: unknown[]) => resolveMock(...a) }))
vi.mock('@/lib/faelle/state-machine', () => ({ transitionFallStatus: (...a: unknown[]) => transitionMock(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  emailFilmcheckBestanden: vi.fn(() => Promise.resolve()),
  emailFilmcheckNichtBestanden: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/email/google/flows', () => ({ sendKanzleiAuftragszusammenfassung: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/communications/send-fall', () => ({ sendFallCommunication: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/tasking', () => ({
  triggerKanzleiPaketTask: vi.fn(() => Promise.resolve()),
  triggerAsSendedatumTask: vi.fn(() => Promise.resolve()),
  autoCompleteTask: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/mitteilungen', () => ({ createGutachterMitteilung: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/autoPhase', () => ({ checkFallAutoPhase: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/gutachterTasking', () => ({ triggerSV05: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn(() => Promise.resolve()) }))

import { saveFilmcheck } from '../filmcheck'

beforeEach(() => {
  state = {
    user: { id: 'kb-1' },
    rolle: 'kundenbetreuer',
    claimId: 'claim-1',
    serviceTyp: 'komplett',
    opStatus: 'filmcheck',
    saUnterschrieben: true,
  }
  transitionMock.mockReset()
  resolveMock.mockReset().mockImplementation(async () => state.claimId)
})

describe('saveFilmcheck — Kanzlei-Handoff nur aus gueltigem Filmcheck-Status', () => {
  it('komplett-Claim VOR dem Filmcheck (begutachtung-laeuft) -> sauberer Fehler statt 500, KEIN Transition', async () => {
    state.opStatus = 'begutachtung-laeuft'
    // Realitaet: transitionFallStatus wuerfe hier "Ungueltiger Status-Uebergang" -> 500.
    transitionMock.mockRejectedValue(
      new Error('Ungueltiger Status-Uebergang: begutachtung-laeuft → kanzlei-uebergeben'),
    )

    const res = await saveFilmcheck('fall-1', 'ok')

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Filmcheck/i)
    expect(transitionMock).not.toHaveBeenCalled()
  })

  it('komplett-Claim IM Filmcheck -> regulaerer Handoff laeuft (Transition kanzlei-uebergeben)', async () => {
    state.opStatus = 'filmcheck'
    const res = await saveFilmcheck('fall-2', 'ok')

    expect(res.success).toBe(true)
    expect(transitionMock).toHaveBeenCalledWith('fall-2', 'kanzlei-uebergeben')
  })

  it('bereits uebergeben (kanzlei-uebergeben) -> idempotent success, KEIN zweiter Transition', async () => {
    state.opStatus = 'kanzlei-uebergeben'
    const res = await saveFilmcheck('fall-3', 'ok')

    expect(res.success).toBe(true)
    expect(transitionMock).not.toHaveBeenCalled()
  })

  it('nur_gutachter vor Filmcheck -> success ohne Handoff (kein Refusal, keine Kanzlei-Strecke)', async () => {
    state.serviceTyp = 'nur_gutachter'
    state.opStatus = 'begutachtung-laeuft'
    const res = await saveFilmcheck('fall-4', 'ok')

    expect(res.success).toBe(true)
    expect(transitionMock).not.toHaveBeenCalled()
  })

  it('P4: sa_unterschrieben=false (SV-Sofort-Claim) -> Handoff blockiert, KEIN Transition', async () => {
    state.opStatus = 'filmcheck'
    state.saUnterschrieben = false
    const res = await saveFilmcheck('fall-5', 'ok')

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/bestätigt/)
    expect(transitionMock).not.toHaveBeenCalled()
  })
})
