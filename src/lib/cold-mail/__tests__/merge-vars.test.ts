import { describe, it, expect } from 'vitest'
import {
  MERGE_VARS,
  ACTION_VARS,
  registrierungsUrl,
  actionButton,
  resolveActionVars,
} from '../merge-vars'

describe('Palette-Definitionen', () => {
  it('MERGE_VARS deckt die Lead-Datenfelder ab', () => {
    const tokens = MERGE_VARS.map((v) => v.token)
    expect(tokens).toEqual(
      expect.arrayContaining(['Ansprechpartner', 'Vorname', 'Nachname', 'Firma', 'Position', 'Ort']),
    )
    // Jede Var hat ein nutzersichtbares Label.
    for (const v of MERGE_VARS) expect(v.label.length).toBeGreaterThan(0)
  })

  it('ACTION_VARS listet die einfuegbaren CTAs', () => {
    const tokens = ACTION_VARS.map((a) => a.token)
    expect(tokens).toContain('Beratungslink')
    expect(tokens).toContain('Registrierungslink')
  })
})

describe('registrierungsUrl — rollenbewusst', () => {
  it('mappt jede Partner-Rolle auf ihre Registrierungs-Route', () => {
    expect(registrierungsUrl('makler')).toContain('/makler/registrieren')
    expect(registrierungsUrl('werkstatt')).toContain('/werkstatt-partner-werden')
    expect(registrierungsUrl('sachverstaendiger')).toContain('/sv/registrieren')
  })
  it('nutzt die App-Domain', () => {
    expect(registrierungsUrl('makler')).toMatch(/^https:\/\/app\.claimondo\.de\//)
  })
  it('unbekannte Rolle -> harmloser Fallback auf die App-Basis (kein kaputter Link)', () => {
    expect(registrierungsUrl(null)).toBe('https://app.claimondo.de')
    expect(registrierungsUrl('quatsch')).toBe('https://app.claimondo.de')
  })
})

describe('actionButton — email-sicheres Button-HTML', () => {
  it('baut ein <a> mit href, Label und Inline-Button-Style', () => {
    const html = actionButton('https://x.de', 'Klick mich')
    expect(html).toContain('href="https://x.de"')
    expect(html).toContain('Klick mich')
    expect(html).toContain('display:inline-block') // Button-Optik statt nacktem Link
    expect(html).toMatch(/^<a /)
  })
})

describe('resolveActionVars — Tokens -> Button-HTML pro Lead', () => {
  it('Beratungslink ist statisch, Registrierungslink rollenabhaengig', () => {
    const vars = resolveActionVars({ rolle: 'werkstatt' })
    expect(vars.Beratungslink).toContain('claimondo.de/beratung-anfragen')
    expect(vars.Beratungslink).toContain('Beratungsgespräch buchen')
    expect(vars.Registrierungslink).toContain('/werkstatt-partner-werden')
    expect(vars.Registrierungslink).toContain('Jetzt registrieren')
    // Beides sind Buttons.
    expect(vars.Registrierungslink).toContain('display:inline-block')
  })
  it('makler bekommt die Makler-Registrierung', () => {
    expect(resolveActionVars({ rolle: 'makler' }).Registrierungslink).toContain('/makler/registrieren')
  })
})
