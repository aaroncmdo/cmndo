import { describe, it, expect } from 'vitest'
import { sollPhaseGeskipptWerden, resolveHergangFromLead } from '../phasen-skip'

const feld = (over: Partial<{ pflicht: boolean; feld_key: string; db_target: { spalte?: string; tabelle?: string } | null }> = {}) => ({
  pflicht: true,
  feld_key: 'hergang_kunde_text',
  db_target: { spalte: 'hergang_kunde_text', tabelle: 'claims' },
  ...over,
})

describe('sollPhaseGeskipptWerden', () => {
  // Bug3-Smoke-Befund 28.07.: die felderlose sa-Phase (kunde-onboarding ord 40)
  // war nie skippbar -> phases.length===0 unerreichbar -> Fallakte-Redirect tot.
  it('skippt eine Phase ohne (audience-sichtbare) Felder — sie erhebt nichts', () => {
    expect(sollPhaseGeskipptWerden([], {})).toBe(true)
  })

  it('zeigt eine Phase, deren Pflichtfeld keinen Wert hat', () => {
    expect(sollPhaseGeskipptWerden([feld()], {})).toBe(false)
  })

  it('skippt, wenn alle Pflichtfelder via feld_key gefuellt sind', () => {
    expect(sollPhaseGeskipptWerden([feld()], { hergang_kunde_text: 'Auffahrunfall an der Ampel' })).toBe(true)
  })

  it('skippt, wenn der Wert unter db_target.spalte liegt (abweichendes feld_key-Naming)', () => {
    const f = feld({ feld_key: 'fahrzeugschein_foto', db_target: { spalte: 'kennzeichen', tabelle: '_self' } })
    expect(sollPhaseGeskipptWerden([f], { kennzeichen: 'K-AB 123' })).toBe(true)
  })

  it('zeigt eine Phase mit NUR optionalen Feldern (Bestand bleibt)', () => {
    expect(sollPhaseGeskipptWerden([feld({ pflicht: false })], {})).toBe(false)
  })

  it('zaehlt Leerstring nicht als Wert', () => {
    expect(sollPhaseGeskipptWerden([feld()], { hergang_kunde_text: '' })).toBe(false)
  })

  it('zeigt die Phase, wenn nur eines von zwei Pflichtfeldern gefuellt ist', () => {
    const felder = [feld(), feld({ feld_key: 'service_typ', db_target: { spalte: 'service_typ', tabelle: 'claims' } })]
    expect(sollPhaseGeskipptWerden(felder, { hergang_kunde_text: 'Text' })).toBe(false)
  })
})

describe('resolveHergangFromLead (convertLeadToClaim-Bridge-Kaskade)', () => {
  it('liefert unfallhergang, wenn gesetzt', () => {
    expect(resolveHergangFromLead({ unfallhergang: 'Vorfahrt missachtet' })).toBe('Vorfahrt missachtet')
  })

  it('faellt auf schadens_hergang zurueck', () => {
    expect(resolveHergangFromLead({ unfallhergang: null, schadens_hergang: 'Parkrempler' })).toBe('Parkrempler')
  })

  it('faellt zuletzt auf fahrzeugschaden_beschreibung zurueck', () => {
    expect(
      resolveHergangFromLead({ unfallhergang: '', schadens_hergang: null, fahrzeugschaden_beschreibung: 'Delle hinten links' }),
    ).toBe('Delle hinten links')
  })

  it('liefert null, wenn alle Quellen leer/whitespace sind', () => {
    expect(resolveHergangFromLead({ unfallhergang: '   ', schadens_hergang: '', fahrzeugschaden_beschreibung: null })).toBe(null)
  })

  it('liefert null fuer null/undefined-Lead', () => {
    expect(resolveHergangFromLead(null)).toBe(null)
    expect(resolveHergangFromLead(undefined)).toBe(null)
  })

  it('ignoriert Nicht-String-Werte statt zu crashen', () => {
    expect(resolveHergangFromLead({ unfallhergang: 42, schadens_hergang: 'echter Text' })).toBe('echter Text')
  })
})
