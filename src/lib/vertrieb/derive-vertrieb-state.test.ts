import { describe, it, expect } from 'vitest'
import { deriveVertriebState } from './derive-vertrieb-state'
import type { VertriebKontaktRow } from './vertrieb-kontakt.types'

const base: VertriebKontaktRow = {
  id: 'x', kind: 'sv', name: 'Test', email: null, telefon: null, plz: null, ort: null,
  lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null,
  roh_status: null, roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null,
  roh_portal_zugang: null, roh_onboarding_offen: null, roh_warteliste: null, notizen: null,
  rolle: null,
}
const sv = (o: Partial<VertriebKontaktRow>) => deriveVertriebState({ ...base, kind: 'sv', ...o }).stufe

describe('deriveVertriebState — typ×rolle (P1)', () => {
  it('typ: partner-lead = Lead, aktive Partner = Partner', () => {
    expect(deriveVertriebState({ ...base, kind: 'partner-lead' }).typ).toBe('lead')
    expect(deriveVertriebState({ ...base, kind: 'sv' }).typ).toBe('partner')
    expect(deriveVertriebState({ ...base, kind: 'makler' }).typ).toBe('partner')
    expect(deriveVertriebState({ ...base, kind: 'werkstatt' }).typ).toBe('partner')
  })
  it('rolle: aus der View-Spalte, Fallback sv', () => {
    expect(deriveVertriebState({ ...base, kind: 'makler', rolle: 'makler' }).rolle).toBe('makler')
    expect(deriveVertriebState({ ...base, kind: 'partner-lead', rolle: 'werkstatt' }).rolle).toBe('werkstatt')
    expect(deriveVertriebState({ ...base, kind: 'partner-lead', rolle: 'sv' }).rolle).toBe('sv')
    expect(deriveVertriebState({ ...base, kind: 'partner-lead', rolle: null }).rolle).toBe('sv')
  })
})

describe('deriveVertriebState — sv (konsolidiert die 6-Spalten-Fragmentierung)', () => {
  it('gesperrt schlägt alles', () => {
    expect(sv({ roh_gesperrt: true, roh_verifiziert: true, roh_portal_zugang: true, roh_ist_aktiv: true })).toBe('gesperrt')
  })
  it('verifiziert + portal + aktiv = aktiv', () => {
    expect(sv({ roh_verifiziert: true, roh_portal_zugang: true, roh_ist_aktiv: true })).toBe('aktiv')
  })
  it('portal offen ODER onboarding offen = onboarding', () => {
    expect(sv({ roh_verifiziert: true, roh_portal_zugang: false, roh_ist_aktiv: true })).toBe('onboarding')
    expect(sv({ roh_verifiziert: true, roh_portal_zugang: true, roh_onboarding_offen: true, roh_ist_aktiv: true })).toBe('onboarding')
  })
  it('nicht aktiv (aber nicht gesperrt) = pausiert', () => {
    expect(sv({ roh_verifiziert: true, roh_portal_zugang: true, roh_ist_aktiv: false })).toBe('pausiert')
  })
})

const makler = (o: Partial<VertriebKontaktRow>) => deriveVertriebState({ ...base, kind: 'makler', ...o }).stufe
describe('deriveVertriebState — makler/werkstatt', () => {
  it('gesperrt', () => expect(makler({ roh_gesperrt: true, roh_status: 'aktiv' })).toBe('gesperrt'))
  it('status aktiv = aktiv', () => expect(makler({ roh_status: 'aktiv' })).toBe('aktiv'))
  it('onboarding offen = onboarding (trotz status aktiv)', () => expect(makler({ roh_status: 'aktiv', roh_onboarding_offen: true })).toBe('onboarding'))
  it('status pending = kontaktiert', () => expect(makler({ roh_status: 'pending' })).toBe('kontaktiert'))
  it('werkstatt teilt die Logik', () => expect(deriveVertriebState({ ...base, kind: 'werkstatt', roh_status: 'aktiv' }).stufe).toBe('aktiv'))
})

const pl = (o: Partial<VertriebKontaktRow>) => deriveVertriebState({ ...base, kind: 'partner-lead', ...o }).stufe
describe('deriveVertriebState — partner-lead', () => {
  it('verloren', () => expect(pl({ roh_status: 'verloren' })).toBe('verloren'))
  it('konvertiert = aktiv', () => expect(pl({ roh_status: 'konvertiert' })).toBe('aktiv'))
  it('kontaktiert', () => expect(pl({ roh_status: 'kontaktiert' })).toBe('kontaktiert'))
  it('neu default', () => expect(pl({ roh_status: 'neu' })).toBe('neu'))
})

