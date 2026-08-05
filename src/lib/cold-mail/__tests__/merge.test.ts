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
  const werkstatt = {
    ansprechpartner_vorname: 'Anna',
    ansprechpartner_nachname: 'Meier',
    ansprechpartner_position: 'Geschäftsführerin',
    firma: 'Autohaus',
    ort: 'Berlin',
    rolle: 'werkstatt',
  }

  it('baut die Datenvariablen inkl. Nachname/Position', () => {
    const v = buildMergeVars(werkstatt)
    expect(v.Ansprechpartner).toBe('Anna Meier')
    expect(v.Vorname).toBe('Anna')
    expect(v.Nachname).toBe('Meier')
    expect(v.Position).toBe('Geschäftsführerin')
    expect(v.Firma).toBe('Autohaus')
    expect(v.Ort).toBe('Berlin')
  })

  it('loest die Aktions-Tokens rollenabhaengig mit auf', () => {
    const v = buildMergeVars(werkstatt)
    expect(v.Registrierungslink).toContain('/werkstatt/registrieren')
    expect(v.Beratungslink).toContain('beratung-anfragen')
  })

  it('nutzt Fallbacks bei fehlenden Feldern', () => {
    const v = buildMergeVars({
      ansprechpartner_vorname: null, ansprechpartner_nachname: null,
      ansprechpartner_position: null, firma: null, ort: null, rolle: null,
    })
    expect(v.Firma).toBe('Ihr Unternehmen')
    expect(v.Vorname).toBe('')
    expect(v.Nachname).toBe('')
    expect(v.Position).toBe('')
  })
})
