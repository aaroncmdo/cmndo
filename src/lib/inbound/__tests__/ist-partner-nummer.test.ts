import { describe, it, expect } from 'vitest'
import { istPartnerNummer } from '../ist-partner-nummer'

/**
 * Minimaler Supabase-Chain-Mock. Liefert je Tabelle das konfigurierte Ergebnis.
 * Die Kette (.select().neq().ilike().limit()) gibt sich selbst zurueck und ist
 * am Ende awaitbar — genau die Form, die der Helper aufruft.
 */
function mockDb(
  proTabelle: Record<string, { data?: unknown[]; error?: { message: string } }>,
) {
  const gerufeneFilter: Record<string, string[]> = {}
  return {
    gerufeneFilter,
    client: {
      from(table: string) {
        const ergebnis = proTabelle[table] ?? { data: [] }
        const kette = {
          select: () => kette,
          neq: (spalte: string) => {
            ;(gerufeneFilter[table] ??= []).push(`neq:${spalte}`)
            return kette
          },
          ilike: (spalte: string, wert: string) => {
            ;(gerufeneFilter[table] ??= []).push(`ilike:${spalte}=${wert}`)
            return kette
          },
          limit: () => Promise.resolve({ data: ergebnis.data ?? [], error: ergebnis.error ?? null }),
        }
        return kette
      },
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const alsDb = (m: ReturnType<typeof mockDb>) => m.client as any

describe('istPartnerNummer', () => {
  it('erkennt einen Sachverstaendigen ueber sein Profil', async () => {
    const m = mockDb({ profiles: { data: [{ rolle: 'sachverstaendiger', vorname: 'Gaith', nachname: 'Hamed' }] } })
    const r = await istPartnerNummer(alsDb(m), '+491735633541')
    expect(r.istPartner).toBe(true)
    expect(r.quelle).toBe('profil')
    expect(r.bezeichnung).toBe('sachverstaendiger Gaith Hamed')
  })

  it('behandelt eine unbekannte Nummer NICHT als Partner', async () => {
    const m = mockDb({})
    const r = await istPartnerNummer(alsDb(m), '+491701234567')
    expect(r).toEqual({ istPartner: false, quelle: null, bezeichnung: null })
  })

  it('erkennt eine Werkstatt ohne User-Account', async () => {
    const m = mockDb({ werkstaetten: { data: [{ name: 'Karosserie Mustermann' }] } })
    const r = await istPartnerNummer(alsDb(m), '+4915112345678')
    expect(r.istPartner).toBe(true)
    expect(r.quelle).toBe('werkstatt')
    expect(r.bezeichnung).toBe('Karosserie Mustermann')
  })

  it('erkennt einen Makler ueber die Firma', async () => {
    const m = mockDb({ makler: { data: [{ firma: 'Assekuranz Meier' }] } })
    const r = await istPartnerNummer(alsDb(m), '+4915112345678')
    expect(r.quelle).toBe('makler')
    expect(r.bezeichnung).toBe('Assekuranz Meier')
  })

  it('schliesst Kunden aus — die profiles-Query filtert rolle != kunde', async () => {
    const m = mockDb({})
    await istPartnerNummer(alsDb(m), '+491633628571')
    expect(m.gerufeneFilter.profiles).toContain('neq:rolle')
  })

  it('matcht auf die letzten 9 Ziffern (wie matchInboundToFall)', async () => {
    const m = mockDb({})
    await istPartnerNummer(alsDb(m), '+49 173 5633541')
    expect(m.gerufeneFilter.profiles?.[1]).toBe('ilike:telefon=%735633541%')
  })

  it('zu kurze Nummer -> kein Partner, keine Query', async () => {
    const m = mockDb({})
    const r = await istPartnerNummer(alsDb(m), '1234')
    expect(r.istPartner).toBe(false)
    expect(Object.keys(m.gerufeneFilter)).toHaveLength(0)
  })

  it('bei DB-Fehler sicherheitshalber als Partner behandeln (kein Lead)', async () => {
    const m = mockDb({ profiles: { error: { message: 'connection lost' } } })
    const r = await istPartnerNummer(alsDb(m), '+491735633541')
    expect(r.istPartner).toBe(true)
    expect(r.quelle).toBeNull()
  })
})
