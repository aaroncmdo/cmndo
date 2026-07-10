import { describe, it, expect } from 'vitest'
import { matchSvTitle } from './page-titles'

describe('matchSvTitle', () => {
  it('matcht exakte Top-Level-Route', () => {
    expect(matchSvTitle('/gutachter/kalender')).toBe('Kalender')
  })
  it('matcht Sub-Route auf ihren Prefix', () => {
    expect(matchSvTitle('/gutachter/faelle/123')).toBe('Meine Fälle')
  })
  it('längster Prefix gewinnt (einstellungen/verfuegbarkeit vor einstellungen)', () => {
    expect(matchSvTitle('/gutachter/einstellungen/verfuegbarkeit')).toBe('Verfügbarkeit')
    expect(matchSvTitle('/gutachter/einstellungen')).toBe('Einstellungen')
  })
  it('kein falscher Teil-Segment-Match', () => {
    // '/gutachter/fael' darf NICHT 'Meine Fälle' matchen
    expect(matchSvTitle('/gutachter/fael')).toBeNull()
  })
  it('unbekannte Route -> null', () => {
    expect(matchSvTitle('/gutachter/voll-unbekannt')).toBeNull()
  })
})
