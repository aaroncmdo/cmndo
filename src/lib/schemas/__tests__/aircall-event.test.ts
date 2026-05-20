import { describe, it, expect } from 'vitest'
import { AircallEventSchema } from '../aircall-event'

// AAR-1480 Schema-Tests fuer AircallEventSchema.

describe('AircallEventSchema', () => {
  it('akzeptiert minimales Event (nur event + data.id)', () => {
    const r = AircallEventSchema.safeParse({
      event: 'call.created',
      data: { id: 12345 },
    })
    expect(r.success).toBe(true)
  })

  it('akzeptiert event.id als string', () => {
    const r = AircallEventSchema.safeParse({
      event: 'call.created',
      data: { id: 'aircall-abc-123' },
    })
    expect(r.success).toBe(true)
  })

  it('akzeptiert vollstaendiges call.ended-Event', () => {
    const r = AircallEventSchema.safeParse({
      event: 'call.ended',
      data: {
        id: 12345,
        direction: 'inbound',
        started_at: 1716200000,
        answered_at: 1716200005,
        ended_at: 1716200120,
        duration: 115,
        raw_digits: '+491701234567',
        from: '+491701234567',
        to: '+4922125906530',
        user: { id: 67890, email: 'dispatcher@claimondo.de' },
        recording: 'https://aircall.io/rec/abc.mp3',
        tags: ['important', 'callback'],
      },
    })
    expect(r.success).toBe(true)
  })

  it('akzeptiert unbekannte Felder (passthrough) — Aircall darf erweitern', () => {
    const r = AircallEventSchema.safeParse({
      event: 'call.created',
      data: {
        id: 12345,
        zukunfts_neues_feld: 'something',
        verschachtelt: { custom: true },
      },
    })
    expect(r.success).toBe(true)
  })

  it('lehnt fehlendes event ab', () => {
    const r = AircallEventSchema.safeParse({ data: { id: 12345 } })
    expect(r.success).toBe(false)
  })

  it('lehnt leeres event ab', () => {
    const r = AircallEventSchema.safeParse({ event: '', data: { id: 12345 } })
    expect(r.success).toBe(false)
  })

  it('lehnt fehlendes data.id ab', () => {
    const r = AircallEventSchema.safeParse({ event: 'call.created', data: {} })
    expect(r.success).toBe(false)
  })

  it('lehnt data als string ab (muss object sein)', () => {
    const r = AircallEventSchema.safeParse({
      event: 'call.created',
      data: 'just-an-id',
    })
    expect(r.success).toBe(false)
  })

  it('akzeptiert comments-Array', () => {
    const r = AircallEventSchema.safeParse({
      event: 'call.ended',
      data: {
        id: 99,
        comments: [{ content: 'Kunde will Rueckruf' }, { content: 'WhatsApp folgt' }],
      },
    })
    expect(r.success).toBe(true)
  })
})
