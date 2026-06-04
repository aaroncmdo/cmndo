import { describe, it, expect } from 'vitest'
import { pickPublicTracking } from './config-tracking'

describe('pickPublicTracking', () => {
  it('mappt die drei public IDs', () => {
    expect(
      pickPublicTracking({
        tracking_ga4_measurement_id: 'G-ABC123',
        tracking_gads_conversion_id: 'AW-999',
        tracking_gads_conversion_label: 'lbl_42',
      }),
    ).toEqual({ ga4MeasurementId: 'G-ABC123', gadsConversionId: 'AW-999', gadsConversionLabel: 'lbl_42' })
  })

  it('null bleibt null', () => {
    expect(
      pickPublicTracking({
        tracking_ga4_measurement_id: null,
        tracking_gads_conversion_id: null,
        tracking_gads_conversion_label: null,
      }),
    ).toEqual({ ga4MeasurementId: null, gadsConversionId: null, gadsConversionLabel: null })
  })

  it('leakt KEINE secret-Felder, auch wenn sie auf der Row liegen', () => {
    const out = pickPublicTracking({
      tracking_ga4_measurement_id: 'G-1',
      tracking_gads_conversion_id: null,
      tracking_gads_conversion_label: null,
      // @ts-expect-error — Extra-Feld simuliert eine breitere Row
      tracking_webhook_secret: 'TOPSECRET',
    })
    expect(JSON.stringify(out)).not.toContain('TOPSECRET')
    expect(Object.keys(out)).toEqual(['ga4MeasurementId', 'gadsConversionId', 'gadsConversionLabel'])
  })
})
