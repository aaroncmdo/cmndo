import { describe, it, expect } from 'vitest'
import { istClaimbar, buildSvInsertAusLead, normalisiereSuche, BASIC_DEFAULT_RADIUS_KM, istErlaubtesPaket, SELF_SERVICE_PAKETE } from '../claim-eligibility'

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

  // Option A (Self-Service Paketauswahl): paket-Param + bezahlte Tiers.
  it('basic (default) hat KEIN Anzahlungs-Feld (Pay-per-Lead)', () => {
    const ins = buildSvInsertAusLead(baseLead, 'p')
    expect(ins.paket_faelle_gesamt).toBe(0)
    expect('anzahlung_status' in ins).toBe(false)
    expect('onboarding_anzahlung_betrag' in ins).toBe(false)
  })
  it('standard = 10 Faelle / 15km / 1500 EUR + anzahlung_status offen (portal bleibt gated)', () => {
    const ins = buildSvInsertAusLead(baseLead, 'p', 'standard') as Record<string, unknown>
    expect(ins.paket).toBe('standard')
    expect(ins.paket_faelle_gesamt).toBe(10)
    expect(ins.paket_umkreis_km).toBe(15)
    expect(ins.onboarding_anzahlung_betrag).toBe(1500)
    expect(ins.anzahlung_status).toBe('offen')
    expect(ins.portal_zugang_freigeschaltet).toBe(false)
  })
  it('pro/premium ziehen Kontingent/Radius/Preis aus PAKETE', () => {
    const pro = buildSvInsertAusLead(baseLead, 'p', 'pro') as Record<string, unknown>
    expect([pro.paket_faelle_gesamt, pro.paket_umkreis_km, pro.onboarding_anzahlung_betrag]).toEqual([25, 40, 3750])
    const prem = buildSvInsertAusLead(baseLead, 'p', 'premium') as Record<string, unknown>
    expect([prem.paket_faelle_gesamt, prem.paket_umkreis_km, prem.onboarding_anzahlung_betrag]).toEqual([50, 70, 7500])
  })
  it('SICHERHEIT: ungueltiges Paket faellt hart auf basic (kein Self-Escalation)', () => {
    const ins = buildSvInsertAusLead(baseLead, 'p', 'individuell') as Record<string, unknown>
    expect(ins.paket).toBe('basic')
    expect(ins.paket_faelle_gesamt).toBe(0)
    expect('anzahlung_status' in ins).toBe(false)
  })

  // Firmen-/Steuerdaten (paid Self-Reg): business-Param fuellt die Vertrag-Stammdaten.
  it('business-Daten: firmenname ueberschreibt lead.firma; Steuerfelder gesetzt', () => {
    const ins = buildSvInsertAusLead(baseLead, 'p', 'standard', {
      firmenname: 'SV-Buero Neu GmbH', rechtsform: 'GmbH', steuernummer: '123/456/78901', ustId: 'DE123456789',
    }) as Record<string, unknown>
    expect(ins.firmenname).toBe('SV-Buero Neu GmbH')
    expect(ins.rechtsform).toBe('GmbH')
    expect(ins.steuernummer).toBe('123/456/78901')
    expect(ins.ust_id).toBe('DE123456789')
  })
  it('ohne business-Daten: firmenname faellt auf lead.firma, Steuerfelder null', () => {
    const ins = buildSvInsertAusLead(baseLead, 'p') as Record<string, unknown>
    expect(ins.firmenname).toBe('KFZ Muster')
    expect(ins.rechtsform).toBeNull()
    expect(ins.steuernummer).toBeNull()
    expect(ins.ust_id).toBeNull()
  })
})

describe('istErlaubtesPaket — Self-Service-Whitelist', () => {
  it('nur basic + 3 kaufbare Pakete erlaubt', () => {
    expect(SELF_SERVICE_PAKETE).toEqual(['basic', 'standard', 'pro', 'premium'])
    for (const p of SELF_SERVICE_PAKETE) expect(istErlaubtesPaket(p)).toBe(true)
    expect(istErlaubtesPaket('admin')).toBe(false)
    expect(istErlaubtesPaket('individuell')).toBe(false)
  })
})
