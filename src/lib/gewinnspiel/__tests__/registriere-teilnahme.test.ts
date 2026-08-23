import { describe, it, expect, vi, beforeEach } from 'vitest'

// `server-only` wirft im vitest-node-Env schon beim Import. Etabliertes Muster
// im Repo (u.a. src/lib/api-v1/write-abuse-guard.test.ts).
vi.mock('server-only', () => ({}))

// Der Admin-Client wird als kleine Fake-Query-Kette gemockt. Sie bildet genau
// die drei Zugriffe ab, die registriereTeilnahme macht:
//   kampagnen  -> select().eq('aktiv').maybeSingle()
//   praemien   -> select().eq('id').eq('kampagne_id').eq('aktiv').maybeSingle()
//   teilnahmen -> insert().select().single()
const kampagneErgebnis = { wert: null as unknown }
const praemieErgebnis = { wert: null as unknown }
const insertMock = vi.fn()
const insertErgebnis = { wert: { data: { id: 'teilnahme-1' }, error: null } as unknown }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabelle: string) => {
      if (tabelle === 'gewinnspiel_kampagnen') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => kampagneErgebnis.wert }) }) }
      }
      if (tabelle === 'gewinnspiel_praemien') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ eq: () => ({ maybeSingle: async () => praemieErgebnis.wert }) }),
            }),
          }),
        }
      }
      return {
        insert: (werte: unknown) => {
          insertMock(werte)
          return { select: () => ({ single: async () => insertErgebnis.wert }) }
        },
      }
    },
  }),
}))

import { registriereTeilnahme } from '../registriere-teilnahme'

beforeEach(() => {
  insertMock.mockClear()
  kampagneErgebnis.wert = { data: { id: 'kampagne-1' }, error: null }
  praemieErgebnis.wert = { data: { id: 'praemie-1' }, error: null }
  insertErgebnis.wert = { data: { id: 'teilnahme-1' }, error: null }
})

describe('registriereTeilnahme', () => {
  it('legt eine Teilnahme fuer einen qualifizierten Lead an', async () => {
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-1' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
    })
    expect(r.ok).toBe(true)
    expect(r.teilnahmeId).toBe('teilnahme-1')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kampagne_id: 'kampagne-1',
        lead_id: 'lead-1',
        anfrage_id: null,
        telefon_normalisiert: '+491751234567',
        status: 'offen',
      }),
    )
  })

  it('ueberspringt nicht qualifizierte Leads ohne Insert', async () => {
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-2' },
      telefon: '0175 1234567',
      schuldfrage: 'eigenverantwortung',
    })
    expect(r.ok).toBe(true)
    expect(r.uebersprungen).toBe('kein_haftpflichtschaden')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('ueberspringt, wenn keine Kampagne aktiv ist', async () => {
    kampagneErgebnis.wert = { data: null, error: null }
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-3' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
    })
    expect(r.ok).toBe(true)
    expect(r.uebersprungen).toBe('keine_aktive_kampagne')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('setzt anfrage_id statt lead_id bei Finder-Anfragen', async () => {
    await registriereTeilnahme({
      quelle: { anfrageId: 'anfrage-1' },
      telefon: '0175 1234567',
      schuldEinschaetzung: 'unverschuldet',
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ anfrage_id: 'anfrage-1', lead_id: null }),
    )
  })

  it('uebernimmt eine gueltige Praemien-Wahl', async () => {
    await registriereTeilnahme({
      quelle: { leadId: 'lead-4' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
      praemieId: 'praemie-1',
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ gewaehlte_praemie_id: 'praemie-1' }),
    )
  })

  it('verwirft eine Praemie, die nicht zur aktiven Kampagne gehoert', async () => {
    // Fremde/inaktive Praemie -> Lookup liefert nichts.
    praemieErgebnis.wert = { data: null, error: null }
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-5' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
      praemieId: 'fremde-praemie',
    })
    // Die Teilnahme entsteht trotzdem — sie ist wichtiger als die Wahl.
    expect(r.ok).toBe(true)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ gewaehlte_praemie_id: null }),
    )
  })

  it('behandelt eine Dublette (23505) als uebersprungen, nicht als Fehler', async () => {
    insertErgebnis.wert = { data: null, error: { code: '23505', message: 'duplicate key' } }
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-6' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
    })
    expect(r.ok).toBe(true)
    expect(r.uebersprungen).toBe('bereits_teilgenommen')
  })

  it('meldet einen echten Insert-Fehler als nicht ok', async () => {
    insertErgebnis.wert = { data: null, error: { code: '42501', message: 'permission denied' } }
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-7' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('permission denied')
  })
})
