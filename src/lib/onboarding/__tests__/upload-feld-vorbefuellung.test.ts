import { describe, it, expect } from 'vitest'
import { sollPhaseGeskipptWerden, type SkipFeld } from '../phasen-skip'

/**
 * Aaron 28.08.2026: *„ich konnte die Daten nicht bestaetigen, ausserdem wurde ich nochmal
 * nach dem Fahrzeugschein gefragt obwohl ich den schon hochgeladen hatte."*
 *
 * Die Kette (beide Symptome, EINE Ursache):
 *   `fahrzeugschein_foto` ist `pflicht: true`, hat aber KEINEN Speicherort
 *   (`db_target.tabelle = '_self'`). Der Save-Router ueberspringt `_`-Ziele, die
 *   Allowlist den Typ `zb1-upload`. Der Wert lebt nur im lokalen React-State.
 *   -> Nach dem Reload leer -> Phase nicht geskippt (erneute Frage)
 *                           -> validatePhase blockiert („Daten bestaetigen" geht nicht)
 *
 * Der Ersatz-Lookup ueber `db_target.spalte = 'kennzeichen'` rettet das NICHT zuverlaessig:
 * `claims` hat gar keine Spalte `kennzeichen`, und in `vehicles` heisst sie
 * `kennzeichen_aktuell`. Nur ueber den Lead trifft der Lookup.
 *
 * Der Fix setzt deshalb im Loader `prefilled['fahrzeugschein_foto']` direkt aus dem
 * vorhandenen DOKUMENT — der Upload ist sein eigener Nachweis.
 */

const zb1Feld: SkipFeld = {
  pflicht: true,
  feld_key: 'fahrzeugschein_foto',
  db_target: { tabelle: '_self', spalte: 'kennzeichen' },
}

describe('der gemeldete Fehler', () => {
  it('OHNE Vorbefuellung wird die Phase NICHT geskippt — der Kunde wird erneut gefragt', () => {
    // Genau Aarons Lage: Dokument liegt vor, aber im prefilled steht nichts davon.
    const prefilled = { doc_typ_fahrzeugschein: true }
    expect(sollPhaseGeskipptWerden([zb1Feld], prefilled)).toBe(false)
  })

  it('MIT Vorbefuellung wird sie geskippt', () => {
    const prefilled = { doc_typ_fahrzeugschein: true, fahrzeugschein_foto: true }
    expect(sollPhaseGeskipptWerden([zb1Feld], prefilled)).toBe(true)
  })
})

describe('warum der Ersatz-Lookup ueber db_target.spalte nicht genuegt', () => {
  it('greift nur, wenn ausgerechnet `kennzeichen` gesetzt ist', () => {
    expect(sollPhaseGeskipptWerden([zb1Feld], { kennzeichen: 'K-AB 123' })).toBe(true)
  })

  it('`kennzeichen_aktuell` (so heisst es in vehicles) hilft NICHT', () => {
    // Der Lookup kennt nur den exakten Namen aus db_target.spalte.
    expect(sollPhaseGeskipptWerden([zb1Feld], { kennzeichen_aktuell: 'K-AB 123' })).toBe(false)
  })
})

describe('Nachbarwirkung — nichts anderes darf sich aendern', () => {
  it('ein leeres Pflichtfeld haelt die Phase weiterhin offen', () => {
    const pflicht: SkipFeld = { pflicht: true, feld_key: 'hergang_kunde_text', db_target: null }
    expect(sollPhaseGeskipptWerden([pflicht, zb1Feld], { fahrzeugschein_foto: true })).toBe(false)
  })

  it('eine Phase mit nur optionalen Feldern bleibt sichtbar', () => {
    const optional: SkipFeld = { pflicht: false, feld_key: 'zeugen', db_target: null }
    expect(sollPhaseGeskipptWerden([optional], {})).toBe(false)
  })

  it('leerer String zaehlt NICHT als gefuellt', () => {
    expect(sollPhaseGeskipptWerden([zb1Feld], { fahrzeugschein_foto: '' })).toBe(false)
  })
})
