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
    // P4-Gate: Default true = Normalfall (Claim am SA-Signing geboren) — bestehende
    // Faelle treffen das inerte Verhalten; nur der SV-Sofort-Claim setzt false.
    kundeBestaetigt: true,
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
  // sv-termin -> gutachten-eingegangen ist KEIN gueltiger Direkt-Uebergang (FALL_STATUS_TRANSITIONS).
  // Aufholen ueber begutachtung-laeuft; checkFallAutoPhase cascadet im Loop weiter.
  it('sv-termin + Gutachten fertig -> begutachtung-laeuft (gueltiger Zwischenschritt)', () => {
    expect(computeNextOperativePhase('sv-termin', sig({ gutachtenFertig: true }))).toBe('begutachtung-laeuft')
  })
  it('besichtigung + Gutachten fertig -> gutachten-eingegangen', () => {
    expect(computeNextOperativePhase('besichtigung', sig({ gutachtenFertig: true }))).toBe('gutachten-eingegangen')
  })
  it('begutachtung-laeuft + Gutachten fertig -> gutachten-eingegangen', () => {
    expect(computeNextOperativePhase('begutachtung-laeuft', sig({ gutachtenFertig: true }))).toBe('gutachten-eingegangen')
  })

  // KERN-FIX: gutachten-eingegangen -> filmcheck nur fuer komplett (war zirkulaer ueber
  // filmcheck_ok -> kein Claim erreichte je filmcheck). KB macht danach saveFilmcheck.
  it('gutachten-eingegangen + komplett -> filmcheck', () => {
    expect(computeNextOperativePhase('gutachten-eingegangen', sig({ istKomplett: true }))).toBe('filmcheck')
  })

  it('P4: gutachten-eingegangen -> filmcheck NUR wenn kundeBestaetigt (SV-Sofort-Claim bleibt stehen)', () => {
    expect(
      computeNextOperativePhase('gutachten-eingegangen', sig({ istKomplett: true, kundeBestaetigt: true })),
    ).toBe('filmcheck')
    expect(
      computeNextOperativePhase('gutachten-eingegangen', sig({ istKomplett: true, kundeBestaetigt: false })),
    ).toBeNull()
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

  // B4-slice-1b (Status-Achsen-Konsolidierung): endzustand schreibt die zwei NICHT-terminalen
  // Outcomes jetzt in operative_status. Sie stehen operativ an derselben Stelle wie 'regulierung'
  // (vorher trug der Cursor dort 'regulierung') -> selbe Auto-Advance-Regel, sonst faellt der
  // Claim in `default: null` = Auto-Advance-Engine steht fuer ihn still.
  it('B4-slice-1b: in_kommunikation_vs + Zahlung -> abgeschlossen (wie regulierung)', () => {
    expect(computeNextOperativePhase('in_kommunikation_vs', sig({ zahlungEingegangen: true }))).toBe('abgeschlossen')
    expect(computeNextOperativePhase('in_kommunikation_vs', sig())).toBeNull()
  })
  it('B4-slice-1b: abgelehnt (einfach, nachforderbar) + Zahlung -> abgeschlossen', () => {
    expect(computeNextOperativePhase('abgelehnt', sig({ zahlungEingegangen: true }))).toBe('abgeschlossen')
    expect(computeNextOperativePhase('abgelehnt', sig())).toBeNull()
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

  // Kaskaden-Simulation (= der Loop in checkFallAutoPhase): wendet die Decision wiederholt an.
  // Beweist (a) nur GUELTIGE Uebergaenge, (b) Terminierung, (c) Stopp an der Halb-Automatik-Grenze.
  function kaskade(start: string, s: OperativeSignals): string[] {
    const seq: string[] = []
    let cur = start
    for (let i = 0; i < 12; i++) {
      const next = computeNextOperativePhase(cur, s)
      if (!next || next === cur) break
      seq.push(next)
      cur = next
    }
    return seq
  }

  it('Kaskade sv-termin komplett -> begutachtung-laeuft -> gutachten-eingegangen -> filmcheck (STOPP, auch mit Zahlung)', () => {
    // zahlungEingegangen bewusst true: beweist, dass die Kaskade NICHT ueber filmcheck
    // hinaus zu abgeschlossen springt (Halb-Automatik-Grenze, KB macht den Handoff).
    expect(kaskade('sv-termin', sig({ gutachtenFertig: true, istKomplett: true, zahlungEingegangen: true })))
      .toEqual(['begutachtung-laeuft', 'gutachten-eingegangen', 'filmcheck'])
  })
  it('Kaskade nur_gutachter stoppt bei gutachten-eingegangen (keine Kanzlei-Strecke)', () => {
    expect(kaskade('sv-termin', sig({ gutachtenFertig: true, istKomplett: false })))
      .toEqual(['begutachtung-laeuft', 'gutachten-eingegangen'])
  })
})
