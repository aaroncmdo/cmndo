import { describe, it, expect, beforeEach, vi } from 'vitest'
import { trackLpEvent } from '../track'

describe('trackLpEvent', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { gtag: vi.fn() })
  })

  it('fügt lp_variant + source als Defaults zu jedem Event hinzu', () => {
    trackLpEvent('phone_call', { event_label: 'hero-tel' })
    expect(window.gtag).toHaveBeenCalledWith('event', 'phone_call', {
      event_label: 'hero-tel',
      lp_variant: 'test_b',
      source: 'kfzgutachter-ads-lp',
    })
  })

  it('lässt Caller-Params Defaults überschreiben', () => {
    trackLpEvent('generate_lead', { lp_variant: 'override' })
    expect(window.gtag).toHaveBeenCalledWith('event', 'generate_lead', {
      lp_variant: 'override',
      source: 'kfzgutachter-ads-lp',
    })
  })

  it('macht nichts wenn window.gtag fehlt', () => {
    vi.stubGlobal('window', {})
    expect(() => trackLpEvent('phone_call')).not.toThrow()
  })

  it('macht nichts in SSR (kein window)', () => {
    vi.stubGlobal('window', undefined)
    expect(() => trackLpEvent('phone_call')).not.toThrow()
  })
})
