import { describe, it, expect } from 'vitest'
import { planConversionCalls } from './conversion'

describe('planConversionCalls', () => {
  it('GA4 only → config + generate_lead', () => {
    expect(planConversionCalls({ ga4MeasurementId: 'G-1', gadsConversionId: null, gadsConversionLabel: null })).toEqual([
      ['config', 'G-1'],
      ['event', 'generate_lead', { send_to: 'G-1' }],
    ])
  })

  it('Ads mit Label → config + conversion mit send_to id/label', () => {
    expect(planConversionCalls({ ga4MeasurementId: null, gadsConversionId: 'AW-9', gadsConversionLabel: 'lbl' })).toEqual([
      ['config', 'AW-9'],
      ['event', 'conversion', { send_to: 'AW-9/lbl' }],
    ])
  })

  it('Ads ohne Label → send_to nur die ID', () => {
    expect(planConversionCalls({ ga4MeasurementId: null, gadsConversionId: 'AW-9', gadsConversionLabel: null })).toEqual([
      ['config', 'AW-9'],
      ['event', 'conversion', { send_to: 'AW-9' }],
    ])
  })

  it('beide → GA4- UND Ads-Calls', () => {
    expect(
      planConversionCalls({ ga4MeasurementId: 'G-1', gadsConversionId: 'AW-9', gadsConversionLabel: 'lbl' }),
    ).toEqual([
      ['config', 'G-1'],
      ['event', 'generate_lead', { send_to: 'G-1' }],
      ['config', 'AW-9'],
      ['event', 'conversion', { send_to: 'AW-9/lbl' }],
    ])
  })

  it('nichts gesetzt → keine Calls', () => {
    expect(planConversionCalls({ ga4MeasurementId: null, gadsConversionId: null, gadsConversionLabel: null })).toEqual([])
  })
})
