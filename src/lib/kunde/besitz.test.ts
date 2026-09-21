import { describe, it, expect, vi } from 'vitest'
import { passtKontaktZuLead, kundeBesitztLead } from './besitz'

describe('passtKontaktZuLead', () => {
  it('E-Mail gleich (case-insensitiv, getrimmt) → true', () => {
    expect(passtKontaktZuLead({ id: 'u', email: ' A@B.de ' }, { email: 'a@b.de' })).toBe(true)
  })

  it('beide E-Mails NULL → NIE true (Wildcard-Falle aus lead?.email !== user.email)', () => {
    expect(passtKontaktZuLead({ id: 'u', email: null, phone: null }, { email: null, telefon: null })).toBe(false)
  })

  it('beide E-Mails leer ("") → false', () => {
    expect(passtKontaktZuLead({ id: 'u', email: '' }, { email: '' })).toBe(false)
  })

  it('Telefon-Suffix (9 Ziffern) gleich → true, auch bei Formatunterschied', () => {
    expect(
      passtKontaktZuLead({ id: 'u', phone: '4915178429156' }, { telefon: '0151 7842 9156', telefon_ziffern: '015178429156' }),
    ).toBe(true)
  })

  it('Telefon verschieden → false', () => {
    expect(passtKontaktZuLead({ id: 'u', phone: '4915178429156' }, { telefon_ziffern: '015178429157' })).toBe(false)
  })

  it('User ohne E-Mail und Telefon → false, egal was der Lead hat', () => {
    expect(passtKontaktZuLead({ id: 'u' }, { email: 'x@y.de', telefon: '0151 7842 9156' })).toBe(false)
  })

  it('User mit Telefon, Lead nur mit E-Mail → false', () => {
    expect(passtKontaktZuLead({ id: 'u', phone: '4915178429156' }, { email: 'x@y.de', telefon: null })).toBe(false)
  })
})

describe('kundeBesitztLead', () => {
  function adminMit(lead: Record<string, unknown> | null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: lead, error: null })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    return { admin: { from } as never, from, select, eq }
  }

  it('liest den Lead ueber den Admin-Client und vergleicht per Telefon', async () => {
    const { admin, from, select, eq } = adminMit({ email: null, telefon: '0151 7842 9156', telefon_ziffern: '015178429156' })
    await expect(kundeBesitztLead(admin, { id: 'u', email: null, phone: '4915178429156' }, 'lead-1')).resolves.toBe(true)
    expect(from).toHaveBeenCalledWith('leads')
    expect(select).toHaveBeenCalledWith('email, telefon, telefon_ziffern')
    expect(eq).toHaveBeenCalledWith('id', 'lead-1')
  })

  it('Lead nicht gefunden → false', async () => {
    const { admin } = adminMit(null)
    await expect(kundeBesitztLead(admin, { id: 'u', email: 'a@b.de' }, 'lead-x')).resolves.toBe(false)
  })

  it('Lead ohne E-Mail, User ohne Telefon → false (kein NULL-Treffer)', async () => {
    const { admin } = adminMit({ email: null, telefon: null, telefon_ziffern: null })
    await expect(kundeBesitztLead(admin, { id: 'u', email: null, phone: null }, 'lead-1')).resolves.toBe(false)
  })
})
