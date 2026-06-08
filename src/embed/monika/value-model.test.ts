import { describe, it, expect } from 'vitest'
import { schadenartFromAnswers, valueForSchadenart, buildConversionExtra } from './value-model'
import type { Answers } from './flow-script'
import type { MonikaConfig } from './types'

const cluster = { source: 'kfz_gutachter_lp' } as MonikaConfig
const svEmbed = { source: 'sv_embed' } as MonikaConfig

describe('schadenartFromAnswers', () => {
  it('mappt jedes Funnel-anliegen aufs Spec-Vokabular', () => {
    expect(schadenartFromAnswers({ anliegen: 'haftpflichtgutachten' })).toBe('haftpflicht')
    expect(schadenartFromAnswers({ anliegen: 'wertgutachten' })).toBe('wertgutachten')
    expect(schadenartFromAnswers({ anliegen: 'gegengutachten' })).toBe('gegengutachten')
    expect(schadenartFromAnswers({ anliegen: 'schadensberatung' })).toBe('schadensberatung')
  })

  it('faellt auf unbekannt zurueck ohne anliegen', () => {
    expect(schadenartFromAnswers({})).toBe('unbekannt')
  })
})

describe('valueForSchadenart', () => {
  it('haelt das Wert-Modell (Doc 11 §1 + schadensberatung=25)', () => {
    expect(valueForSchadenart('haftpflicht')).toBe(100)
    expect(valueForSchadenart('wertgutachten')).toBe(50)
    expect(valueForSchadenart('schadensberatung')).toBe(25)
    expect(valueForSchadenart('gegengutachten')).toBe(0)
    expect(valueForSchadenart('unbekannt')).toBe(0)
  })

  it('value ist immer eine Zahl', () => {
    expect(typeof valueForSchadenart('haftpflicht')).toBe('number')
  })
})

describe('buildConversionExtra', () => {
  const answers: Answers = { anliegen: 'haftpflichtgutachten' }

  it('Cluster-LP: voller Wert-Push mit Zahl-value + EUR', () => {
    const extra = buildConversionExtra(cluster, answers, { leadId: 'gfa_1', phone: '+4915112345678', gclid: 'abc' })
    expect(extra).toEqual({
      schadenart: 'haftpflicht',
      value: 100,
      currency: 'EUR',
      lead_id: 'gfa_1',
      phone: '+4915112345678',
      gclid: 'abc',
    })
    expect(typeof extra!.value).toBe('number')
  })

  it('sv_embed: undefined (SV definiert seinen Wert selbst)', () => {
    expect(buildConversionExtra(svEmbed, answers, { leadId: 'gfa_2' })).toBeUndefined()
  })

  it('laesst leere optionale Felder weg (kein leeres lead_id)', () => {
    const extra = buildConversionExtra(cluster, { anliegen: 'gegengutachten' }, { leadId: null })
    expect(extra).toEqual({ schadenart: 'gegengutachten', value: 0, currency: 'EUR' })
    expect('lead_id' in extra!).toBe(false)
  })
})
