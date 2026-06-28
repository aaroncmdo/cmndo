import { describe, it, expect } from 'vitest'
import { computeNextOperativePhase, type OperativeSignals } from './autophase-decision'

function sig(o: Partial<OperativeSignals> = {}): OperativeSignals {
  return {
    hasSvId: false,
    hasTermin: false,
    gutachtenFertig: false,
    istKomplett: false,
    anschlussschreibenVorhanden: false,
    zahlungEingegangen: false,
    ...o,
  }
}

describe('computeNextOperativePhase', () => {
  it('ersterfassung + SV zugewiesen -> sv-zugewiesen', () => {
    expect(computeNextOperativePhase('ersterfassung', sig({ hasSvId: true }))).toBe('sv-zugewiesen')
  })
  it('ersterfassung ohne SV -> null', () => {
    expect(computeNextOperativePhase('ersterfassung', sig())).toBeNull()
  })
  it('sv-zugewiesen + Termin -> sv-termin', () => {
    expect(computeNextOperativePhase('sv-zugewiesen', sig({ hasTermin: true }))).toBe('sv-termin')
  })
  it('sv-termin + Gutachten fertig -> gutachten-eingegangen', () => {
    expect(computeNextOperativePhase('sv-termin', sig({ gutachtenFertig: true }))).toBe('gutachten-eingegangen')
  })
  it('besichtigung + Gutachten fertig -> gutachten-eingegangen', () => {
    expect(computeNextOperativePhase('besichtigung', sig({ gutachtenFertig: true }))).toBe('gutachten-eingegangen')
  })

  // KERN-FIX: gutachten-eingegangen -> filmcheck nur fuer komplett (war zirkulaer ueber
  // filmcheck_ok -> kein Claim erreichte je filmcheck). KB macht danach saveFilmcheck.
  it('gutachten-eingegangen + komplett -> filmcheck', () => {
    expect(computeNextOperativePhase('gutachten-eingegangen', sig({ istKomplett: true }))).toBe('filmcheck')
  })
  it('gutachten-eingegangen + nur_gutachter -> null (keine Kanzlei-Strecke)', () => {
    expect(computeNextOperativePhase('gutachten-eingegangen', sig({ istKomplett: false }))).toBeNull()
  })

  // HALB-AUTOMATIK-GRENZE: autoPhase advanced NICHT filmcheck -> kanzlei-uebergeben.
  // Den Handoff (Status + Kanzlei-Mails + Anschlussschreiben-Task) macht KB via saveFilmcheck.
  it('filmcheck -> null (KB macht den Handoff manuell, kein Auto-Sprung)', () => {
    expect(computeNextOperativePhase('filmcheck', sig({ istKomplett: true, anschlussschreibenVorhanden: true }))).toBeNull()
  })

  it('kanzlei-uebergeben + Anschlussschreiben -> anschlussschreiben', () => {
    expect(computeNextOperativePhase('kanzlei-uebergeben', sig({ anschlussschreibenVorhanden: true }))).toBe('anschlussschreiben')
  })
  it('kanzlei-uebergeben ohne Anschlussschreiben -> null', () => {
    expect(computeNextOperativePhase('kanzlei-uebergeben', sig())).toBeNull()
  })
  it('anschlussschreiben + Zahlung -> abgeschlossen', () => {
    expect(computeNextOperativePhase('anschlussschreiben', sig({ zahlungEingegangen: true }))).toBe('abgeschlossen')
  })
  it('regulierung + Zahlung -> abgeschlossen', () => {
    expect(computeNextOperativePhase('regulierung', sig({ zahlungEingegangen: true }))).toBe('abgeschlossen')
  })

  it('terminale/unbekannte Status -> null', () => {
    expect(computeNextOperativePhase('abgeschlossen', sig({ zahlungEingegangen: true }))).toBeNull()
    expect(computeNextOperativePhase('storniert', sig())).toBeNull()
    expect(computeNextOperativePhase('irgendwas', sig({ hasSvId: true, gutachtenFertig: true }))).toBeNull()
  })

  it('feuert nur den naechsten Schritt, nicht mehrere auf einmal', () => {
    // ersterfassung mit ALLEN Signalen -> trotzdem nur sv-zugewiesen (ein Schritt pro Call)
    const all = sig({ hasSvId: true, hasTermin: true, gutachtenFertig: true, istKomplett: true, zahlungEingegangen: true })
    expect(computeNextOperativePhase('ersterfassung', all)).toBe('sv-zugewiesen')
  })
})
