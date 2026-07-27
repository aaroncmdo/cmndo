// Fokus-Tests fuer den werkstatt-Case von anlegePartnerKern: Frei-Flag + faehigkeiten-
// Durchreichung (Werkstatt-Finder-Embed-Befund 27.07.: Anlage-Pfade liessen
// ist_freie_werkstatt=null und fragten keine Gewerke ab -> neue Werkstaetten ranken
// schlechter / wirken "nicht frei"). Der Admin-Client kommt als Parameter -> Fake-Objekt,
// kein Modul-Mock der Supabase-Chain noetig.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/partner/standard-staffel', () => ({
  setzeStandardStaffel: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/auth/phone-login', () => ({
  enablePhoneLogin: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/sv-basic/claim-eligibility', () => ({
  buildSvInsertAusLead: vi.fn().mockReturnValue({}),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { anlegePartnerKern, type PartnerAnlageInput } from '../anlege-partner'

const captured = { werkstatt: null as Record<string, unknown> | null }

function makeAdmin(): Parameters<typeof anlegePartnerKern>[0] {
  return {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'werkstaetten') {
        return {
          insert: (payload: Record<string, unknown>) => {
            captured.werkstatt = payload
            return {
              select: () => ({
                single: vi.fn().mockResolvedValue({ data: { id: 'w-1' }, error: null }),
              }),
            }
          },
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    },
  } as unknown as Parameters<typeof anlegePartnerKern>[0]
}

function input(rollenDetails: Record<string, unknown> = {}): PartnerAnlageInput {
  return {
    firma: 'KFZ Muster GmbH',
    ansprechpartnerVorname: 'Max',
    ansprechpartnerNachname: 'Mustermann',
    email: 'info@kfz-muster.de',
    telefon: '022112345',
    plz: '50667',
    ort: 'Köln',
    lat: 50.94,
    lng: 6.96,
    aktiviertVon: null,
    rollenDetails,
  }
}

beforeEach(() => {
  captured.werkstatt = null
})

describe('anlegePartnerKern (werkstatt)', () => {
  it('setzt ist_freie_werkstatt=true (Anlage ohne Marken-Abfrage = markenoffen)', async () => {
    const res = await anlegePartnerKern(makeAdmin(), 'werkstatt', input())
    expect(res.ok).toBe(true)
    expect(captured.werkstatt).toMatchObject({ ist_freie_werkstatt: true, status: 'aktiv' })
  })

  it('reicht rollenDetails.faehigkeiten in den Insert durch (nur nicht-leere Strings)', async () => {
    const res = await anlegePartnerKern(
      makeAdmin(),
      'werkstatt',
      input({ faehigkeiten: ['karosserie', '  ', 'glas', 42] }),
    )
    expect(res.ok).toBe(true)
    expect(captured.werkstatt?.faehigkeiten).toEqual(['karosserie', 'glas'])
  })

  it('ohne faehigkeiten-Detail bleibt der Insert ohne faehigkeiten-Key (DB-Default)', async () => {
    const res = await anlegePartnerKern(makeAdmin(), 'werkstatt', input())
    expect(res.ok).toBe(true)
    expect(captured.werkstatt).not.toBeNull()
    expect('faehigkeiten' in (captured.werkstatt as object)).toBe(false)
  })
})
