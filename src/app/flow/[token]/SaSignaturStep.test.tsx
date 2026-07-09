import { describe, it, expect, vi } from 'vitest'
import { type ReactNode } from 'react'

// Parität-Test für die SaSignaturStep-Extraktion (Approach C).
// environment='node', kein jsdom/testing-library (Repo-Muster, siehe
// LeadWorkflowStepper.test.tsx / SelbstzahlerReparaturStepper.test.tsx):
// Die Komponente nutzt Hooks (useState/useEffect/useRef + useTranslations) —
// wir stubben die Hooks (initial-Werte, kein Renderer) + next-intl (Key-Echo) und
// rufen die Komponente als Funktion auf, dann inspizieren wir den Element-Tree.
// Das sichert die beiden verhaltensrelevanten Invarianten der Extraktion ab:
//  (1) Sign-Button-disabled-Logik  (2) SV-Consent-Häkchen nur bei gutachterAnzeige.

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    // Hooks liefern ihre Initial-Werte zurück (setState = no-op) — die disabled-Logik
    // + das Consent-Gating lesen genau diese Initial-States beim ersten Render.
    useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => {}],
    useRef: (init: unknown) => ({ current: init ?? null }),
    useEffect: () => {},
  }
})

// next-intl: t(key) → key (Echo). t.rich/t.has als no-op-Ergänzung (im Initial-Render
// nicht auf dem Pfad, aber vorhanden für Robustheit).
vi.mock('next-intl', () => {
  const t = (key: string) => key
  ;(t as unknown as { rich: (k: string) => string }).rich = (key: string) => key
  ;(t as unknown as { has: () => boolean }).has = () => true
  return { useTranslations: () => t }
})

// Server-Actions + Signatur-Upload: nie im Test aufgerufen (kein Submit) — nur stubben,
// damit der Import nicht 'server-only' o.ä. in den Node-Testlauf zieht.
vi.mock('./actions', () => ({
  signSAandCreateFall: vi.fn(),
  generateSAPdf: vi.fn(),
}))
vi.mock('@/lib/actions/unterschrift-upload', () => ({
  uploadFlowSignatur: vi.fn(),
}))
// LegalDocPopover: Passthrough (rendert nur children).
vi.mock('@/components/legal/LegalDocPopover', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}))

import SaSignaturStep from './SaSignaturStep'

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

// Findet den ersten <button> mit disabled-Prop im Tree (der Sign-Button ist der einzige
// mit disabled — der Volltext-Link ist ein type-button ohne disabled).
function findDisabled(node: ReactNode): boolean | undefined {
  let found: boolean | undefined
  const visit = (n: ReactNode) => {
    if (found !== undefined) return
    if (Array.isArray(n)) { n.forEach(visit); return }
    if (isEl(n)) {
      if (n.type === 'button' && 'disabled' in n.props) {
        found = Boolean(n.props.disabled)
        return
      }
      visit(n.props.children as ReactNode)
    }
  }
  visit(node)
  return found
}

const base = {
  token: 't',
  leadId: 'l',
  flowLinkId: 'f',
  legalDocs: { agb: { titel: 'AGB', markdown: '' } },
  onSigned: () => {},
}

const render = (props: Partial<Parameters<typeof SaSignaturStep>[0]> = {}) =>
  SaSignaturStep({ ...base, gutachterAnzeige: null, ...props }) as ReactNode

describe('SaSignaturStep (Parität-Render-Tree)', () => {
  it('Sign-Button ist ohne Signatur + ohne AGB-Häkchen disabled', () => {
    const tree = render({ gutachterAnzeige: null })
    // Der Button-Text ist der (echo-te) Key 'step_sa.cta_sign' → Button ist im Tree.
    expect(collectStrings(tree)).toContain('step_sa.cta_sign')
    expect(findDisabled(tree)).toBe(true)
  })

  it('ohne gutachterAnzeige wird KEIN SV-Consent-Häkchen gerendert', () => {
    const tree = render({ gutachterAnzeige: null })
    // Das SV-Consent-Label rendert t('step_sa.sv_consent_text', ...) → dieser Key
    // darf ohne gutachterAnzeige NICHT im Tree auftauchen.
    expect(collectStrings(tree)).not.toContain('step_sa.sv_consent_text')
  })
})
