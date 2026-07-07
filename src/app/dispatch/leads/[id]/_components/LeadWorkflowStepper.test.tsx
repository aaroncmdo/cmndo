import { describe, it, expect, vi } from 'vitest'
import { type ReactNode } from 'react'

// environment='node', kein jsdom/testing-library (siehe SelbstzahlerReparaturStepper.test.tsx):
// Komponente als Funktion aufrufen + Element-Tree inspizieren. Card-Primitive = Passthrough.
vi.mock('@/components/primitives', () => ({
  Card: ({ children }: { children: ReactNode }) => children,
}))

import LeadWorkflowStepper from './LeadWorkflowStepper'

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

const render = (current: number) => LeadWorkflowStepper({ current }) as ReactNode

describe('LeadWorkflowStepper (Render-Tree)', () => {
  it('rendert alle 5 Meilenstein-Labels', () => {
    const s = collectStrings(render(2))
    expect(s).toContain('Kontakt')
    expect(s).toContain('Qualifizieren')
    expect(s).toContain('SV-Termin')
    expect(s).toContain('FlowLink')
    expect(s).toContain('Abgeschlossen')
  })

  it('current=2: erledigte Schritte success, aktueller Schritt navy', () => {
    const c = collectClassNames(render(2))
    expect(c).toContain('bg-success')
    expect(c).toContain('bg-claimondo-navy')
  })

  it('current=0: aktueller Schritt navy hervorgehoben', () => {
    const c = collectClassNames(render(0))
    expect(c).toContain('bg-claimondo-navy')
  })
})
