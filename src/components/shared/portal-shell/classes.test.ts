import { describe, it, expect } from 'vitest'
import { portalShellClasses } from './classes'

describe('portalShellClasses', () => {
  it('md: Canvas/Card/Gutter/Hide alle md-praefixiert', () => {
    const c = portalShellClasses('md')
    expect(c.canvas).toBe('md:bg-[var(--brand-primary)]')
    expect(c.card).toContain('md:rounded-l-ios-xl')
    expect(c.card).toContain('md:bg-claimondo-bg')
    expect(c.cardGutter).toBe('md:pl-4 md:pt-4 md:pb-4')
    expect(c.mobileHide).toBe('md:hidden')
  })

  it('lg: alle lg-praefixiert (Kunde/SV-Breakpoint)', () => {
    const c = portalShellClasses('lg')
    expect(c.canvas).toBe('lg:bg-[var(--brand-primary)]')
    expect(c.card).toContain('lg:rounded-l-ios-xl')
    expect(c.cardGutter).toBe('lg:pl-4 lg:pt-4 lg:pb-4')
    expect(c.mobileHide).toBe('lg:hidden')
  })

  it('Canvas ohne Inline-Hex (Token-Audit-safe)', () => {
    expect(portalShellClasses('md').canvas).not.toContain('#')
    expect(portalShellClasses('lg').canvas).not.toContain('#')
  })
})
