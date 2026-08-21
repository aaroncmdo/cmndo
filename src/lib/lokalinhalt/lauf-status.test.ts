import { describe, expect, it } from 'vitest'
import { laufGeglueckt } from './lauf-status'

// ---------------------------------------------------------------------------
// 20.08.2026, real auf prod: Das Anthropic-Guthaben war aufgebraucht. Der
// Cron-Endpunkt antwortete trotzdem
//
//   {"ok":true,"versucht":1,"veroeffentlicht":[],"fehler":[{"grund":"… credit
//    balance is too low …"}]}
//
// …also HTTP 200, und `cron-call.sh` schrieb brav "ok http=200" ins Log. Der
// Lauf waere ab da JEDE NACHT gelaufen, haette Erfolg gemeldet und nichts
// erzeugt — dasselbe Muster, das zwei andere prod-Crons ueber 8.600-mal
// produziert haben, bevor es jemand bemerkte.
//
// ⚠ Der Fehlertext war da (nicht durch eine Konstante ersetzt — die #5354-Lehre
// hat gehalten). Er stand nur an einer Stelle, die niemand liest.
// ---------------------------------------------------------------------------
describe('laufGeglueckt', () => {
  const lauf = (versucht: number, veroeffentlicht: string[], imReview: string[] = []) => ({
    versucht,
    veroeffentlicht,
    imReview: imReview.map((slug) => ({ slug, grund: 'Gate' })),
  })

  it('meldet FEHLER, wenn alles gescheitert ist (der Guthaben-Fall)', () => {
    expect(laufGeglueckt(lauf(1, []))).toBe(false)
    expect(laufGeglueckt(lauf(2, []))).toBe(false)
  })

  it('meldet Erfolg, sobald etwas abgelegt wurde', () => {
    expect(laufGeglueckt(lauf(2, ['leipzig']))).toBe(true)
  })

  it('wertet einen Review-Eintrag als Erfolg — der Lauf hat gearbeitet', () => {
    // Das Gate hat gegriffen und der Entwurf liegt zur Durchsicht. Das ist
    // Normalbetrieb, kein Ausfall: die KI hat geantwortet, die Kette lief.
    expect(laufGeglueckt(lauf(1, [], ['bochum']))).toBe(true)
  })

  it('faerbt einen Teilausfall NICHT rot', () => {
    // Eine von zwei Staedten haengt am Substanz-Gate — passiert regelmaessig.
    // Waere das ein Fehler, wuerde der Cron-Log rauschen und niemand sieht mehr
    // den echten Ausfall darin.
    expect(laufGeglueckt(lauf(2, ['leipzig']))).toBe(true)
  })

  it('ist ein leerer Lauf kein Fehler', () => {
    // `versucht === 0` heisst: die Warteschlange ist leer, alle 173 Staedte
    // haben Inhalt. Das ist das Ziel, nicht ein Problem.
    expect(laufGeglueckt(lauf(0, []))).toBe(true)
  })
})
