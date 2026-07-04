import { describe, it, expect } from 'vitest'
import { buildEmailRecipients } from './email-recipients'

describe('buildEmailRecipients', () => {
  it('leer wenn keine Adresse', () => {
    expect(buildEmailRecipients(null, null)).toEqual([])
    expect(buildEmailRecipients('', '  ')).toEqual([])
  })

  it('nur primaere wenn keine zweite', () => {
    expect(buildEmailRecipients('haupt@x.de', null)).toEqual(['haupt@x.de'])
    expect(buildEmailRecipients('haupt@x.de', '')).toEqual(['haupt@x.de'])
  })

  it('primaer + zweit wenn beide gesetzt (primaer zuerst)', () => {
    expect(buildEmailRecipients('haupt@x.de', 'zweit@x.de')).toEqual(['haupt@x.de', 'zweit@x.de'])
  })

  it('trimmt Whitespace', () => {
    expect(buildEmailRecipients('  haupt@x.de  ', ' zweit@x.de ')).toEqual([
      'haupt@x.de',
      'zweit@x.de',
    ])
  })

  it('dedupt identische Adresse case-insensitive (kein Doppelversand)', () => {
    expect(buildEmailRecipients('haupt@x.de', 'HAUPT@X.de')).toEqual(['haupt@x.de'])
  })

  it('nur zweite wenn primaere fehlt (robust, kein stiller Verlust)', () => {
    expect(buildEmailRecipients(null, 'zweit@x.de')).toEqual(['zweit@x.de'])
  })
})
