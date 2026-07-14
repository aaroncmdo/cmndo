import { describe, it, expect } from 'vitest'
import {
  bedingungErfuellt,
  planeNaechstenSchritt,
  zustandNachSend,
  ersteFaelligkeit,
  type ColdMailStep,
} from '../advance'

const step = (position: number, bedingung: ColdMailStep['bedingung'], delay = 0): ColdMailStep => ({
  id: `step-${position}`,
  position,
  vorlage_id: `vorlage-${position}`,
  delay_tage: delay,
  bedingung,
})

const JETZT = new Date('2026-07-14T12:00:00.000Z')
const TAG = 86_400_000

describe('bedingungErfuellt', () => {
  it('immer -> immer true', () => {
    expect(bedingungErfuellt('immer', null, false)).toBe(true)
    expect(bedingungErfuellt('immer', { status: 'geoeffnet' }, true)).toBe(true)
  })

  it('wenn_geoeffnet -> nur bei geoeffnet/geklickt', () => {
    expect(bedingungErfuellt('wenn_geoeffnet', { status: 'geoeffnet' }, false)).toBe(true)
    expect(bedingungErfuellt('wenn_geoeffnet', { status: 'geklickt' }, false)).toBe(true)
    expect(bedingungErfuellt('wenn_geoeffnet', { status: 'gesendet' }, false)).toBe(false)
    // Ohne vorigen Send kann nichts geoeffnet sein -> Step greift nicht.
    expect(bedingungErfuellt('wenn_geoeffnet', null, false)).toBe(false)
  })

  it('wenn_nicht_geoeffnet -> Gegenstueck (inkl. "noch nichts gesendet")', () => {
    expect(bedingungErfuellt('wenn_nicht_geoeffnet', { status: 'gesendet' }, false)).toBe(true)
    expect(bedingungErfuellt('wenn_nicht_geoeffnet', { status: 'zugestellt' }, false)).toBe(true)
    expect(bedingungErfuellt('wenn_nicht_geoeffnet', { status: 'geoeffnet' }, false)).toBe(false)
    expect(bedingungErfuellt('wenn_nicht_geoeffnet', null, false)).toBe(true)
  })

  it('wenn_keine_antwort -> stoppt sobald geantwortet', () => {
    expect(bedingungErfuellt('wenn_keine_antwort', { status: 'gesendet' }, false)).toBe(true)
    expect(bedingungErfuellt('wenn_keine_antwort', { status: 'gesendet' }, true)).toBe(false)
  })
})

describe('planeNaechstenSchritt', () => {
  it('erster Step einer frischen Enrollment (aktuellerStep=0)', () => {
    const plan = planeNaechstenSchritt({
      aktuellerStep: 0,
      steps: [step(1, 'immer'), step(2, 'immer', 3)],
      letzterSend: null,
      geantwortet: false,
    })
    expect(plan).toEqual({ typ: 'senden', step: step(1, 'immer') })
  })

  it('ueberspringt Steps, deren Bedingung nicht greift (Kaskade)', () => {
    // Vorige Mail wurde geoeffnet -> der "nur wenn NICHT geoeffnet"-Step faellt weg,
    // der naechste passende (wenn_geoeffnet) wird gesendet.
    const plan = planeNaechstenSchritt({
      aktuellerStep: 1,
      steps: [step(1, 'immer'), step(2, 'wenn_nicht_geoeffnet'), step(3, 'wenn_geoeffnet')],
      letzterSend: { status: 'geoeffnet' },
      geantwortet: false,
    })
    expect(plan).toEqual({ typ: 'senden', step: step(3, 'wenn_geoeffnet') })
  })

  it('fertig, wenn kein Step mehr passt', () => {
    const plan = planeNaechstenSchritt({
      aktuellerStep: 1,
      steps: [step(1, 'immer'), step(2, 'wenn_geoeffnet')],
      letzterSend: { status: 'gesendet' }, // nicht geoeffnet -> Step 2 faellt weg
      geantwortet: false,
    })
    expect(plan).toEqual({ typ: 'fertig' })
  })

  it('fertig, wenn es keine Steps mehr gibt', () => {
    const plan = planeNaechstenSchritt({
      aktuellerStep: 2,
      steps: [step(1, 'immer'), step(2, 'immer')],
      letzterSend: { status: 'gesendet' },
      geantwortet: false,
    })
    expect(plan).toEqual({ typ: 'fertig' })
  })

  it('geantwortet stoppt die Follow-ups', () => {
    const plan = planeNaechstenSchritt({
      aktuellerStep: 1,
      steps: [step(1, 'immer'), step(2, 'wenn_keine_antwort')],
      letzterSend: { status: 'gesendet' },
      geantwortet: true,
    })
    expect(plan).toEqual({ typ: 'fertig' })
  })
})

describe('zustandNachSend', () => {
  it('setzt next_send_at aus dem DELAY DES NAECHSTEN Steps', () => {
    const s = zustandNachSend([step(1, 'immer'), step(2, 'immer', 3)], 1, JETZT)
    expect(s).toEqual({
      aktueller_step: 1,
      next_send_at: new Date(JETZT.getTime() + 3 * TAG),
      status: 'aktiv',
    })
  })

  it('war es der letzte Step -> fertig, kein next_send_at', () => {
    const s = zustandNachSend([step(1, 'immer'), step(2, 'immer', 3)], 2, JETZT)
    expect(s).toEqual({ aktueller_step: 2, next_send_at: null, status: 'fertig' })
  })
})

describe('ersteFaelligkeit', () => {
  it('Enrollment startet nach dem Delay des ersten Steps', () => {
    expect(ersteFaelligkeit([step(1, 'immer', 2), step(2, 'immer')], JETZT)).toEqual(
      new Date(JETZT.getTime() + 2 * TAG),
    )
  })

  it('Delay 0 -> sofort faellig', () => {
    expect(ersteFaelligkeit([step(1, 'immer', 0)], JETZT)).toEqual(JETZT)
  })

  it('Sequenz ohne Steps -> nichts faellig', () => {
    expect(ersteFaelligkeit([], JETZT)).toBeNull()
  })
})
