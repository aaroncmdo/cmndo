import { describe, it, expect, vi } from 'vitest'
import { type ReactNode } from 'react'

// Panel komponiert Stepper + Hero. Wir stubben beide Kinder + Stack und pruefen,
// dass das Panel den korrekten spineIndex an den Stepper und den state an den Hero
// durchreicht (environment='node', kein Render — Element-Tree-Inspektion).
const { StepperMock, HeroMock } = vi.hoisted(() => ({
  StepperMock: (_p: { current: number }) => null,
  HeroMock: (_p: { state: string }) => null,
}))

vi.mock('@/components/primitives', () => ({
  Stack: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./LeadWorkflowStepper', () => ({ default: StepperMock }))
vi.mock('./LeadNextBestAction', () => ({ default: HeroMock }))

import LeadWorkflowPanel from './LeadWorkflowPanel'
import type { LeadWorkflowResult } from '../_lib/deriveLeadWorkflowState'

type El = { type: unknown; props: Record<string, unknown> }
const isEl = (n: unknown): n is El => !!n && typeof n === 'object' && 'props' in (n as object)

function findProps(node: ReactNode, target: unknown): Record<string, unknown> | null {
  let hit: Record<string, unknown> | null = null
  const visit = (n: ReactNode) => {
    if (Array.isArray(n)) n.forEach(visit)
    else if (isEl(n)) {
      if (n.type === target) hit = n.props
      visit(n.props.children as ReactNode)
    }
  }
  visit(node)
  return hit
}

describe('LeadWorkflowPanel', () => {
  it('reicht spineIndex an den Stepper + state an den Hero durch', () => {
    const result = { state: 'sv_zuweisen', qual: {} } as unknown as LeadWorkflowResult
    const node = LeadWorkflowPanel({ result }) as ReactNode

    const stepperProps = findProps(node, StepperMock)
    const heroProps = findProps(node, HeroMock)

    // spineIndexForState('sv_zuweisen') === 2 (SV-Termin-Meilenstein)
    expect(stepperProps?.current).toBe(2)
    expect(heroProps?.state).toBe('sv_zuweisen')
  })

  it('reicht onPrimaryAction + loading an den Hero durch', () => {
    const fn = () => {}
    const result = { state: 'flowlink_senden', qual: {} } as unknown as LeadWorkflowResult
    const node = LeadWorkflowPanel({ result, onPrimaryAction: fn, loading: true }) as ReactNode

    const heroProps = findProps(node, HeroMock)
    expect(heroProps?.onPrimaryAction).toBe(fn)
    expect(heroProps?.loading).toBe(true)
  })
})
