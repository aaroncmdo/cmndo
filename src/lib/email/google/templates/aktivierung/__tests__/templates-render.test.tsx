import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { registry } from '../registry'
import { TEMPLATE_KEYS } from '../types'

const mergeBase = {
  werkstattName: 'Muster GmbH',
  ansprechpartner: 'Nicolas',
  tel: '+49 170',
  portalLink: 'https://app.claimondo.de/werkstatt',
  sv: null,
}

// Minimal-valide Copy je Key, abgeleitet aus copy-schemas.ts.
const DEFAULT_COPY = {
  willkommen: { headline: 'x', absaetze: ['x'], so_laeufts: ['x'], cta_label: 'x' },
  nutzen: { headline: 'x', bloecke: Array.from({ length: 4 }, () => ({ titel: 'x', text: 'x' })), schluss: 'x', cta_label: 'x' },
  kundenstory: { headline: 'x', intro: 'x', zitat: 'x', schluss: ['x'], cta_label: 'x' },
  bonus: { headline: 'x', absaetze: ['x'], cta_label: 'x', fussnote: 'x' },
  reaktivierung: { headline: 'x', intro: 'x', punkte: ['x', 'x', 'x'], schluss: 'x', cta_label: 'x' },
} as const

describe('registry', () => {
  it('hat alle 6 Keys', () => {
    for (const k of TEMPLATE_KEYS) expect(registry[k]).toBeDefined()
  })

  it('jede Vorlage rendert mit Default-Copy + Werkstattnamen', async () => {
    for (const k of TEMPLATE_KEYS) {
      if (k === 'sv_vorstellung') continue
      const { Component, copySchema } = registry[k]
      const copy = copySchema.parse(DEFAULT_COPY[k as keyof typeof DEFAULT_COPY])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html = await render((Component as any)({ copy, merge: mergeBase }))
      expect(html).toContain('Muster GmbH')
    }
  })
})
