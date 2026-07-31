import { describe, it, expect } from 'vitest'
import { leiteServiceUebernahmeAb } from './service-wahl-uebernahme'

describe('leiteServiceUebernahmeAb (Paritaet zu convertLeadToClaim)', () => {
  // P4-Smoke-Befund 31.07.: "Nur Gutachten"-Wahl muss den Vermittlungs-Claim erreichen —
  // sonst laeuft der Kunde in die partnerkanzlei-/LexDrive-Pipeline.
  it('nur_gutachter -> service nur_gutachter + kanzlei nicht_gefragt', () => {
    expect(leiteServiceUebernahmeAb('nur_gutachter')).toEqual({
      service_typ: 'nur_gutachter',
      kanzlei_wunsch: 'nicht_gefragt',
    })
  })

  it('komplett -> partnerkanzlei', () => {
    expect(leiteServiceUebernahmeAb('komplett')).toEqual({
      service_typ: 'komplett',
      kanzlei_wunsch: 'partnerkanzlei',
    })
  })

  it('NULL/undefined -> komplett-Default (wie convertLeadToClaim)', () => {
    expect(leiteServiceUebernahmeAb(null)).toEqual({ service_typ: 'komplett', kanzlei_wunsch: 'partnerkanzlei' })
    expect(leiteServiceUebernahmeAb(undefined)).toEqual({ service_typ: 'komplett', kanzlei_wunsch: 'partnerkanzlei' })
  })

  it('unbekannter kuenftiger service-Wert wird durchgereicht, kanzlei nicht_gefragt', () => {
    expect(leiteServiceUebernahmeAb('beratung_plus')).toEqual({
      service_typ: 'beratung_plus',
      kanzlei_wunsch: 'nicht_gefragt',
    })
  })
})
