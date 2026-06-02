import { describe, it, expect } from 'vitest'
import { normalizeLegacyResult } from './send-normalize'

describe('normalizeLegacyResult', () => {
  it('maps {success:true, messageId} -> {ok:true, messageId}', () => {
    expect(normalizeLegacyResult({ success: true, messageId: 'm1' })).toEqual({ ok: true, messageId: 'm1' })
  })
  it('maps {success:false, error} -> {ok:false, error}', () => {
    expect(normalizeLegacyResult({ success: false, error: 'x' })).toEqual({ ok: false, error: 'x' })
  })
})
