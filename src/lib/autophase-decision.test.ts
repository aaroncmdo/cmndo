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
    vsReaktionTyp: null,
    regulierungVorhanden: false,
    klageVorhanden: false,
    abgeschlossenVorhanden: false,
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
  // --- Kanzlei-Branches (KB-Fakt-getrieben; alle Ziele gueltig in FALL_STATUS_TRANSITIONS) ---
  it('anschlussschreiben + VS abgelehnt -> vs-abgelehnt', () => {
    expect(computeNextOperativePhase('anschlussschreiben', sig({ vsReaktionTyp: 'abgelehnt' }))).toBe('vs-abgelehnt')
  })
  it('anschlussschreiben + VS gekuerzt -> vs-kuerzt', () => {
    expect(computeNextOperativePhase('anschlussschreiben', sig({ vsReaktionTyp: 'gekuerzt' }))).toBe('vs-kuerzt')
  })
  it('anschlussschreiben + VS voll -> regulierung-laeuft', () => {
    expect(computeNextOperativePhase('anschlussschreiben', sig({ vsReaktionTyp: 'voll' }))).toBe('regulierung-laeuft')
  })
  it('anschlussschreiben + Regulierung -> regulierung-laeuft', () => {
    expect(computeNextOperativePhase('anschlussschreiben', sig({ regulierungVorhanden: true }))).toBe('regulierung-laeuft')
  })
  it('anschlussschreiben + Klage hat Vorrang -> klage', () => {
    expect(computeNextOperativePhase('anschlussschreiben', sig({ klageVorhanden: true, vsReaktionTyp: 'gekuerzt' }))).toBe('klage')
  })
  it('anschlussschreiben ohne VS-Reaktion -> null', () => {
    expect(computeNextOperativePhase('anschlussschreiben', sig())).toBeNull()
  })
  it('regulierung-laeuft + Zahlung -> zahlung-eingegangen', () => {
    expect(computeNextOperativePhase('regulierung-laeuft', sig({ zahlungEingegangen: true }))).toBe('zahlung-eingegangen')
  })
  it('regulierung-laeuft + Klage -> klage', () => {
    expect(computeNextOperativePhase('regulierung-laeuft', sig({ klageVorhanden: true }))).toBe('klage')
  })
  it('vs-kuerzt + Regulierung -> regulierung-laeuft', () => {
    expect(computeNextOperativePhase('vs-kuerzt', sig({ regulierungVorhanden: true }))).toBe('regulierung-laeuft')
  })
  it('vs-kuerzt + Klage -> klage', () => {
    expect(computeNextOperativePhase('vs-kuerzt', sig({ klageVorhanden: true }))).toBe('klage')
  })
  it('vs-abgelehnt + Klage -> klage', () => {
    expect(computeNextOperativePhase('vs-abgelehnt', sig({ klageVorhanden: true }))).toBe('klage')
  })
  it('zahlung-eingegangen + Abschluss -> abgeschlossen', () => {
    expect(computeNextOperativePhase('zahlung-eingegangen', sig({ abgeschlossenVorhanden: true }))).toBe('abgeschlossen')
  })
  it('zahlung-eingegangen ohne Abschluss -> null (KB schliesst explizit)', () => {
    expect(computeNextOperativePhase('zahlung-eingegangen', sig())).toBeNull()
  })
  it('klage + Abschluss -> abgeschlossen', () => {
    expect(computeNextOperativePhase('klage', sig({ abgeschlossenVorhanden: true }))).toBe('abgeschlossen')
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

  it('Kaskade Kanzlei voll-Pfad: kanzlei-uebergeben -> anschlussschreiben -> regulierung-laeuft -> zahlung-eingegangen -> abgeschlossen', () => {
    const s = sig({ anschlussschreibenVorhanden: true, vsReaktionTyp: 'voll', regulierungVorhanden: true, zahlungEingegangen: true, abgeschlossenVorhanden: true })
    expect(kaskade('kanzlei-uebergeben', s)).toEqual(['anschlussschreiben', 'regulierung-laeuft', 'zahlung-eingegangen', 'abgeschlossen'])
  })
  it('Kaskade Kanzlei Kuerzung+Klage: kanzlei-uebergeben -> anschlussschreiben -> klage -> abgeschlossen (Klage-Vorrang)', () => {
    const s = sig({ anschlussschreibenVorhanden: true, vsReaktionTyp: 'gekuerzt', klageVorhanden: true, abgeschlossenVorhanden: true })
    expect(kaskade('kanzlei-uebergeben', s)).toEqual(['anschlussschreiben', 'klage', 'abgeschlossen'])
  })
})
