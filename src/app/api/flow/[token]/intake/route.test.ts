import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// vi.mock-Factories werden gehoben -> Mock-Objekte via vi.hoisted bereitstellen.
const h = vi.hoisted(() => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: {} })
  const admin = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) }
  const speichere = vi.fn().mockResolvedValue({ ok: true })
  return { maybeSingle, admin, speichere }
})

vi.mock('@/lib/flow/flow-token', () => ({
  resolveFlowLeadId: vi.fn().mockResolvedValue({ admin: h.admin, leadId: 'lead-1' }),
}))
vi.mock('@/lib/self-service/feststellung-intake-schema', () => ({
  ladeFeststellungIntakeSchema: vi.fn().mockResolvedValue([
    {
      feld_key: 'unfallort',
      typ: 'text',
      label: 'Unfallort',
      hint: null,
      optionen: null,
      pflicht: true,
      sektion: null,
      spalte: 'unfallort',
    },
  ]),
}))
vi.mock('@/lib/branding/token-theme', () => ({
  resolveBrandingFromFlowToken: vi.fn().mockResolvedValue({ firmenname: 'KFZ Test' }),
}))
vi.mock('@/lib/ai/flow-intake/extract', () => ({
  extractIntakeTurn: vi.fn().mockResolvedValue({
    ok: true,
    deltas: { unfallort: 'Koeln', boese: 'x' },
    naechste_frage: 'Wann?',
    fertig: false,
  }),
}))
vi.mock('@/app/flow/[token]/self-service-feststellung-actions', () => ({
  speichereFeststellungFlow: h.speichere,
}))

import { POST } from './route'

beforeEach(() => {
  h.speichere.mockClear()
})

function req(body: unknown) {
  return new Request('http://x/api/flow/t/intake', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST intake', () => {
  it('extrahiert, persistiert nur Schema-Felder, gibt naechste Frage', async () => {
    const res = await POST(req({ nachricht: 'In Koeln', historie: [] }), {
      params: Promise.resolve({ token: 't' }),
    })
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, naechste_frage: 'Wann?', fertig: false })
    // Guard: nur 'unfallort' persistiert, nicht 'boese'
    expect(h.speichere).toHaveBeenCalledWith('t', { unfallort: 'Koeln' })
  })
  // Prod-Smoke 11.08.: unfalldatum="gestern" liess den Sammel-Save (alles-oder-nichts)
  // scheitern -> auch die brauchbaren Felder gingen verloren. Jetzt: einzeln nachziehen.
  it('rettet die guten Felder, wenn der Sammel-Save scheitert', async () => {
    const { ladeFeststellungIntakeSchema } = await import('@/lib/self-service/feststellung-intake-schema')
    const feld = (k: string) => ({
      feld_key: k, typ: 'text', label: k, hint: null,
      optionen: null, pflicht: false, sektion: null, spalte: k,
    })
    vi.mocked(ladeFeststellungIntakeSchema).mockResolvedValueOnce([feld('unfallort'), feld('unfalldatum')])

    const { extractIntakeTurn } = await import('@/lib/ai/flow-intake/extract')
    vi.mocked(extractIntakeTurn).mockResolvedValueOnce({
      ok: true,
      deltas: { unfallort: 'Koeln', unfalldatum: 'gestern' },
      naechste_frage: 'Und wann genau?',
      fertig: false,
    })
    h.speichere
      .mockResolvedValueOnce({ ok: false, error: 'invalid input syntax for type date: "gestern"' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'invalid input syntax for type date: "gestern"' })

    const res = await POST(req({ nachricht: 'gestern in Koeln', historie: [] }), {
      params: Promise.resolve({ token: 't3' }),
    })
    const json = await res.json()
    expect(json.ok).toBe(true)
    // 1x Sammel-Save + 2x einzeln (unfallort ok, unfalldatum verworfen)
    expect(h.speichere).toHaveBeenCalledTimes(3)
    expect(h.speichere).toHaveBeenCalledWith('t3', { unfallort: 'Koeln' })
  })

  it('leere Nachricht -> 400', async () => {
    const res = await POST(req({ nachricht: '' }), { params: Promise.resolve({ token: 't2' }) })
    expect(res.status).toBe(400)
  })
})
