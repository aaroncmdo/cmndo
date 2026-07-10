import { describe, it, expect } from 'vitest'
import {
  berechneEndzeit, baueTerminTitel, baueTerminBeschreibung,
  baueTerminAktivitaetText, formatTerminZeitpunkt, baueOnboardingIcs,
  ONBOARDING_TERMIN_DAUER_MIN,
} from '../onboarding-termin'

describe('berechneEndzeit', () => {
  it('addiert 30 Minuten als Default', () => {
    expect(berechneEndzeit('2026-07-10T12:00:00.000Z')).toBe('2026-07-10T12:30:00.000Z')
  })
  it('respektiert eine explizite Dauer', () => {
    expect(berechneEndzeit('2026-07-10T12:00:00.000Z', 45)).toBe('2026-07-10T12:45:00.000Z')
  })
  it('wirft bei ungueltigem Datum', () => {
    expect(() => berechneEndzeit('kaputt')).toThrow()
  })
})

describe('baueTerminTitel', () => {
  it('nutzt die Firma', () => { expect(baueTerminTitel('Kfz Meier')).toBe('Onboarding: Kfz Meier') })
  it('faellt bei leerer Firma auf Default zurueck', () => { expect(baueTerminTitel(null)).toBe('Partner-Onboarding') })
})

describe('baueTerminBeschreibung', () => {
  it('online mit Link', () => {
    expect(baueTerminBeschreibung({ kanal: 'online', videoLink: 'https://meet.google.com/abc' })).toContain('https://meet.google.com/abc')
  })
  it('online ohne Link', () => {
    expect(baueTerminBeschreibung({ kanal: 'online' })).toContain('folgt')
  })
  it('vor Ort mit Adresse', () => {
    expect(baueTerminBeschreibung({ kanal: 'vor_ort', treffpunktAdresse: 'Domplatz 1, 50667 Köln' })).toContain('Domplatz 1')
  })
})

describe('baueTerminAktivitaetText', () => {
  it('nennt Video-Kanal', () => {
    expect(baueTerminAktivitaetText('2026-07-10T12:00:00.000Z', 'online')).toContain('Video')
  })
  it('nennt vor-Ort-Kanal', () => {
    expect(baueTerminAktivitaetText('2026-07-10T12:00:00.000Z', 'vor_ort')).toContain('vor Ort')
  })
})

describe('formatTerminZeitpunkt', () => {
  it('formatiert deterministisch in Berlin-Zeit', () => {
    // 12:00 UTC = 14:00 Berlin (Sommerzeit)
    expect(formatTerminZeitpunkt('2026-07-10T12:00:00.000Z')).toContain('14:00')
  })
})

describe('baueOnboardingIcs', () => {
  it('erzeugt ein VEVENT mit Meet-Link als Location (online)', () => {
    const ics = baueOnboardingIcs({
      terminId: 't1', firma: 'Kfz Meier', kanal: 'online',
      startIso: '2026-07-10T12:00:00.000Z', endIso: '2026-07-10T12:30:00.000Z',
      videoLink: 'https://meet.google.com/abc', treffpunktAdresse: null,
    })
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Onboarding: Kfz Meier')
    expect(ics).toContain('DTSTART:20260710T120000Z')
    expect(ics).toContain('meet.google.com/abc')
  })
  it('nutzt die Adresse als Location (vor Ort)', () => {
    const ics = baueOnboardingIcs({
      terminId: 't2', firma: null, kanal: 'vor_ort',
      startIso: '2026-07-10T12:00:00.000Z', endIso: '2026-07-10T12:30:00.000Z',
      videoLink: null, treffpunktAdresse: 'Domplatz 1, 50667 Köln',
    })
    expect(ics).toContain('LOCATION:Domplatz 1')
  })
})

it('ONBOARDING_TERMIN_DAUER_MIN ist 30', () => { expect(ONBOARDING_TERMIN_DAUER_MIN).toBe(30) })
