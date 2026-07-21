import { describe, it, expect, vi } from 'vitest'
import { provisioniereKarte, type ProvisionEffects } from './provisioniere-karte'

const OK_TOKEN = 'SKT-ABCDEFGH23456789'
const OK_URL = `https://app.claimondo.de/schaden/${OK_TOKEN}`

function effects(over: Partial<ProvisionEffects> = {}): ProvisionEffects {
  return {
    mintToken: vi.fn(async () => ({ ok: true, token: OK_TOKEN }) as const),
    writeAndRead: vi.fn(async () => ({ ok: true, uid: '04:aa:bb', readBack: OK_URL }) as const),
    finalize: vi.fn(async () => ({ ok: true }) as const),
    ...over,
  }
}

describe('provisioniereKarte', () => {
  it('happy path: mint -> write -> verify -> finalize', async () => {
    const e = effects()
    const res = await provisioniereKarte(e, { fahrzeugId: 'v1', pendingToken: null })
    expect(res).toEqual({ ok: true, token: OK_TOKEN })
    expect(e.finalize).toHaveBeenCalledWith(OK_TOKEN, '04:aa:bb', 'v1')
  })

  it('reuses pendingToken and does NOT mint again', async () => {
    const e = effects()
    const res = await provisioniereKarte(e, { fahrzeugId: null, pendingToken: OK_TOKEN })
    expect(res.ok).toBe(true)
    expect(e.mintToken).not.toHaveBeenCalled()
  })

  it('mint failure -> retryToken null', async () => {
    const e = effects({ mintToken: vi.fn(async () => ({ ok: false, error: 'mint kaputt' }) as const) })
    const res = await provisioniereKarte(e, { fahrzeugId: null, pendingToken: null })
    expect(res).toEqual({ ok: false, error: 'mint kaputt', retryToken: null })
  })

  it('write failure -> keeps token for retry', async () => {
    const e = effects({ writeAndRead: vi.fn(async () => ({ ok: false, error: 'nicht leer' }) as const) })
    const res = await provisioniereKarte(e, { fahrzeugId: null, pendingToken: null })
    expect(res).toEqual({ ok: false, error: 'nicht leer', retryToken: OK_TOKEN })
  })

  it('verify failure (readBack mismatch) -> keeps token', async () => {
    const e = effects({
      writeAndRead: vi.fn(
        async () =>
          ({ ok: true, uid: 'x', readBack: 'https://app.claimondo.de/schaden/SKT-ZZZZZZZZ23456789' }) as const,
      ),
    })
    const res = await provisioniereKarte(e, { fahrzeugId: null, pendingToken: null })
    expect(res.ok).toBe(false)
    expect((res as { retryToken: string }).retryToken).toBe(OK_TOKEN)
    expect((res as { error: string }).error).toMatch(/verifiziert/i)
  })

  it('finalize failure -> keeps token, surfaces error', async () => {
    const e = effects({ finalize: vi.fn(async () => ({ ok: false, error: 'Fahrzeug hat schon eine Karte' }) as const) })
    const res = await provisioniereKarte(e, { fahrzeugId: 'v1', pendingToken: null })
    expect(res).toEqual({ ok: false, error: 'Fahrzeug hat schon eine Karte', retryToken: OK_TOKEN })
  })
})
