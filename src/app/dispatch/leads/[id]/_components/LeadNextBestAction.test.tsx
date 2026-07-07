import { describe, it, expect, vi } from 'vitest'
import { type ReactNode } from 'react'

// environment='node', kein jsdom: Komponente als Funktion + Element-Tree-Inspektion.
// Da beim reinen Funktionsaufruf (ohne Render) die Primitive-Stubs NICHT ausgefuehrt
// werden, erkennen wir den CTA-Button an seiner Element-Typ-Referenz (ButtonMock)
// statt an einer injizierten className. So testen wir die terminal-Verzweigung
// (read-only -> KEIN Button) strukturell.
const { ButtonMock } = vi.hoisted(() => ({
  ButtonMock: (props: { children?: ReactNode }) => props.children ?? null,
}))

vi.mock('@/components/primitives', () => ({
  Card: ({ children }: { children: ReactNode }) => children,
  Stack: ({ children }: { children: ReactNode }) => children,
  Text: ({ children }: { children: ReactNode }) => children,
  Button: ButtonMock,
}))
vi.mock('@/components/shared/StatusBadge', () => ({ StatusBadge: () => null }))

import LeadNextBestAction from './LeadNextBestAction'
import type { LeadWorkflowState } from '../_lib/deriveLeadWorkflowState'

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

function containsType(node: ReactNode, target: unknown): boolean {
  let found = false
  const visit = (n: ReactNode) => {
    if (Array.isArray(n)) n.forEach(visit)
    else if (isEl(n)) {
      if (n.type === target) found = true
      visit(n.props.children as ReactNode)
    }
  }
  visit(node)
  return found
}

const render = (state: LeadWorkflowState) => LeadNextBestAction({ state }) as ReactNode

describe('LeadNextBestAction (Render-Tree)', () => {
  it('nicht-terminal (sv_zuweisen): Titel + CTA-Button gerendert', () => {
    const node = render('sv_zuweisen')
    expect(collectStrings(node)).toContain('Sachverständigen zuweisen')
    expect(collectStrings(node)).toContain('SV zuweisen')
    expect(containsType(node, ButtonMock)).toBe(true)
  })

  it('terminal: read-only — Titel, aber KEIN CTA-Button', () => {
    const node = render('terminal')
    expect(collectStrings(node)).toContain('Abgeschlossen')
    expect(containsType(node, ButtonMock)).toBe(false)
  })

  it('flowlink_senden (unter den Tabs): CTA jetzt vorhanden — Phase 1d schliesst die Guidance-Luecke', () => {
    const node = render('flowlink_senden')
    expect(collectStrings(node)).toContain('FlowLink senden')
    expect(containsType(node, ButtonMock)).toBe(true)
  })

  it('alle Nicht-terminal-Zustaende rendern einen CTA (kein Zustand faellt auf Guidance-only zurueck)', () => {
    const states: LeadWorkflowState[] = [
      'neu', 'qualifizieren', 'sv_zuweisen', 'flowlink_senden', 'nachfassen', 'warten', 'rueckruf',
    ]
    for (const s of states) {
      expect(containsType(render(s), ButtonMock), `${s} sollte einen CTA-Button rendern`).toBe(true)
    }
  })
})
