// src/components/mitarbeiter/ClaimHoverCard.test.tsx
// env=node: uses renderToStaticMarkup (no jsdom/@testing-library).
// Interactive edit (useState) is covered by tsc; only render + pure helper tested here.
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ClaimHoverCard, { formatFieldValue } from './ClaimHoverCard'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'
vi.mock('@/app/mitarbeiter/claim-edit-actions', () => ({ updateClaimField: vi.fn(async () => ({ ok: true })), ALLOWED_CLAIM_FIELDS: ['notizen','interne_notizen','schadens_hoehe_netto'] }))

const item: ClaimWorkItem = {
  kind: 'claim', id: 'c1', fallId: 'f1', claimNummer: 'CLM-1', stage: 'begutachtung', subState: 'gutachten',
  nextActionCode: 'gutachten_ausstehend', ownerRole: 'sv', waitingOn: 'sv', isOverdue: false, overdueSinceDays: null,
  display: { title: 'Müller', kennzeichen: 'K-AB 1', schadenhoehe: 4500 },
  editable: { notizen: 'Kunde nicht erreicht', interneNotizen: null, schadensHoeheNetto: 4500 },
}
describe('ClaimHoverCard', () => {
  it('zeigt Titel, Next-Action und einen Fall-öffnen-Link', () => {
    const html = renderToStaticMarkup(<ClaimHoverCard item={item} />)
    expect(html).toContain('Müller')
    expect(html).toContain('Gutachten anfordern')
    expect(html).toContain('/faelle/f1')
  })
  it('formatFieldValue: null → "—", Zahl mit €', () => {
    expect(formatFieldValue('schadens_hoehe_netto', null)).toBe('—')
    expect(formatFieldValue('schadens_hoehe_netto', 4500)).toMatch(/4\.?500/)
  })
  it('zeigt den aktuellen Wert eines editierbaren Feldes (Notiz)', () => {
    const html = renderToStaticMarkup(<ClaimHoverCard item={item} />)
    expect(html).toContain('Kunde nicht erreicht')
  })
})
