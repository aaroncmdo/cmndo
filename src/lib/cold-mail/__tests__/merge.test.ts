import { describe, it, expect } from 'vitest'
import { buildMergeVars, renderMerge } from '../merge'

describe('renderMerge', () => {
  const vars = { Ansprechpartner: 'Frau Meier', Firma: 'Autohaus Meier', Ort: 'Berlin', Vorname: 'Anna' }

  it('ersetzt bekannte Merge-Vars und lässt unbekannte stehen', () => {
    expect(renderMerge('Hallo {{Ansprechpartner}} von {{Firma}} in {{Ort}}. {{Unbekannt}}', vars))
      .toBe('Hallo Frau Meier von Autohaus Meier in Berlin. {{Unbekannt}}')
  })

  // Konvention: der Vertrieb-Drawer nutzt seit jeher {{Feld}} (renderVorlage,
  // vertrieb_mail_vorlagen auf prod). Eine EINFACHE Klammer ist KEIN Platzhalter
  // und muss woertlich stehen bleiben — sonst wuerde "{Firma}" in einer Cold-Mail
  // an einen echten Betrieb still ersetzt, obwohl der Admin das nicht gemeint hat.
  it('laesst einfache Klammern unangetastet (nur {{…}} ist ein Platzhalter)', () => {
    expect(renderMerge('Rabatt {Firma} und {{Firma}}', vars)).toBe('Rabatt {Firma} und Autohaus Meier')
  })
})

describe('buildMergeVars', () => {
  it('baut vollen Namen und Fallbacks', () => {
    expect(buildMergeVars({ ansprechpartner_vorname: 'Anna', ansprechpartner_nachname: 'Meier', firma: 'Autohaus', ort: 'Berlin' }))
      .toEqual({ Ansprechpartner: 'Anna Meier', Firma: 'Autohaus', Ort: 'Berlin', Vorname: 'Anna' })
  })
  it('nutzt Fallbacks bei fehlenden Feldern', () => {
    expect(buildMergeVars({ ansprechpartner_vorname: null, ansprechpartner_nachname: null, firma: null, ort: null }))
      .toEqual({ Ansprechpartner: '', Firma: 'Ihr Unternehmen', Ort: '', Vorname: '' })
  })
})
