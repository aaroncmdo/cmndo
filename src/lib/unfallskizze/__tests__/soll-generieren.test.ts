import { describe, it, expect } from 'vitest'
import { sollSkizzeGenerieren, MIN_HERGANG_LAENGE } from '../soll-generieren'

const HERGANG = 'Der Gegner ist mir an der Kreuzung hinten reingefahren.'

describe('sollSkizzeGenerieren', () => {
  it('generiert bei substanziellem Hergang ohne vorhandene Skizze', () => {
    expect(sollSkizzeGenerieren({ hergangImSave: HERGANG, vorhandeneSkizze: null })).toBe(true)
  })

  // Sonst liefe bei JEDEM Wizard-Schritt ein Claude-Call, obwohl sich nichts geaendert hat.
  it('generiert NICHT, wenn der Hergang in diesem Save gar nicht vorkam', () => {
    expect(sollSkizzeGenerieren({ hergangImSave: undefined, vorhandeneSkizze: null })).toBe(false)
  })

  // Eine vorhandene Skizze kann bereits freigegeben/abgelehnt sein — stilles
  // Ueberschreiben wuerde diese Dispatch-Entscheidung verwerfen.
  it('generiert NICHT, wenn schon eine Skizze existiert', () => {
    expect(sollSkizzeGenerieren({ hergangImSave: HERGANG, vorhandeneSkizze: '<svg/>' })).toBe(false)
  })

  it('behandelt eine leere Skizze wie keine', () => {
    expect(sollSkizzeGenerieren({ hergangImSave: HERGANG, vorhandeneSkizze: '   ' })).toBe(true)
  })

  it.each(['', '   ', 'Unfall', 'k.A.'])('generiert NICHT bei zu duennem Text (%s)', (text) => {
    expect(sollSkizzeGenerieren({ hergangImSave: text, vorhandeneSkizze: null })).toBe(false)
  })

  it('respektiert die Mindestlaenge exakt', () => {
    const knappDrunter = 'x'.repeat(MIN_HERGANG_LAENGE - 1)
    const genau = 'x'.repeat(MIN_HERGANG_LAENGE)
    expect(sollSkizzeGenerieren({ hergangImSave: knappDrunter, vorhandeneSkizze: null })).toBe(false)
    expect(sollSkizzeGenerieren({ hergangImSave: genau, vorhandeneSkizze: null })).toBe(true)
  })

  it('zaehlt getrimmt — Leerraum macht keinen Hergang', () => {
    const nurLeerraum = '   ' + 'x'.repeat(5) + '          '
    expect(sollSkizzeGenerieren({ hergangImSave: nurLeerraum, vorhandeneSkizze: null })).toBe(false)
  })

  it.each([null, 42, {}, []])('ignoriert Nicht-Strings (%s)', (wert) => {
    expect(sollSkizzeGenerieren({ hergangImSave: wert, vorhandeneSkizze: null })).toBe(false)
  })
})
