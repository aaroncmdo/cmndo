import { describe, it, expect } from 'vitest'
import {
  MERGE_VARS,
  ACTION_VARS,
  registrierungsUrl,
  partnerLandingUrl,
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
    expect(tokens).toContain('Partnerlink')
    expect(tokens).toContain('Beratungslink')
    expect(tokens).toContain('Registrierungslink')
  })
})

describe('registrierungsUrl — rollenbewusst', () => {
  it('mappt jede Partner-Rolle auf ihre Registrierungs-Route', () => {
    expect(registrierungsUrl('makler')).toContain('/makler/registrieren')
    expect(registrierungsUrl('werkstatt')).toContain('/werkstatt/registrieren')
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

describe('partnerLandingUrl — rollenbewusstes Cold-Mail-CTA-Ziel', () => {
  it('makler + SV zeigen auf ihre verkaufswirksamen Landing-Subdomains', () => {
    expect(partnerLandingUrl('makler')).toBe('https://makler.claimondo.de')
    expect(partnerLandingUrl('sachverstaendiger')).toBe('https://gutachter.claimondo.de')
  })
  it('werkstatt zeigt auf die live Landing-Subdomain', () => {
    expect(partnerLandingUrl('werkstatt')).toBe('https://werkstatt.claimondo.de')
  })
  it('unbekannte Rolle -> harmloser Fallback (kein NXDOMAIN)', () => {
    expect(partnerLandingUrl(null)).toBe('https://claimondo.de')
    expect(partnerLandingUrl('quatsch')).toBe('https://claimondo.de')
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
  it('Beratungslink faellt ohne beratungsUrl auf den Marketing-Link zurueck', () => {
    const vars = resolveActionVars({ rolle: 'werkstatt' })
    expect(vars.Beratungslink).toContain('claimondo.de/beratung-anfragen')
    expect(vars.Beratungslink).toContain('Beratungsgespräch buchen')
    expect(vars.Registrierungslink).toContain('/werkstatt/registrieren')
    expect(vars.Registrierungslink).toContain('Jetzt registrieren')
    // Beides sind Buttons.
    expect(vars.Registrierungslink).toContain('display:inline-block')
  })
  it('makler bekommt die Makler-Registrierung', () => {
    expect(resolveActionVars({ rolle: 'makler' }).Registrierungslink).toContain('/makler/registrieren')
  })
  it('Beratungslink nutzt den tokenisierten Self-Booking-Link, wenn der Server ihn baut', () => {
    const vars = resolveActionVars({
      rolle: 'makler',
      beratungsUrl: 'https://app.claimondo.de/beratung/lead-1?exp=1&sig=ab',
    })
    expect(vars.Beratungslink).toContain('href="https://app.claimondo.de/beratung/lead-1?exp=1&sig=ab"')
    expect(vars.Beratungslink).toContain('Beratungsgespräch buchen')
  })
  it('Partnerlink zeigt rollenbewusst auf die Landing (als Button)', () => {
    const makler = resolveActionVars({ rolle: 'makler' })
    expect(makler.Partnerlink).toContain('href="https://makler.claimondo.de"')
    expect(makler.Partnerlink).toContain('Jetzt Partner werden')
    expect(makler.Partnerlink).toContain('display:inline-block')
    expect(resolveActionVars({ rolle: 'sachverstaendiger' }).Partnerlink).toContain(
      'href="https://gutachter.claimondo.de"',
    )
  })
})
