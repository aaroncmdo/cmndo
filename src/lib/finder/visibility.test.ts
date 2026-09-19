import { describe, it, expect } from 'vitest'
import { deriveFinderVisibility } from './visibility'

// Vollstaendige Eingabe: genau die Bedingungen, die ladeAktiveSVs und die anon-Policy
// `sachverstaendige__b1sel_an` seit dem 19.09.2026 pruefen — ohne `verifiziert`.
const sichtbar = {
  ist_aktiv: true,
  portal_zugang_freigeschaltet: true,
  gesperrt_seit: null,
  geloescht_am: null,
  hatIsochrone: true,
  standort_lat: 51.0,
  standort_lng: 7.0,
  istTestaccount: false,
}

describe('deriveFinderVisibility', () => {
  it('alle Gates erfuellt -> sichtbar', () => {
    expect(deriveFinderVisibility(sichtbar)).toEqual({ visible: true })
  })

  // ENTSCHEIDUNG 2026-09-19 (Aaron): "Die Verifizierung ist ja keine notwendige Sache
  // fuer den Finder." Gemessen auf prod: 13 freigegebene Gutachter waren unsichtbar,
  // alle allein wegen dieses Flags. Es steuert weiterhin das Vertrauens-Siegel in der
  // Kunden-Fallakte und das Whitelabel-Gate — nur nicht mehr die Sichtbarkeit.
  it('ohne Verifizierung trotzdem sichtbar [Entscheidung 19.09.]', () => {
    expect(deriveFinderVisibility({ ...sichtbar, verifiziert: false })).toEqual({ visible: true })
    expect(deriveFinderVisibility({ ...sichtbar, verifiziert: null })).toEqual({ visible: true })
  })

  it('nicht aktiv', () => {
    expect(deriveFinderVisibility({ ...sichtbar, ist_aktiv: false })).toEqual({
      visible: false,
      reason: 'nicht-aktiv',
    })
  })

  // Die vier folgenden Gates standen seit jeher in der echten Finder-Query, fehlten aber
  // in diesem Spiegel — ein Badge konnte "sichtbar" melden, obwohl der Gutachter gesperrt war.
  it('kein Portal-Zugang (nicht bezahlt, nicht vom Admin freigegeben)', () => {
    expect(deriveFinderVisibility({ ...sichtbar, portal_zugang_freigeschaltet: false })).toEqual({
      visible: false,
      reason: 'kein-portal-zugang',
    })
    expect(deriveFinderVisibility({ ...sichtbar, portal_zugang_freigeschaltet: null })).toEqual({
      visible: false,
      reason: 'kein-portal-zugang',
    })
  })

  it('vom Admin gesperrt', () => {
    expect(deriveFinderVisibility({ ...sichtbar, gesperrt_seit: '2026-09-01T00:00:00Z' })).toEqual({
      visible: false,
      reason: 'gesperrt',
    })
  })

  it('geloescht', () => {
    expect(deriveFinderVisibility({ ...sichtbar, geloescht_am: '2026-09-01T00:00:00Z' })).toEqual({
      visible: false,
      reason: 'geloescht',
    })
  })

  it('keine Isochrone berechnet', () => {
    expect(deriveFinderVisibility({ ...sichtbar, hatIsochrone: false })).toEqual({
      visible: false,
      reason: 'keine-isochrone',
    })
  })

  it('kein Standort', () => {
    expect(deriveFinderVisibility({ ...sichtbar, standort_lat: null })).toEqual({
      visible: false,
      reason: 'kein-standort',
    })
  })

  it('als Test-/Demo-Account markiert (ist_testaccount=true) wird gefiltert', () => {
    expect(deriveFinderVisibility({ ...sichtbar, istTestaccount: true }).reason).toBe('test-account')
    expect(deriveFinderVisibility({ ...sichtbar, istTestaccount: false }).visible).toBe(true)
    expect(deriveFinderVisibility({ ...sichtbar, istTestaccount: null }).visible).toBe(true)
  })

  it('Prioritaet: erster fehlschlagender Gate gewinnt (aktiv vor Portal-Zugang)', () => {
    expect(
      deriveFinderVisibility({ ...sichtbar, ist_aktiv: false, portal_zugang_freigeschaltet: false })
        .reason,
    ).toBe('nicht-aktiv')
  })
})
