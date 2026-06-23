// Task 6: Focused tests fuer ladeSvLeadEinladung-Gate-Logik.
// Gepruefte Branches:
//   1. Lead nicht gefunden => { ok: false }
//   2. claim_status !== 'offen' => { ok: false }
//   3. konvertiert_zu_sv_id gesetzt => { ok: false }
//   4. kein Kontakt => { ok: true, gesendet: false }
//   5. Kontakt vorhanden + Sends ok => { ok: true, gesendet: true }
//   6. WA fehlgeschlagen, Email ok => gesendet: true (mind. 1 Kanal)
//   7. Beide Kanaele fehlgeschlagen => gesendet: false (kein Hard-Error)

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSendWhatsAppText = vi.fn()
vi.mock('@/lib/whatsapp/baileys-client', () => ({
  sendWhatsAppText: (...args: unknown[]) => mockSendWhatsAppText(...args),
}))

const mockSendEmail = vi.fn()
vi.mock('@/lib/email/google/client', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

// Supabase admin mock — konfigurierbar per test
type MockLead = {
  id: string
  name: string
  vorname: string | null
  telefon: string | null
  email: string | null
  claim_status: string | null
  konvertiert_zu_sv_id: string | null
}

let mockLead: MockLead | null = null
let mockLoadError: boolean = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(async () => ({
        data: mockLoadError ? null : mockLead,
        error: mockLoadError ? { message: 'not found' } : null,
      })),
    }),
  })),
}))

// ─── Subject under test ───────────────────────────────────────────────────────
import { ladeSvLeadEinladung } from '../claim-einladung'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ladeSvLeadEinladung', () => {
  beforeEach(() => {
    mockLead = null
    mockLoadError = false
    vi.clearAllMocks()
    // Standard-Erfolg fuer Sends nach clearAllMocks
    mockSendWhatsAppText.mockResolvedValue({ ok: true, messageId: 'msg-1', jid: 'x', timestamp: '2026-01-01' })
    mockSendEmail.mockResolvedValue({ messageId: 'email-1' })
  })

  it('Lead nicht gefunden => ok:false', async () => {
    mockLoadError = true
    const result = await ladeSvLeadEinladung('no-such-id')
    expect(result).toEqual({ ok: false, error: 'SV-Lead nicht gefunden.' })
  })

  it('claim_status !== offen => ok:false', async () => {
    mockLead = {
      id: 'lead-1', name: 'Muster', vorname: null,
      telefon: '+49170', email: null,
      claim_status: 'beansprucht_pending',
      konvertiert_zu_sv_id: null,
    }
    const result = await ladeSvLeadEinladung('lead-1')
    expect(result).toEqual({ ok: false, error: 'Lead ist nicht (mehr) offen.' })
  })

  it('konvertiert_zu_sv_id gesetzt => ok:false', async () => {
    mockLead = {
      id: 'lead-2', name: 'Muster', vorname: null,
      telefon: null, email: null,
      claim_status: 'offen',
      konvertiert_zu_sv_id: 'sv-uuid-xyz',
    }
    const result = await ladeSvLeadEinladung('lead-2')
    expect(result).toEqual({ ok: false, error: 'Lead ist nicht (mehr) offen.' })
  })

  it('offen + kein Kontakt => ok:true, gesendet:false (Import-Lead)', async () => {
    mockLead = {
      id: 'lead-3', name: 'Muster', vorname: null,
      telefon: null, email: null,
      claim_status: 'offen',
      konvertiert_zu_sv_id: null,
    }
    const result = await ladeSvLeadEinladung('lead-3')
    expect(result).toEqual({ ok: true, gesendet: false })
    expect(mockSendWhatsAppText).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('offen + telefon vorhanden => WA-Send, gesendet:true', async () => {
    mockLead = {
      id: 'lead-4', name: 'Muster', vorname: 'Max',
      telefon: '+49170123456', email: null,
      claim_status: 'offen',
      konvertiert_zu_sv_id: null,
    }
    const result = await ladeSvLeadEinladung('lead-4')
    expect(result).toEqual({ ok: true, gesendet: true })
    expect(mockSendWhatsAppText).toHaveBeenCalledWith('+49170123456', expect.stringContaining('beanspruchen Sie Ihr Profil'))
  })

  it('offen + email vorhanden => Email-Send, gesendet:true', async () => {
    mockLead = {
      id: 'lead-5', name: 'Muster', vorname: null,
      telefon: null, email: 'max@muster.de',
      claim_status: 'offen',
      konvertiert_zu_sv_id: null,
    }
    const result = await ladeSvLeadEinladung('lead-5')
    expect(result).toEqual({ ok: true, gesendet: true })
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'max@muster.de' }))
  })

  it('WA fehlgeschlagen, aber Email ok => gesendet:true (mind. 1 Kanal)', async () => {
    mockLead = {
      id: 'lead-6', name: 'Muster', vorname: 'Max',
      telefon: '+49170bad', email: 'max@muster.de',
      claim_status: 'offen',
      konvertiert_zu_sv_id: null,
    }
    mockSendWhatsAppText.mockResolvedValue({ ok: false, error: 'service_unavailable', code: 'service_unavailable' })

    const result = await ladeSvLeadEinladung('lead-6')
    expect(result).toEqual({ ok: true, gesendet: true })
  })

  it('beide Kanaele fehlgeschlagen => gesendet:false (kein Hard-Error)', async () => {
    mockLead = {
      id: 'lead-7', name: 'Muster', vorname: null,
      telefon: '+49170bad', email: 'max@muster.de',
      claim_status: 'offen',
      konvertiert_zu_sv_id: null,
    }
    mockSendWhatsAppText.mockResolvedValue({ ok: false, error: 'fail', code: 'send_failed' })
    mockSendEmail.mockRejectedValue(new Error('SMTP-Fehler'))

    const result = await ladeSvLeadEinladung('lead-7')
    expect(result).toEqual({ ok: true, gesendet: false })
  })
})
