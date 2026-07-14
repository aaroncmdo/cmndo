import { describe, it, expect, vi, beforeEach } from 'vitest'

const versicherung = {
  value: null as null | {
    id: string
    name: string
    schaden_email: string | null
    schaden_telefon: string | null
    bafin_nummer: string | null
  },
}

vi.mock('@/lib/versicherungen/search-actions', () => ({
  getVersicherungById: async () => versicherung.value,
}))

beforeEach(() => {
  versicherung.value = null
})

describe('resolveVsEmpfaenger', () => {
  it('kann senden, wenn Versicherung + schaden_email da sind', async () => {
    versicherung.value = {
      id: 'v1',
      name: 'Allianz Versicherungs-AG',
      schaden_email: 'sachschaden@allianz.de',
      schaden_telefon: null,
      bafin_nummer: null,
    }
    const { resolveVsEmpfaenger } = await import('../empfaenger')

    expect(await resolveVsEmpfaenger('v1')).toEqual({
      kann: true,
      versicherungId: 'v1',
      name: 'Allianz Versicherungs-AG',
      email: 'sachschaden@allianz.de',
    })
  })

  it('keine Versicherung gewaehlt -> Task-Grund keine_versicherung (KEIN Send)', async () => {
    const { resolveVsEmpfaenger } = await import('../empfaenger')
    expect(await resolveVsEmpfaenger(null)).toEqual({ kann: false, grund: 'keine_versicherung' })
  })

  it('Versicherer ohne schaden_email -> Task-Grund keine_schaden_email, Name bleibt erhalten', async () => {
    versicherung.value = {
      id: 'v2',
      name: 'ADLER Versicherung AG',
      schaden_email: null,
      schaden_telefon: null,
      bafin_nummer: null,
    }
    const { resolveVsEmpfaenger } = await import('../empfaenger')

    expect(await resolveVsEmpfaenger('v2')).toEqual({
      kann: false,
      grund: 'keine_schaden_email',
      versicherungName: 'ADLER Versicherung AG',
    })
  })

  it('leere schaden_email zaehlt wie keine', async () => {
    versicherung.value = { id: 'v3', name: 'X', schaden_email: '   ', schaden_telefon: null, bafin_nummer: null }
    const { resolveVsEmpfaenger } = await import('../empfaenger')
    expect((await resolveVsEmpfaenger('v3')).kann).toBe(false)
  })

  it('unbekannte ID -> keine_versicherung', async () => {
    const { resolveVsEmpfaenger } = await import('../empfaenger')
    expect(await resolveVsEmpfaenger('gibts-nicht')).toEqual({ kann: false, grund: 'keine_versicherung' })
  })
})
