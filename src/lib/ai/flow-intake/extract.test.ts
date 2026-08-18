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
  it('meldet Fehler statt leerer Felder, wenn die Antwort am Token-Limit riss', async () => {
    // Der teure Fall: Die API liefert bei `stop_reason: 'max_tokens'` einen
    // UNVOLLSTAENDIGEN tool_use-Block. Ohne Pruefung machen die Fallbacks
    // daraus still `deltas: {}` und `naechste_frage: ''` — bei `ok: true`.
    // Im Kundenfluss heisst das: getippte Schadenmeldung, nichts gespeichert
    // (die Route ueberspringt den Write bei leeren Deltas), keine Rueckfrage,
    // kein Fehler. Ein sichtbarer Fehlschlag laesst die 502 der Route greifen.
    create.mockResolvedValueOnce({
      stop_reason: 'max_tokens',
      content: [{ type: 'tool_use', name: 'erfasse_felder', input: { deltas: { unfallort: 'Koe' } } }],
    })
    const r = await extractIntakeTurn({
      firmenname: null,
      schema: [F('unfallort')],
      bekannt: {},
      historie: [],
      nachricht: 'Ein langer Unfallbericht mit vielen Angaben',
    })
    expect(r).toMatchObject({ ok: false })
    // Entscheidend: NICHT ok:true mit leeren Deltas.
    expect(r).not.toMatchObject({ ok: true })
  })

  it('laesst eine vollstaendige Antwort passieren (stop_reason end_turn)', async () => {
    // Gegenprobe zur Reissleine oben — sie darf den Normalfall nicht blocken.
    create.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          name: 'erfasse_felder',
          input: { deltas: { unfallort: 'Koeln' }, naechste_frage: 'Wann?', fertig: false },
        },
      ],
    })
    const r = await extractIntakeTurn({
      firmenname: null,
      schema: [F('unfallort')],
      bekannt: {},
      historie: [],
      nachricht: 'In Koeln',
    })
    expect(r).toMatchObject({ ok: true, deltas: { unfallort: 'Koeln' } })
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
