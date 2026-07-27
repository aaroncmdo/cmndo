import { describe, it, expect } from 'vitest'
import { stepIndex, DASH_SEQUENCE, visualStepDirection } from '../pulsing-route'

describe('stepIndex — gerichteter Dash-Schritt', () => {
  const N = DASH_SEQUENCE.length

  it('forward: +1 mit Wraparound am Ende', () => {
    expect(stepIndex(0, N, 'forward')).toBe(1)
    expect(stepIndex(5, N, 'forward')).toBe(6)
    expect(stepIndex(N - 1, N, 'forward')).toBe(0) // wrap
  })

  it('reverse: −1 mit Wraparound am Anfang', () => {
    expect(stepIndex(5, N, 'reverse')).toBe(4)
    expect(stepIndex(1, N, 'reverse')).toBe(0)
    expect(stepIndex(0, N, 'reverse')).toBe(N - 1) // wrap
  })

  it('forward + reverse sind zueinander invers', () => {
    for (let i = 0; i < N; i++) {
      expect(stepIndex(stepIndex(i, N, 'forward'), N, 'reverse')).toBe(i)
      expect(stepIndex(stepIndex(i, N, 'reverse'), N, 'forward')).toBe(i)
    }
  })

  it('ein voller Vorwärts-Zyklus kehrt zum Start zurück', () => {
    let s = 3
    for (let k = 0; k < N; k++) s = stepIndex(s, N, 'forward')
    expect(s).toBe(3)
  })

  it('normalisiert Out-of-range / negativen current', () => {
    expect(stepIndex(N + 2, N, 'forward')).toBe(3) // (N+2)%N = 2 → +1 = 3
    expect(stepIndex(-1, N, 'forward')).toBe(0) // -1 → N-1 → +1 wrap = 0
    expect(stepIndex(5, 0, 'forward')).toBe(0) // leere Sequenz safe
  })

  it('DASH_SEQUENCE ist nicht leer + alle Frames sind Zahlen-Arrays', () => {
    expect(N).toBeGreaterThan(4)
    for (const frame of DASH_SEQUENCE) {
      expect(Array.isArray(frame)).toBe(true)
      expect(frame.length).toBeGreaterThan(0)
      expect(frame.every((n) => typeof n === 'number' && n >= 0)).toBe(true)
    }
  })
})

describe('visualStepDirection — Mapbox-Dash-Gotcha invertiert die Richtung', () => {
  it('kehrt forward<->reverse um (damit `direction` visuell in Geometrie-Richtung fliesst)', () => {
    expect(visualStepDirection('forward')).toBe('reverse')
    expect(visualStepDirection('reverse')).toBe('forward')
  })
})
