import { describe, it, expect } from 'vitest'
import { renderVorlage } from './mail-vorlagen'

describe('renderVorlage', () => {
  it('ersetzt bekannte Merge-Felder, laesst unbekannte stehen', () => {
    expect(
      renderVorlage('Hallo {{Ansprechpartner}}, {{Firma}} — {{Termin}}', { Ansprechpartner: 'Tom', Firma: 'AH Müller' }),
    ).toBe('Hallo Tom, AH Müller — {{Termin}}')
  })
  it('laesst Text ohne Platzhalter unveraendert', () => {
    expect(renderVorlage('Ganz normaler Text.', {})).toBe('Ganz normaler Text.')
  })
})
