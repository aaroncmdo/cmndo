import { describe, it, expect, vi, afterEach } from 'vitest'
import { trackEvent } from './track-event'

type WindowHolder = { window?: { gtag?: (...args: unknown[]) => void } }

afterEach(() => {
  delete (globalThis as WindowHolder).window
})

describe('trackEvent', () => {
  it('no-op ohne window (Server-Render)', () => {
    expect(() => trackEvent('generate_lead', { value: 0 })).not.toThrow()
  })

  it('no-op wenn window.gtag fehlt', () => {
    ;(globalThis as WindowHolder).window = {}
    expect(() => trackEvent('generate_lead')).not.toThrow()
  })

  it('ruft window.gtag mit (event, name, params)', () => {
    const gtag = vi.fn()
    ;(globalThis as WindowHolder).window = { gtag }
    trackEvent('generate_lead', { currency: 'EUR', value: 0, source: 'test' })
    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead', { currency: 'EUR', value: 0, source: 'test' })
  })

  it('Default-Params = {}', () => {
    const gtag = vi.fn()
    ;(globalThis as WindowHolder).window = { gtag }
    trackEvent('check_start')
    expect(gtag).toHaveBeenCalledWith('event', 'check_start', {})
  })
})
