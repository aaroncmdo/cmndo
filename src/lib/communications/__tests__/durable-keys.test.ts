import { describe, it, expect } from 'vitest'
import { buildFallDedupKey, payloadHash, mapToOutboxKanal, berlinTag } from '../durable-keys'

// C3/§9-#6: Die Dedup-Semantik entscheidet, ob der durable Umbau hilft oder schadet.
// Ein zu grober Key unterdrueckt legitime Wiederholungen (Reminder!) fuer immer —
// deshalb sind genau diese Grenzfaelle hier festgeschrieben.

describe('buildFallDedupKey — was gilt als derselbe Anlass?', () => {
  const basis = { template: 'storno_kunde', claimId: 'c1', tag: '2026-08-13' }

  it('derselbe Anlass am selben Tag => derselbe Key (Doppel-Klick wird EIN Versand)', () => {
    const a = buildFallDedupKey({ ...basis, payload: { '1': 'Max' } })
    const b = buildFallDedupKey({ ...basis, payload: { '1': 'Max' } })
    expect(a).toBe(b)
  })

  it('AM FOLGETAG anderer Key — sonst verstummt jeder Reminder nach dem ersten Mal', () => {
    const heute = buildFallDedupKey({ ...basis, payload: { '1': 'Max' } })
    const morgen = buildFallDedupKey({ ...basis, tag: '2026-08-14', payload: { '1': 'Max' } })
    expect(morgen).not.toBe(heute)
  })

  it('andere Payload => anderer Key (zweiter Terminvorschlag geht durch)', () => {
    const t1 = buildFallDedupKey({ ...basis, payload: { termin: '10:00' } })
    const t2 = buildFallDedupKey({ ...basis, payload: { termin: '14:00' } })
    expect(t1).not.toBe(t2)
  })

  it('anderes Template / anderer Claim => anderer Key', () => {
    const a = buildFallDedupKey({ ...basis, payload: {} })
    expect(buildFallDedupKey({ ...basis, template: 'sa_erinnerung', payload: {} })).not.toBe(a)
    expect(buildFallDedupKey({ ...basis, claimId: 'c2', payload: {} })).not.toBe(a)
  })

  it('Schluessel-Reihenfolge im Payload aendert den Key NICHT', () => {
    const a = buildFallDedupKey({ ...basis, payload: { a: '1', b: '2' } })
    const b = buildFallDedupKey({ ...basis, payload: { b: '2', a: '1' } })
    expect(a).toBe(b)
  })

  it('Empfaengerdaten zaehlen nicht zum Anlass (telefon/email fliegen raus)', () => {
    // sendFallCommunication haengt telefon/email an die data — sie beschreiben den
    // EMPFAENGER, nicht den Anlass. Ohne diesen Filter erzeugte eine nachgetragene
    // Telefonnummer einen neuen Key und damit einen Doppelversand.
    const ohne = buildFallDedupKey({ ...basis, payload: { '1': 'Max' } })
    const mit = buildFallDedupKey({ ...basis, payload: { '1': 'Max', telefon: '+49170', email: 'a@b.de' } })
    expect(mit).toBe(ohne)
  })

  it('hat die dokumentierte Form <template>:<claimId>:<hash>:<tag>', () => {
    const key = buildFallDedupKey({ ...basis, payload: { '1': 'Max' } })
    expect(key).toMatch(/^storno_kunde:c1:[0-9a-f]{8}:2026-08-13$/)
  })
})

describe('payloadHash', () => {
  it('ist deterministisch und fuer leere/fehlende Payload gleich', () => {
    expect(payloadHash(undefined)).toBe(payloadHash({}))
    expect(payloadHash({ x: '1' })).toBe(payloadHash({ x: '1' }))
  })

  it('unterscheidet unterschiedliche Werte', () => {
    expect(payloadHash({ x: '1' })).not.toBe(payloadHash({ x: '2' }))
  })
})

describe('mapToOutboxKanal', () => {
  it('bildet den kombinierten Kanal auf seinen primaeren ab', () => {
    // Das Label steuert den Versand NICHT — sendCommunication sendet weiterhin beides.
    expect(mapToOutboxKanal('whatsapp+email')).toBe('whatsapp')
  })

  it('mappt die uebrigen Registry-Kanaele', () => {
    expect(mapToOutboxKanal('email')).toBe('email')
    expect(mapToOutboxKanal('whatsapp')).toBe('whatsapp')
    expect(mapToOutboxKanal('portal')).toBe('in_app')
    expect(mapToOutboxKanal('intern')).toBe('in_app')
  })

  it('faellt bei unbekanntem/fehlendem Kanal auf whatsapp zurueck', () => {
    expect(mapToOutboxKanal(undefined)).toBe('whatsapp')
  })
})

describe('berlinTag', () => {
  it('liefert den Berliner Kalendertag, nicht den UTC-Tag', () => {
    // 22:30 UTC am 13.08. ist in Berlin (MESZ, +2) bereits der 14.08.
    expect(berlinTag(new Date('2026-08-13T22:30:00Z'))).toBe('2026-08-14')
    expect(berlinTag(new Date('2026-08-13T09:00:00Z'))).toBe('2026-08-13')
  })
})
