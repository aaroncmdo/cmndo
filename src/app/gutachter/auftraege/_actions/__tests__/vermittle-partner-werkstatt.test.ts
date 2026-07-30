import { describe, it, expect, vi, beforeEach } from 'vitest'

let authedUser: { id: string } | null = { id: 'user-sv' }
let svProfil: { id: string } | null = { id: 'sv-1' }
const leadDeletes: string[] = []
const ownerSeeds: Array<{ payload: Record<string, unknown>; id: unknown }> = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authedUser } }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1' }, error: null }) }) }),
      update: (payload: Record<string, unknown>) => ({
        eq: (_c: string, id: unknown) => ({
          is: () => {
            if (table === 'claims') ownerSeeds.push({ payload, id })
            return Promise.resolve({ error: null })
          },
        }),
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          if (table === 'leads') leadDeletes.push(id)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }),
}))
vi.mock('@/lib/gutachter', () => ({ getGutachterForUser: vi.fn(async () => svProfil) }))
vi.mock('@/lib/leads/create-lead', () => ({ createLead: vi.fn(async () => ({ ok: true, leadId: 'lead-1' })) }))
vi.mock('@/lib/leads/convert-lead-to-claim', () => ({
  convertLeadToClaim: vi.fn(async () => ({ ok: true, claimId: 'claim-1', fallId: 'fall-1', claimNummer: 'CLM-1', kundenbetreuerId: null })),
}))
vi.mock('@/lib/gutachter/attach-gutachten-ohne-transition', () => ({
  attachGutachtenOhneTransition: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/dokumente/create-pflicht', () => ({ createPflichtdokumenteFromKatalog: vi.fn(async () => undefined) }))
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: vi.fn(async () => ({ ok: true, token: 'tok-1', wiederverwendet: false })),
}))
vi.mock('@/lib/start-link/issue-canonical-flowlink', () => ({ sendeInitialLink: vi.fn(async () => 'email') }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { vermittlePartnerWerkstatt } from '../vermittle-partner-werkstatt'
import { createLead } from '@/lib/leads/create-lead'
import { convertLeadToClaim } from '@/lib/leads/convert-lead-to-claim'
import { attachGutachtenOhneTransition } from '@/lib/gutachter/attach-gutachten-ohne-transition'
import { sendeInitialLink } from '@/lib/start-link/issue-canonical-flowlink'

function validForm(over: Record<string, string | File | null> = {}): FormData {
  const fd = new FormData()
  fd.set('vorname', 'Max')
  fd.set('nachname', 'Muster')
  fd.set('telefon', '+491701234567')
  fd.set('email', 'max@example.com')
  fd.set('kennzeichen', 'B-XX 123')
  fd.set('unfallort', 'Berlin')
  fd.set('betrag', '4200,50')
  fd.set('datei', new File(['pdf'], 'gutachten.pdf', { type: 'application/pdf' }))
  for (const [k, v] of Object.entries(over)) {
    if (v === null) fd.delete(k)
    else fd.set(k, v)
  }
  return fd
}

beforeEach(() => {
  authedUser = { id: 'user-sv' }
  svProfil = { id: 'sv-1' }
  leadDeletes.length = 0
  ownerSeeds.length = 0
  vi.mocked(createLead).mockClear().mockResolvedValue({ ok: true, leadId: 'lead-1' })
  vi.mocked(convertLeadToClaim).mockClear().mockResolvedValue({
    ok: true, claimId: 'claim-1', fallId: 'fall-1', claimNummer: 'CLM-1', kundenbetreuerId: null,
  } as never)
  vi.mocked(attachGutachtenOhneTransition).mockClear().mockResolvedValue({ ok: true })
  vi.mocked(sendeInitialLink).mockClear()
})

describe('vermittlePartnerWerkstatt (P4 T7)', () => {
  it('Happy-Path: Lead -> Sofort-Claim (gutachtenBereitsErstellt + sv.id) -> Attach -> FlowLink', async () => {
    const r = await vermittlePartnerWerkstatt(validForm())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fallId).toBe('fall-1')
    expect(r.flowLinkUrl).toContain('/flow/tok-1')

    expect(createLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source_channel: 'gutachter-vermittlung', status: 'neu' }),
      expect.objectContaining({ abrechnungsweg: 'haftpflicht', service_typ: 'komplett', qualifizierungs_phase: 'konvertiert' }),
    )
    expect(convertLeadToClaim).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', gutachtenBereitsErstellt: true, svIdFromTermin: 'sv-1', triggerByUserId: 'user-sv' }),
    )
    expect(attachGutachtenOhneTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ claimId: 'claim-1', fallId: 'fall-1', svId: 'sv-1', betrag: 4200.5 }),
    )
    expect(sendeInitialLink).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'lead-1' }))
    // J8-Bindung: der vermittelnde SV wird Owner-Knoten (write-once via IS-NULL-Guard).
    expect(ownerSeeds).toEqual([{ payload: { netzwerk_owner_id: 'user-sv' }, id: 'claim-1' }])
  })

  it('Nicht-SV -> {ok:false}, kein Lead', async () => {
    svProfil = null
    const r = await vermittlePartnerWerkstatt(validForm())
    expect(r.ok).toBe(false)
    expect(createLead).not.toHaveBeenCalled()
  })

  it('kein Kontakt (telefon+email leer) -> Validierungsfehler', async () => {
    const r = await vermittlePartnerWerkstatt(validForm({ telefon: '', email: '' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Telefonnummer oder E-Mail')
    expect(createLead).not.toHaveBeenCalled()
  })

  it('kein PDF -> Validierungsfehler', async () => {
    const r = await vermittlePartnerWerkstatt(validForm({ datei: new File(['x'], 'foto.jpg', { type: 'image/jpeg' }) }))
    expect(r.ok).toBe(false)
    expect(createLead).not.toHaveBeenCalled()
  })

  it('convert schlaegt fehl -> Lead wird aufgeraeumt + {ok:false}', async () => {
    vi.mocked(convertLeadToClaim).mockResolvedValueOnce({ ok: false, error: 'kaputt' } as never)
    const r = await vermittlePartnerWerkstatt(validForm())
    expect(r.ok).toBe(false)
    expect(leadDeletes).toEqual(['lead-1'])
    expect(attachGutachtenOhneTransition).not.toHaveBeenCalled()
  })
})
