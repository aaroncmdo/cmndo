import { describe, it, expect, vi } from 'vitest'
import { type ReactNode } from 'react'

// SP-D Render-Test. environment='node' + kein jsdom/testing-library (siehe
// CardLink.test.tsx) -> wir rufen die REINE, hook-freie Komponente als Funktion
// auf und inspizieren den zurueckgelieferten React-Element-Tree direkt (Labels +
// Step-State-Klassen). Das Card-Primitive ist Dual-File (.web/.native) -> hier
// als Passthrough gestubbt; getestet wird die Stepper-Struktur (unser Code),
// nicht der Card-Wrapper.
vi.mock('@/components/primitives', () => ({
  Card: ({ children }: { children: ReactNode }) => children,
}))

import SelbstzahlerReparaturStepper from '../SelbstzahlerReparaturStepper'

type El = { type: unknown; props: Record<string, unknown> }
const isEl = (n: unknown): n is El => !!n && typeof n === 'object' && 'props' in (n as object)

function collectStrings(node: ReactNode): string[] {
  const out: string[] = []
  const visit = (n: ReactNode) => {
    if (typeof n === 'string') out.push(n)
    else if (Array.isArray(n)) n.forEach(visit)
    else if (isEl(n)) visit(n.props.children as ReactNode)
  }
  visit(node)
  return out
}

function collectClassNames(node: ReactNode): string {
  const out: string[] = []
  const visit = (n: ReactNode) => {
    if (Array.isArray(n)) n.forEach(visit)
    else if (isEl(n)) {
      if (typeof n.props.className === 'string') out.push(n.props.className)
      visit(n.props.children as ReactNode)
    }
  }
  visit(node)
  return out.join(' ')
}

const render = (p: { hatWerkstatt: boolean; terminStatus: string | null; kvaFreigegeben: boolean; abgeschlossen: boolean }) =>
  SelbstzahlerReparaturStepper(p) as ReactNode

describe('SelbstzahlerReparaturStepper (Render-Tree)', () => {
  it('rendert alle 5 Schritt-Labels (inkl. Freigabe)', () => {
    const s = collectStrings(render({ hatWerkstatt: false, terminStatus: null, kvaFreigegeben: false, abgeschlossen: false }))
    expect(s).toContain('Schaden gemeldet')
    expect(s).toContain('Werkstatt')
    expect(s).toContain('Termin')
    expect(s).toContain('Freigabe')
    expect(s).toContain('Reparatur')
  })

  it('keine Werkstatt: Schaden erledigt (success) + Werkstatt aktiv (navy)', () => {
    const c = collectClassNames(render({ hatWerkstatt: false, terminStatus: null, kvaFreigegeben: false, abgeschlossen: false }))
    expect(c).toContain('bg-success')
    expect(c).toContain('bg-claimondo-navy')
  })

  it('Werkstatt gewaehlt, Termin offen: aktiver Schritt bleibt navy', () => {
    const c = collectClassNames(render({ hatWerkstatt: true, terminStatus: null, kvaFreigegeben: false, abgeschlossen: false }))
    expect(c).toContain('bg-claimondo-navy')
    expect(c).toContain('bg-success')
  })

  it('Termin bestaetigt + KVA NICHT freigegeben: aktiver Schritt (Freigabe) ist navy — NICHT Reparatur', () => {
    const c = collectClassNames(render({ hatWerkstatt: true, terminStatus: 'bestaetigt', kvaFreigegeben: false, abgeschlossen: false }))
    expect(c).toContain('bg-claimondo-navy')
  })

  it('Termin bestaetigt + KVA freigegeben: Reparatur aktiv (navy)', () => {
    const c = collectClassNames(render({ hatWerkstatt: true, terminStatus: 'bestaetigt', kvaFreigegeben: true, abgeschlossen: false }))
    expect(c).toContain('bg-claimondo-navy')
  })

  it('abgeschlossen: alle Schritte success, kein aktiver navy-Schritt', () => {
    const c = collectClassNames(render({ hatWerkstatt: true, terminStatus: 'erledigt', kvaFreigegeben: true, abgeschlossen: true }))
    expect(c).toContain('bg-success')
    expect(c).not.toContain('bg-claimondo-navy')
  })
})
