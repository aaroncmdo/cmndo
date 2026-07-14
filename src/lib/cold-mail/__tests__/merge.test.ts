import { describe, it, expect } from 'vitest'
import { buildMergeVars, renderMerge } from '../merge'

describe('renderMerge', () => {
  it('ersetzt bekannte Merge-Vars und lässt unbekannte stehen', () => {
    const vars = { Ansprechpartner: 'Frau Meier', Firma: 'Autohaus Meier', Ort: 'Berlin', Vorname: 'Anna' }
    expect(renderMerge('Hallo {Ansprechpartner} von {Firma} in {Ort}. {Unbekannt}', vars))
      .toBe('Hallo Frau Meier von Autohaus Meier in Berlin. {Unbekannt}')
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
