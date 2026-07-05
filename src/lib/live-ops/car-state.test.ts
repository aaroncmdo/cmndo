import { describe, it, expect } from 'vitest'
import { deriveCarState } from './car-state'

const NOW = 1_000_000_000
describe('deriveCarState', () => {
  it('mode=live wenn GPS frisch (< cutoff)', () => {
    const r = deriveCarState({ nowMs: NOW, live: { lat: 52.5, lng: 13.4, heading: 90, updatedAtMs: NOW - 60_000 }, aktiverTermin: null })
    expect(r.mode).toBe('live'); expect(r.lat).toBe(52.5); expect(r.heading).toBe(90)
  })
  it('ignoriert stale GPS (> cutoff) -> faellt auf Termin zurueck', () => {
    const r = deriveCarState({ nowMs: NOW, live: { lat: 52.5, lng: 13.4, heading: 90, updatedAtMs: NOW - 20*60_000 }, aktiverTermin: { id: 't1', status: 'unterwegs', losgefahrenAtMs: NOW - 5*60_000, svUnterwegsSeitMs: null, zielLat: 50.9, zielLng: 6.9, etaMinuten: 12 } })
    expect(r.mode).toBe('unterwegs_derived'); expect(r.lat).toBe(50.9); expect(r.terminId).toBe('t1')
  })
  it('mode=unterwegs_derived wenn kein GPS aber losgefahren', () => {
    const r = deriveCarState({ nowMs: NOW, live: null, aktiverTermin: { id: 't2', status: 'losgefahren', losgefahrenAtMs: NOW - 3*60_000, svUnterwegsSeitMs: null, zielLat: 50.9, zielLng: 6.9, etaMinuten: 20 } })
    expect(r.mode).toBe('unterwegs_derived'); expect(r.etaMinuten).toBe(20)
  })
  it('mode=none wenn weder GPS noch aktiver Termin', () => {
    const r = deriveCarState({ nowMs: NOW, live: null, aktiverTermin: null })
    expect(r.mode).toBe('none'); expect(r.lat).toBeNull()
  })
  it('mode=none wenn Termin ohne Ziel-Koords und kein GPS', () => {
    const r = deriveCarState({ nowMs: NOW, live: null, aktiverTermin: { id: 't3', status: 'unterwegs', losgefahrenAtMs: NOW, svUnterwegsSeitMs: null, zielLat: null, zielLng: null, etaMinuten: null } })
    expect(r.mode).toBe('none')
  })
})
