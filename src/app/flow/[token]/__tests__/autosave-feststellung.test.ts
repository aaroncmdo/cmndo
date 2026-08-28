import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const speichereMock = vi.fn()
const enqueueMock = vi.fn()

vi.mock('../self-service-feststellung-actions', () => ({
  speichereFeststellungFlow: (...a: unknown[]) => speichereMock(...a),
}))
vi.mock('@/lib/offline/enqueue', () => ({
  enqueueOp: (...a: unknown[]) => enqueueMock(...a),
}))

import { autosaveFeststellung } from '../autosave-feststellung'

/**
 * Der Bug (Aaron 28.08.): `void speichereFeststellungFlow(...).catch(() => {})` fing NICHTS —
 * die Action wirft nie, sie liefert `{ ok, error }`. Ein abgelehnter Save verschwand
 * spurlos, waehrend der Wert im lokalen State stand und „uebernommen" aussah.
 */

const online = (wert: boolean) =>
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: wert },
    configurable: true,
  })

beforeEach(() => {
  speichereMock.mockReset()
  enqueueMock.mockReset().mockResolvedValue(undefined)
  online(true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

/** Der Helper ist fire-and-forget — auf die inneren Promises warten. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('online + Save gelingt', () => {
  it('speichert direkt und benutzt die Outbox NICHT', async () => {
    speichereMock.mockResolvedValue({ ok: true })
    autosaveFeststellung('tok', { a: 1 })
    await flush()
    expect(speichereMock).toHaveBeenCalledWith('tok', { a: 1 })
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})

describe('online + Save wird ABGELEHNT — der eigentliche Bug', () => {
  it('legt den Wert in die Outbox statt ihn zu verlieren', async () => {
    speichereMock.mockResolvedValue({ ok: false, error: 'Dieser Link ist ungültig.' })
    autosaveFeststellung('tok', { a: 1 })
    await flush()
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    const op = enqueueMock.mock.calls[0][0] as Record<string, unknown>
    expect(op.kind).toBe('flow_feststellung')
    expect(op.replay_class).toBe('B')
    expect(op.payload).toEqual({ token: 'tok', values: { a: 1 } })
  })

  it('meldet den Grund, statt ihn zu schlucken', async () => {
    speichereMock.mockResolvedValue({ ok: false, error: 'kaputt' })
    autosaveFeststellung('tok', {})
    await flush()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('online + Netzabbruch (der Aufruf selbst wirft)', () => {
  it('faellt ebenfalls in die Outbox', async () => {
    speichereMock.mockRejectedValue(new Error('network'))
    autosaveFeststellung('tok', { a: 1 })
    await flush()
    expect(enqueueMock).toHaveBeenCalledTimes(1)
  })
})

describe('offline', () => {
  it('geht direkt in die Outbox, ohne den Save zu versuchen', async () => {
    online(false)
    autosaveFeststellung('tok', { a: 1 })
    await flush()
    expect(speichereMock).not.toHaveBeenCalled()
    expect(enqueueMock).toHaveBeenCalledTimes(1)
  })
})

describe('letzte Rettung', () => {
  it('wirft nicht, wenn sogar das Einreihen scheitert — meldet es aber', async () => {
    speichereMock.mockResolvedValue({ ok: false, error: 'x' })
    enqueueMock.mockRejectedValue(new Error('IndexedDB blockiert'))
    expect(() => autosaveFeststellung('tok', { a: 1 })).not.toThrow()
    await flush()
    expect(console.error).toHaveBeenCalled()
  })
})
