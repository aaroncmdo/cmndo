import { describe, it, expect } from 'vitest'
import { buildSummary, buildDescription, resolveTerminKontext, type KontextFelder } from '../kalender-kontext'

const LEER: KontextFelder = {
  claimNummer: null, fahrzeugHersteller: null, fahrzeugModell: null, kennzeichen: null,
  kundeName: null, kundeTelefon: null, schadenortAdresse: null, fallId: null,
}

describe('buildSummary', () => {
  it('Fahrzeug + Kennzeichen + Ort + Claim-Nr', () => {
    const s = buildSummary({ ...LEER, fahrzeugHersteller: 'VW', fahrzeugModell: 'Golf', kennzeichen: 'K-AB 123', claimNummer: 'CL-1' }, 'Domkloster 4, Köln')
    expect(s).toBe('VW Golf (K-AB 123) — Domkloster 4, Köln · CL-1')
  })
  it('Fallback Schadenbesichtigung ohne Fahrzeug', () => {
    expect(buildSummary(LEER, null)).toBe('Schadenbesichtigung')
  })
})

describe('buildDescription', () => {
  it('enthält Kunde/Telefon/Adresse + Fallakte-Link nur bei fallId', () => {
    const d = buildDescription({ ...LEER, kundeName: 'Max M', kundeTelefon: '0151', fallId: 'f1' }, 'Köln', 'https://app.test')
    expect(d).toContain('Kunde: Max M')
    expect(d).toContain('Telefon: 0151')
    expect(d).toContain('Adresse: Köln')
    expect(d).toContain('Fallakte: https://app.test/gutachter/fall/f1')
  })
  it('kein Fallakte-Link ohne fallId (Lead-bezug)', () => {
    expect(buildDescription(LEER, null, 'https://app.test')).not.toContain('Fallakte:')
  })
})

describe('resolveTerminKontext', () => {
  // Stub-db: pro Tabelle eine konfigurierte maybeSingle-Antwort.
  function stubDb(rows: Record<string, unknown>) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: function () { return this },
          maybeSingle: async () => ({ data: rows[table] ?? null }),
        }),
      }),
    } as unknown as Parameters<typeof resolveTerminKontext>[1]
  }

  it('lead-bezug → Felder + Location aus termin.besichtigungsort_adresse', async () => {
    const db = stubDb({ leads: { vorname: 'Max', nachname: 'M', telefon: '0151', kennzeichen: 'K-AB 1', fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf', besichtigungsort_adresse: 'Lead-Ort' } })
    const k = await resolveTerminKontext({ bezug_typ: 'lead', bezug_id: 'l1', besichtigungsort_adresse: 'Termin-Ort' }, db)
    expect(k.location).toBe('Termin-Ort')
    expect(k.summary).toContain('VW Golf')
    expect(k.description).toContain('Kunde: Max M')
  })

  it('kein bezug → generische Schadenbesichtigung', async () => {
    const db = stubDb({})
    const k = await resolveTerminKontext({ bezug_typ: null, bezug_id: null, besichtigungsort_adresse: null }, db)
    expect(k.summary).toBe('Schadenbesichtigung')
    expect(k.location).toBeUndefined()
  })
})
