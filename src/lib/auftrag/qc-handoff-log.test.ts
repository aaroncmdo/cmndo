import { describe, it, expect, vi, beforeEach } from 'vitest'

// Filmcheck-Follow-up (02.07., nach #3402): gibKanzleipaketFrei loest den operativen
// Kanzlei-Handoff via saveFilmcheck aus, IGNORIERTE dessen Result aber. Seit #3402 wirft
// saveFilmcheck bei einem Nicht-Filmcheck-Fall NICHT mehr, sondern liefert { success:false }
// -> der bestehende catch (nur bei Wurf) griff nicht mehr -> ein abgelehnter Handoff war
// 100% stumm. Fix: Result erfassen + bei Refusal loggen. Kontrakt bleibt { ok:true } (die
// primaere Freigabe = auftrag abgeschlossen + kanzlei_faelle hat geklappt; kein { ok:false },
// weil die gutachten_final_freigegeben-Idempotenz oben einen Retry ohnehin abkuerzen wuerde).

const saveFilmcheckMock = vi.fn()
const resolveMock = vi.fn()
const checkAutoPhaseMock = vi.fn()

// Router-Mock fuer createAdminClient: pro Tabelle die passende Row (select->maybeSingle),
// plus update/insert/upsert als no-op-Erfolg.
const TABLE_ROWS: Record<string, unknown> = {
  auftraege: {
    id: 'a1',
    fall_id: 'f1',
    sv_id: 'sv1',
    gutachten_url: 'x.pdf',
    gutachten_final_freigegeben: false,
    status: 'offen',
  },
  kanzlei_faelle: null, // kein bestehender -> insert-Pfad
  claims: { operative_status: 'gutachten-eingegangen', service_typ: 'komplett' },
  gutachten: null,
}
function makeChain(table: string) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: TABLE_ROWS[table] ?? null, error: null }),
    single: async () => ({ data: TABLE_ROWS[table] ?? null, error: null }),
    update: () => ({ eq: async () => ({ error: null }) }),
    insert: async () => ({ error: null }),
    upsert: async () => ({ error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'kb-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: 'kundenbetreuer' } }) }) }),
    }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeChain(t) }) }))
vi.mock('@/lib/claims/get-claim-for-role', () => ({ resolveClaimId: (...a: unknown[]) => resolveMock(...a) }))
vi.mock('@/lib/autoPhase', () => ({ checkFallAutoPhase: (...a: unknown[]) => checkAutoPhaseMock(...a) }))
vi.mock('@/lib/storage/url', () => ({ getStorageUrl: vi.fn() }))
vi.mock('./abgabe-berechtigung', () => ({ kannGutachtenAbgeben: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// brauchtKanzleiHandoff bleibt ECHT (pur) -> ('gutachten-eingegangen','komplett') = true.
vi.mock('@/app/faelle/[id]/_actions/filmcheck', () => ({
  saveFilmcheck: (...a: unknown[]) => saveFilmcheckMock(...a),
}))

import { gibKanzleipaketFrei } from './qc'

beforeEach(() => {
  saveFilmcheckMock.mockReset()
  resolveMock.mockReset().mockResolvedValue('claim-1')
  checkAutoPhaseMock.mockReset().mockResolvedValue(undefined)
})

describe('gibKanzleipaketFrei — Handoff-Result wird nicht mehr stumm verschluckt (post-#3402)', () => {
  it('Handoff refused ({success:false}) -> ok:true (Freigabe gilt), Refusal wird geloggt', async () => {
    saveFilmcheckMock.mockResolvedValue({ success: false, error: 'Der Fall ist noch nicht im Filmcheck' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await gibKanzleipaketFrei('a1')

    // Primaere Freigabe (auftrag + kanzlei_faelle) hat geklappt -> Kontrakt bleibt ok:true.
    expect(res.ok).toBe(true)
    // Aber der abgelehnte Handoff ist jetzt sichtbar (nicht mehr stumm).
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Kanzlei-Handoff nicht ausgeloest'))
    warn.mockRestore()
  })

  it('Handoff erfolgreich ({success:true}) -> ok:true, KEIN Refusal-Log', async () => {
    saveFilmcheckMock.mockResolvedValue({ success: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await gibKanzleipaketFrei('a1')

    expect(res.ok).toBe(true)
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Kanzlei-Handoff nicht ausgeloest'))
    warn.mockRestore()
  })
})
