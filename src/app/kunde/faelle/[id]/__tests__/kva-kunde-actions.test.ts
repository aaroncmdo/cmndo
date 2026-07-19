// Spec E 1b — Kunde-Preisdokument-Upload (KVA/Gutachten) + Direkt-Beauftragung.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  claim: { id: 'c1' } as { id: string } | null,
  updateArg: undefined as Record<string, unknown> | undefined,
  updateError: null as { message: string } | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockImplementation(async () => ({ data: { user: h.user } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockImplementation(async () => ({ data: h.claim })) })),
      })),
    })),
  }),
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn((arg: Record<string, unknown>) => {
        h.updateArg = arg
        return { eq: vi.fn().mockImplementation(async () => ({ error: h.updateError })) }
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockImplementation(async () => ({ data: { fall_id: 'f1' } })) })),
      })),
      insert: vi.fn().mockImplementation(async () => ({ error: null })),
    })),
    storage: { from: vi.fn(() => ({ upload: vi.fn().mockImplementation(async () => ({ error: null })) })) },
  })),
}))

beforeEach(() => {
  h.user = { id: 'u1' }
  h.claim = { id: 'c1' }
  h.updateArg = undefined
  h.updateError = null
})

const pdf = { pdfBase64: 'YWJj', pdfMediaType: 'application/pdf', netto: 100, brutto: 119 }

describe('ladeKundePreisdokument', () => {
  it('kein PDF -> ok:false (art-spezifische Meldung)', async () => {
    const { ladeKundePreisdokument } = await import('../kva-kunde-actions')
    const r = await ladeKundePreisdokument('c1', { art: 'gutachten', pdfBase64: '', pdfMediaType: '', netto: null, brutto: null })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/gutachten/i)
  })

  it('nicht angemeldet -> ok:false', async () => {
    h.user = null
    const { ladeKundePreisdokument } = await import('../kva-kunde-actions')
    const r = await ladeKundePreisdokument('c1', { art: 'kva', ...pdf })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/angemeldet/i)
  })

  it('kein Ownership (claim null) -> ok:false', async () => {
    h.claim = null
    const { ladeKundePreisdokument } = await import('../kva-kunde-actions')
    const r = await ladeKundePreisdokument('fremd', { art: 'kva', ...pdf })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/kein zugriff/i)
  })

  it('KVA-Upload -> ok:true + kva_quelle=kunde + Betraege + Freigabe/Ablehnung genullt', async () => {
    const { ladeKundePreisdokument } = await import('../kva-kunde-actions')
    const r = await ladeKundePreisdokument('c1', { art: 'kva', ...pdf })
    expect(r.ok).toBe(true)
    expect(h.updateArg).toMatchObject({
      kva_quelle: 'kunde',
      kostenvoranschlag_brutto: 119,
      reparatur_freigegeben_am: null,
      kva_abgelehnt_am: null,
    })
  })

  it('Gutachten-Upload -> ok:true + kva_quelle=kunde (Preis-Anker fiktiv)', async () => {
    const { ladeKundePreisdokument } = await import('../kva-kunde-actions')
    const r = await ladeKundePreisdokument('c1', { art: 'gutachten', ...pdf })
    expect(r.ok).toBe(true)
    expect(h.updateArg).toMatchObject({ kva_quelle: 'kunde' })
  })

  it('DB-Fehler beim Update -> ok:false', async () => {
    h.updateError = { message: 'boom' }
    const { ladeKundePreisdokument } = await import('../kva-kunde-actions')
    const r = await ladeKundePreisdokument('c1', { art: 'kva', ...pdf })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })
})

describe('beauftrageOhneKva', () => {
  it('nicht angemeldet -> ok:false', async () => {
    h.user = null
    const { beauftrageOhneKva } = await import('../kva-kunde-actions')
    const r = await beauftrageOhneKva('c1')
    expect(r.ok).toBe(false)
  })

  it('kein Ownership -> ok:false', async () => {
    h.claim = null
    const { beauftrageOhneKva } = await import('../kva-kunde-actions')
    const r = await beauftrageOhneKva('fremd')
    expect(r.ok).toBe(false)
  })

  it('Erfolg -> ok:true + modus=direkt + gesetzt_von=user', async () => {
    const { beauftrageOhneKva } = await import('../kva-kunde-actions')
    const r = await beauftrageOhneKva('c1')
    expect(r.ok).toBe(true)
    expect(h.updateArg).toMatchObject({
      reparatur_auftrag_modus: 'direkt',
      reparatur_auftrag_modus_gesetzt_von: 'u1',
    })
    expect(typeof (h.updateArg as Record<string, unknown>).reparatur_auftrag_modus_gesetzt_am).toBe('string')
  })
})

describe('lehneKvaAb', () => {
  it('nicht angemeldet -> ok:false', async () => {
    h.user = null
    const { lehneKvaAb } = await import('../kva-kunde-actions')
    expect((await lehneKvaAb('c1', 'zu teuer')).ok).toBe(false)
  })

  it('kein Ownership -> ok:false', async () => {
    h.claim = null
    const { lehneKvaAb } = await import('../kva-kunde-actions')
    expect((await lehneKvaAb('fremd')).ok).toBe(false)
  })

  it('Erfolg -> ok:true + kva_abgelehnt_am/grund gesetzt + Freigabe genullt', async () => {
    const { lehneKvaAb } = await import('../kva-kunde-actions')
    const r = await lehneKvaAb('c1', '  zu teuer  ')
    expect(r.ok).toBe(true)
    expect(h.updateArg).toMatchObject({ kva_abgelehnt_grund: 'zu teuer', reparatur_freigegeben_am: null })
    expect(typeof (h.updateArg as Record<string, unknown>).kva_abgelehnt_am).toBe('string')
  })

  it('leerer Grund -> null', async () => {
    const { lehneKvaAb } = await import('../kva-kunde-actions')
    await lehneKvaAb('c1', '   ')
    expect((h.updateArg as Record<string, unknown>).kva_abgelehnt_grund).toBeNull()
  })
})
