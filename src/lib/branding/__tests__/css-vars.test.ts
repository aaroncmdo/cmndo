import { describe, it, expect } from 'vitest'
import { generateCssVars, countCssVars } from '../css-vars'
import { CLAIMONDO_DEFAULT_THEME, themeFromLegacy } from '../theme'

// AAR-424: Tests für den CSS-Var-Generator. Prüft Mode-spezifische
// Output-Größen + dass die V1-Alias-Namen im full-Mode noch gesetzt werden
// (Backwards-Compat für bestehende bg-[var(--brand-sidebar-bg)]-Consumer).

describe('generateCssVars()', () => {
  it('liefert leeres Object bei mode=none', () => {
    const vars = generateCssVars(CLAIMONDO_DEFAULT_THEME, 'none')
    expect(Object.keys(vars).length).toBe(0)
  })

  it('liefert leeres Object auch bei null-Theme + mode=none', () => {
    const vars = generateCssVars(null, 'none')
    expect(Object.keys(vars).length).toBe(0)
  })

  it('liefert genau 4 Primary-Varianten bei mode=light', () => {
    const vars = generateCssVars(CLAIMONDO_DEFAULT_THEME, 'light') as Record<string, string>
    expect(Object.keys(vars).sort()).toEqual([
      '--brand-primary',
      '--brand-primary-active',
      '--brand-primary-hover',
      '--brand-primary-soft',
    ])
    expect(vars['--brand-primary']).toBe(CLAIMONDO_DEFAULT_THEME.primary)
  })

  it('liefert 30 Tokens bei mode=full (9 Core + 5 Neutrale + 5 Text + 4 Sidebar + 7 Status)', () => {
    // Status 4->7: success/warning/danger haben je eine -soft-Variante (PR #1012 "Status-Soft-Vars").
    expect(countCssVars('full')).toBe(30)
  })

  it('full-mode enthält V1-Alias-Namen für backwards-compat', () => {
    const vars = generateCssVars(CLAIMONDO_DEFAULT_THEME, 'full') as Record<string, string>
    // Die V1-Consumer (GutachterShell, BrandedLayout) lesen diese Namen direkt.
    expect(vars['--brand-primary']).toBeDefined()
    expect(vars['--brand-secondary']).toBeDefined()
    expect(vars['--brand-accent']).toBeDefined()
    expect(vars['--brand-sidebar-bg']).toBeDefined()
    expect(vars['--brand-text-on-primary']).toBeDefined()
    expect(vars['--brand-surface']).toBeDefined()
  })

  it('full-mode enthält V2-Status-Tokens', () => {
    const vars = generateCssVars(CLAIMONDO_DEFAULT_THEME, 'full') as Record<string, string>
    expect(vars['--brand-success']).toBe(CLAIMONDO_DEFAULT_THEME.success)
    expect(vars['--brand-warning']).toBe(CLAIMONDO_DEFAULT_THEME.warning)
    expect(vars['--brand-danger']).toBe(CLAIMONDO_DEFAULT_THEME.danger)
    expect(vars['--brand-info']).toBe(CLAIMONDO_DEFAULT_THEME.info)
  })

  it('füllt fehlende V2-Keys aus partial Theme mit Default-Werten', () => {
    // Nur primary gesetzt — Rest soll aus CLAIMONDO_DEFAULT_THEME kommen.
    const partial = { primary: '#FF0000' }
    const vars = generateCssVars(partial as Parameters<typeof generateCssVars>[0], 'full') as Record<string, string>
    expect(vars['--brand-primary']).toBe('#FF0000')
    expect(vars['--brand-success']).toBe(CLAIMONDO_DEFAULT_THEME.success)
  })

  it('mode=light mit custom Theme setzt Custom-Primary', () => {
    const custom = themeFromLegacy('#FF6600', null)
    const vars = generateCssVars(custom, 'light') as Record<string, string>
    expect(vars['--brand-primary']).toBe('#FF6600')
    expect(vars['--brand-primary-hover']).toBe(custom.primaryHover)
    expect(vars['--brand-primary-active']).toBe(custom.primaryActive)
    expect(vars['--brand-primary-soft']).toBe(custom.primarySoft)
  })
})

describe('countCssVars()', () => {
  it('zählt konsistent: none=0, light=4, full=30', () => {
    expect(countCssVars('none')).toBe(0)
    expect(countCssVars('light')).toBe(4)
    expect(countCssVars('full')).toBe(30)
  })
})
