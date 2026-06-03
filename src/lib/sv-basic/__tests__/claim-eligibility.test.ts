import { describe, it, expect } from 'vitest'
import { istClaimbar, buildSvInsertAusLead, normalisiereSuche, BASIC_DEFAULT_RADIUS_KM } from '../claim-eligibility'

describe('istClaimbar', () => {
  it('offen + nicht konvertiert => true', () => {
    expect(istClaimbar({ claim_status: 'offen', konvertiert_zu_sv_id: null })).toBe(true)
  })
  it('schon beansprucht/konvertiert => false', () => {
    expect(istClaimbar({ claim_status: 'beansprucht_pending', konvertiert_zu_sv_id: null })).toBe(false)
    expect(istClaimbar({ claim_status: 'konvertiert', konvertiert_zu_sv_id: 'x' })).toBe(false)
  })
})

describe('normalisiereSuche', () => {
  it('trimmt + lowercased', () => { expect(normalisiereSuche('  Muster ')).toBe('muster') })
})

describe('buildSvInsertAusLead', () => {
  const baseLead = {
    vorname: 'Max', name: 'Muster', nachname: 'Muster', firma: 'KFZ Muster',
    telefon: '+49170', email: 'm@x.de', adresse: 'Hauptstr 1', plz: '42103', ort: 'Wuppertal',
    lat: 51.2, lng: 7.1, dat_id: 'DAT123', dat_expert_nr: 'DATEXP9', bvsk_nr: null,
    ihk_zertifikat: false, oebuv_nr: null, qualifikationen: ['kfz'], fachschwerpunkte: 'Lack',
    jahre_erfahrung: 10, isochrone_polygon: null, paket_umkreis_km: null,
  }
  it('mappt Basic-SV-Insert (paket=basic, pending, 25km default)', () => {
    const ins = buildSvInsertAusLead(baseLead, 'profile-uuid')
    expect(ins.profile_id).toBe('profile-uuid')
    expect(ins.paket).toBe('basic')
    expect(ins.onboarding_quelle).toBe('self_service_claim')
    expect(ins.verifizierung_status).toBe('ausstehend')
    expect(ins.ist_aktiv).toBe(false)
    expect(ins.portal_zugang_freigeschaltet).toBe(false)
    expect(ins.paket_umkreis_km).toBe(25)
    expect(ins.standort_lat).toBe(51.2)
    expect(ins.standort_plz).toBe('42103')
    expect(ins.gebiet_plz).toEqual(['42103'])
  })
  it('dat_nummer bevorzugt dat_expert_nr, faellt auf dat_id zurueck', () => {
    expect(buildSvInsertAusLead(baseLead, 'p').dat_nummer).toBe('DATEXP9')
    expect(buildSvInsertAusLead({ ...baseLead, dat_expert_nr: null }, 'p').dat_nummer).toBe('DAT123')
  })
  it('enthaelt KEINE nicht-existenten Spalten (fachschwerpunkte/partner_seit)', () => {
    const ins = buildSvInsertAusLead(baseLead, 'p')
    expect('fachschwerpunkte' in ins).toBe(false)
    expect('partner_seit' in ins).toBe(false)
  })
})
