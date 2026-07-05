import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildZahlungsproblemText,
  meldePartnerZahlungsproblem,
  resolvePartnerFromStripe,
  type ZahlungsproblemParams,
} from './zahlungsproblem-alert'

// ---- Mocks ----

vi.mock('@/lib/tasks/create-task', () => ({
  createLinkedTask: vi.fn().mockResolvedValue({ task_id: 'task-123' }),
}))

vi.mock('@/lib/whatsapp/team-notify', () => ({
  notifyTeamWhatsApp: vi.fn().mockResolvedValue(undefined),
}))

import { createLinkedTask } from '@/lib/tasks/create-task'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'

// ---- buildZahlungsproblemText ----

describe('buildZahlungsproblemText', () => {
  it('refund: echte Umlaute + EUR-Format + kein automatischer Entzug', () => {
    const params: ZahlungsproblemParams = {
      art: 'refund',
      partnerTyp: 'sv',
      partnerId: 'sv-1',
      partnerName: 'Max Mustermann',
      betragCent: 15000,
      grund: 'requested_by_customer',
      stripeRef: 'ch_abc123',
    }
    const text = buildZahlungsproblemText(params)
    expect(text).toContain('Rückerstattung')
    expect(text).toContain('Max Mustermann')
    expect(text).toContain('150,00')
    expect(text).toContain('€')
    expect(text).toContain('requested_by_customer')
    expect(text).toContain('kein automatischer Entzug')
    // Der Text enthält echte Umlaute statt ASCII-Ersätze
    expect(text).toContain('ü') // Rückerstattung, prüfen
    expect(text).toContain('Rückerstattung')
  })

  it('dispute: Chargeback + Umlaute + EUR-Format', () => {
    const params: ZahlungsproblemParams = {
      art: 'dispute',
      partnerTyp: 'sv',
      partnerId: 'sv-2',
      partnerName: 'Müller GmbH',
      betragCent: 20050,
      grund: 'fraudulent',
      stripeRef: 'dp_xyz',
    }
    const text = buildZahlungsproblemText(params)
    expect(text).toContain('Chargeback')
    expect(text).toContain('Müller GmbH')
    expect(text).toContain('200,50')
    expect(text).toContain('fraudulent')
    expect(text).toContain('kein automatischer Entzug')
  })

  it('canceled: Zahlung storniert + EUR-Format + kein automatischer Entzug', () => {
    const params: ZahlungsproblemParams = {
      art: 'canceled',
      partnerTyp: 'unbekannt',
      partnerId: null,
      partnerName: 'PI pi_99',
      betragCent: 99900,
      grund: 'abandoned',
      stripeRef: 'pi_99',
    }
    const text = buildZahlungsproblemText(params)
    expect(text).toContain('storniert')
    expect(text).toContain('PI pi_99')
    expect(text).toContain('999,00')
    expect(text).toContain('kein automatischer Entzug')
  })

  it('null-Grund wird sauber weggelassen oder als leerer Abschnitt behandelt', () => {
    const params: ZahlungsproblemParams = {
      art: 'refund',
      partnerTyp: 'sv',
      partnerId: 'sv-3',
      partnerName: 'Test SV',
      betragCent: 5000,
      grund: null,
      stripeRef: 'ch_no_grund',
    }
    const text = buildZahlungsproblemText(params)
    expect(text).toContain('Test SV')
    expect(text).toContain('50,00')
    // kein undefined/null im Text
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
  })
})

// ---- meldePartnerZahlungsproblem ----

describe('meldePartnerZahlungsproblem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseParams: ZahlungsproblemParams = {
    art: 'refund',
    partnerTyp: 'sv',
    partnerId: 'sv-abc',
    partnerName: 'Anna Beispiel',
    betragCent: 30000,
    grund: 'duplicate',
    stripeRef: 'ch_001',
  }

  it('refund: task mit prioritaet dringend wird erstellt', async () => {
    const result = await meldePartnerZahlungsproblem({ ...baseParams, art: 'refund' })
    expect(result.ok).toBe(true)
    expect(createLinkedTask).toHaveBeenCalledOnce()
    const call = (createLinkedTask as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.prioritaet).toBe('dringend')
    expect(call.typ).toBe('zahlung-problem')
    expect(call.trigger_event).toBe('stripe_refund')
    expect(call.auto_erstellt).toBe(true)
  })

  it('dispute: task mit prioritaet kritisch + team-WA gefeuert', async () => {
    const result = await meldePartnerZahlungsproblem({ ...baseParams, art: 'dispute' })
    expect(result.ok).toBe(true)
    expect(createLinkedTask).toHaveBeenCalledOnce()
    const call = (createLinkedTask as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.prioritaet).toBe('kritisch')
    expect(call.trigger_event).toBe('stripe_dispute')
    expect(notifyTeamWhatsApp).toHaveBeenCalledOnce()
    const waText: string = (notifyTeamWhatsApp as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(waText).toContain('Chargeback')
  })

  it('canceled: task mit prioritaet dringend, kein WA', async () => {
    const result = await meldePartnerZahlungsproblem({ ...baseParams, art: 'canceled' })
    expect(result.ok).toBe(true)
    const call = (createLinkedTask as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.prioritaet).toBe('dringend')
    expect(call.trigger_event).toBe('stripe_canceled')
    expect(notifyTeamWhatsApp).not.toHaveBeenCalled()
  })

  it('sv: entity_type sv_onboarding + entity_id korrekt gesetzt', async () => {
    const result = await meldePartnerZahlungsproblem({
      ...baseParams,
      partnerTyp: 'sv',
      partnerId: 'sv-xyz',
    })
    expect(result.ok).toBe(true)
    const call = (createLinkedTask as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.entity_type).toBe('sv_onboarding')
    expect(call.entity_id).toBe('sv-xyz')
  })

  it('unbekannt: kein entity_type/id gesetzt', async () => {
    const result = await meldePartnerZahlungsproblem({
      ...baseParams,
      partnerTyp: 'unbekannt',
      partnerId: null,
    })
    expect(result.ok).toBe(true)
    const call = (createLinkedTask as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.entity_type).toBeUndefined()
    expect(call.entity_id).toBeUndefined()
  })

  it('NON-FATAL: task-Fehler lässt ok:false zurückkehren ohne zu werfen', async () => {
    (createLinkedTask as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB down'))
    const result = await meldePartnerZahlungsproblem(baseParams)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('DB down')
    // Funktion hat NICHT geworfen — Test würde sonst fehlschlagen
  })
})

// ---- resolvePartnerFromStripe ----

describe('resolvePartnerFromStripe', () => {
  it('gutachter_id in meta -> sv (lookup via profile_id)', async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'sv-1', profile_id: 'prof-1' },
              error: null,
            }),
          }),
        }),
      }),
    }
    // name-join: zweiter from('profiles')
    const profilesSelect = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { vorname: 'Max', nachname: 'Mustermann', email: 'max@test.de' },
            error: null,
          }),
        }),
      }),
    }
    const svSelect = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'sv-1', profile_id: 'prof-1' },
            error: null,
          }),
        }),
      }),
    }
    const mockDb = {
      from: vi.fn()
        .mockReturnValueOnce(svSelect)
        .mockReturnValueOnce(profilesSelect),
    }

    const result = await resolvePartnerFromStripe(
      mockDb as any,
      { gutachter_id: 'sv-1' },
      null,
    )
    expect(result.partnerTyp).toBe('sv')
    expect(result.partnerId).toBe('sv-1')
    expect(result.partnerName).toContain('Max')
  })

  it('piId-lookup: kein gutachter_id in meta -> sucht via stripe_anzahlung_payment_intent_id', async () => {
    const svSelect = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'sv-2', profile_id: 'prof-2' },
            error: null,
          }),
        }),
      }),
    }
    const profilesSelect = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { vorname: null, nachname: null, email: 'sv2@test.de' },
            error: null,
          }),
        }),
      }),
    }
    const mockDb = {
      from: vi.fn()
        .mockReturnValueOnce(svSelect)
        .mockReturnValueOnce(profilesSelect),
    }

    const result = await resolvePartnerFromStripe(mockDb as any, {}, 'pi_test_99')
    expect(result.partnerTyp).toBe('sv')
    expect(result.partnerId).toBe('sv-2')
    // email fallback
    expect(result.partnerName).toBe('sv2@test.de')
  })

  it('unbekannt: kein gutachter_id, kein piId-Treffer -> unbekannter Partner', async () => {
    const svSelect = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }),
    }
    const mockDb = {
      from: vi.fn().mockReturnValueOnce(svSelect),
    }

    const result = await resolvePartnerFromStripe(mockDb as any, {}, 'pi_unknown')
    expect(result.partnerTyp).toBe('unbekannt')
    expect(result.partnerId).toBeNull()
    expect(result.partnerName).toBe('PI pi_unknown')
  })

  it('kein gutachter_id, kein piId -> unbekannter Partner ohne PI-Ref', async () => {
    const result = await resolvePartnerFromStripe({} as any, {}, null)
    expect(result.partnerTyp).toBe('unbekannt')
    expect(result.partnerId).toBeNull()
    expect(result.partnerName).toBe('unbekannter Partner')
  })
})
