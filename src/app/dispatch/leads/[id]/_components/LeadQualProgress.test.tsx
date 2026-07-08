import { describe, it, expect } from 'vitest'
import { type ReactNode } from 'react'
import LeadQualProgress from './LeadQualProgress'
import type { QualificationResult } from '../_lib/qualification-engine'

// environment='node', kein jsdom: Komponente als Funktion + Element-Tree-Inspektion.
// LeadQualProgress nutzt nur plain div/p/span -> keine Primitive-Stubs noetig.
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

const complete: QualificationResult = {
  q1_schuldfrage: true,
  q2_schaden: true,
  q3_polizei: true,
  q4_schadentyp: true,
  q5_svTermin: false,
  q6_gegnerKz: true,
  q7_fahrzeug: true,
  q8_schadenhergang: true,
  allComplete: false,
  canSendFlowLink: false,
  completedCount: 7,
  disqualifiziert: false,
}

describe('LeadQualProgress', () => {
  it('alle Erfassungs-Gates erfuellt -> null (self-hiding; Q5-Termin zaehlt nicht)', () => {
    expect(LeadQualProgress({ qual: complete })).toBeNull()
  })

  it('fehlende Gates -> genau deren Labels als Chips', () => {
    const qual = { ...complete, q1_schuldfrage: false, q7_fahrzeug: false }
    const strings = collectStrings(LeadQualProgress({ qual }) as ReactNode)
    expect(strings).toContain('Schuldfrage')
    expect(strings).toContain('Fahrzeug-Daten')
    // erfuellte Gates erscheinen NICHT als Chip:
    expect(strings).not.toContain('Schaden')
    expect(strings).not.toContain('Polizei vor Ort')
  })
})
