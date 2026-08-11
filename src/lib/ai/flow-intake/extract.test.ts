import { describe, it, expect, vi, beforeEach } from 'vitest'

// extract.ts traegt `import 'server-only'` (Next-RSC-Guard) — im vitest-node-Env
// wird es gestubbt (etabliertes Muster, vgl. write-abuse-guard.test.ts).
vi.mock('server-only', () => ({}))

const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
  },
}))
vi.mock('@/lib/ai/models', () => ({ AI_MODELS: { flow_intake: 'test-model' } }))

import { extractIntakeTurn } from './extract'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

const F = (k: string): IntakeFeld => ({
  feld_key: k,
  typ: 'text',
  label: k,
  hint: null,
  optionen: null,
  pflicht: true,
  sektion: null,
  spalte: k,
})

beforeEach(() => {
  create.mockReset()
  process.env.ANTHROPIC_API_KEY = 'x'
})

describe('extractIntakeTurn', () => {
  it('liest tool_use -> deltas/frage/fertig', async () => {
    create.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'erfasse_felder',
          input: { deltas: { unfallort: 'Koeln' }, naechste_frage: 'Wann war das?', fertig: false },
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    const r = await extractIntakeTurn({
      firmenname: null,
      schema: [F('unfallort')],
      bekannt: {},
      historie: [],
      nachricht: 'In Koeln',
    })
    expect(r).toEqual({
      ok: true,
      deltas: { unfallort: 'Koeln' },
      naechste_frage: 'Wann war das?',
      fertig: false,
    })
  })
  it('ohne API-Key -> Fehler', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await extractIntakeTurn({
      firmenname: null,
      schema: [F('unfallort')],
      bekannt: {},
      historie: [],
      nachricht: 'x',
    })
    expect(r).toMatchObject({ ok: false })
  })
})
