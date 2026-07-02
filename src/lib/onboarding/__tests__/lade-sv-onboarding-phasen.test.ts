import { describe, it, expect } from 'vitest'
import { sammlePrefillSpalten } from '../lade-sv-onboarding-phasen'

describe('sammlePrefillSpalten (DB-getriebener Prefill)', () => {
  it('sammelt db_target-Spalten je echte Tabelle', () => {
    const felder = [
      { db_target: { tabelle: 'sachverstaendige', spalte: 'standort_adresse' } },
      { db_target: { tabelle: 'sachverstaendige', spalte: 'firmenname' } },
      { db_target: { tabelle: 'profiles', spalte: 'avatar_url' } },
    ]
    const res = sammlePrefillSpalten(felder)
    expect([...res.sachverstaendige].sort()).toEqual(['firmenname', 'standort_adresse'])
    expect(res.profiles).toEqual(['avatar_url'])
  })

  it('ignoriert Sentinel-Tabellen (_self/_finalize/_termin) + Felder ohne Spalte', () => {
    const felder = [
      { db_target: { tabelle: '_finalize', spalte: 'unterschrift' } },
      { db_target: { tabelle: '_self', spalte: 'kalender_connected' } },
      { db_target: { tabelle: '_termin', spalte: 'wunschtermin' } },
      { db_target: { tabelle: 'sachverstaendige' } }, // keine spalte
      { db_target: null },
      { db_target: { tabelle: 'profiles', spalte: 'profilbeschreibung' } },
    ]
    const res = sammlePrefillSpalten(felder)
    expect(res.sachverstaendige).toEqual([])
    expect(res.profiles).toEqual(['profilbeschreibung'])
  })

  it('dedupliziert doppelte Spalten', () => {
    const felder = [
      { db_target: { tabelle: 'sachverstaendige', spalte: 'standort_adresse' } },
      { db_target: { tabelle: 'sachverstaendige', spalte: 'standort_adresse' } },
    ]
    expect(sammlePrefillSpalten(felder).sachverstaendige).toEqual(['standort_adresse'])
  })

  it('leere Eingabe -> leere Listen', () => {
    expect(sammlePrefillSpalten([])).toEqual({ sachverstaendige: [], profiles: [] })
  })
})
