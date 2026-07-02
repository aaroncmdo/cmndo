import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getSideEffectMode, resolveSideEffectRecipient } from '../mode'

// Baileys-Send mocken -> der WhatsApp-Wiring-Test sendet nichts real.
const sendTextMock = vi.hoisted(() => vi.fn(async () => ({ ok: true, messageId: 'real-123' })))
vi.mock('@/lib/whatsapp/baileys-client', () => ({ sendWhatsAppText: sendTextMock }))

const KEYS = ['SIDE_EFFECT_MODE', 'SIDE_EFFECT_TEST_PHONE', 'SIDE_EFFECT_TEST_EMAIL']
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  sendTextMock.mockClear()
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('side-effects/mode — Gate-Logik', () => {
  it('default live wenn SIDE_EFFECT_MODE unset', () => {
    expect(getSideEffectMode()).toBe('live')
  })
  it('erkennt dry-run-Varianten', () => {
    for (const v of ['dry-run', 'dry_run', 'DRYRUN']) {
      process.env.SIDE_EFFECT_MODE = v
      expect(getSideEffectMode()).toBe('dry-run')
    }
  })
  it('erkennt test-recipient-Varianten', () => {
    for (const v of ['test-recipient', 'test', 'TEST_RECIPIENT']) {
      process.env.SIDE_EFFECT_MODE = v
      expect(getSideEffectMode()).toBe('test-recipient')
    }
  })
  it('unbekannter Wert -> live (fail-safe)', () => {
    process.env.SIDE_EFFECT_MODE = 'bogus'
    expect(getSideEffectMode()).toBe('live')
  })

  it('live -> senden an echten Empfaenger', () => {
    expect(resolveSideEffectRecipient('email', 'a@b.de')).toEqual({ mode: 'live', suppress: false, recipient: 'a@b.de' })
  })
  it('dry-run -> suppress', () => {
    process.env.SIDE_EFFECT_MODE = 'dry-run'
    expect(resolveSideEffectRecipient('whatsapp', '+49111')).toEqual({ mode: 'dry-run', suppress: true, recipient: '+49111' })
  })
  it('test-recipient + Override -> umleiten (whatsapp/email)', () => {
    process.env.SIDE_EFFECT_MODE = 'test-recipient'
    process.env.SIDE_EFFECT_TEST_PHONE = '+49999'
    process.env.SIDE_EFFECT_TEST_EMAIL = 'test@x.de'
    expect(resolveSideEffectRecipient('whatsapp', '+49111')).toEqual({ mode: 'test-recipient', suppress: false, recipient: '+49999' })
    expect(resolveSideEffectRecipient('email', 'real@x.de')).toEqual({ mode: 'test-recipient', suppress: false, recipient: 'test@x.de' })
  })
  it('test-recipient OHNE Override -> fail-safe suppress (nie an echt)', () => {
    process.env.SIDE_EFFECT_MODE = 'test-recipient'
    expect(resolveSideEffectRecipient('whatsapp', '+49111').suppress).toBe(true)
    expect(resolveSideEffectRecipient('email', 'real@x.de').suppress).toBe(true)
  })
})

describe('sendWhatsApp honoriert SIDE_EFFECT_MODE (wiring)', () => {
  it('dry-run: sendet NICHT, synthetischer Erfolg', async () => {
    process.env.SIDE_EFFECT_MODE = 'dry-run'
    const { sendWhatsApp } = await import('@/lib/whatsapp')
    const r = await sendWhatsApp('+491701234567', 'hallo')
    expect(r.success).toBe(true)
    expect(r.sid).toBe('side-effect-suppressed')
    expect(sendTextMock).not.toHaveBeenCalled()
  })
  it('test-recipient: leitet an Test-Nummer um', async () => {
    process.env.SIDE_EFFECT_MODE = 'test-recipient'
    process.env.SIDE_EFFECT_TEST_PHONE = '+49999999999'
    const { sendWhatsApp } = await import('@/lib/whatsapp')
    await sendWhatsApp('+491701234567', 'hallo')
    expect(sendTextMock).toHaveBeenCalledWith('+49999999999', 'hallo')
  })
  it('live (default): sendet an echte Nummer', async () => {
    const { sendWhatsApp } = await import('@/lib/whatsapp')
    await sendWhatsApp('+491701234567', 'hallo')
    expect(sendTextMock).toHaveBeenCalledWith('+491701234567', 'hallo')
  })
})
