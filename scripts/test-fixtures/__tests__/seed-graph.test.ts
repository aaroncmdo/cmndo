import { describe, it, expect } from 'vitest'
import { Reporter } from '../lib'
import { ensureSeedGraph } from '../seed-graph'
import { CLAIMS, LEADS, PARTIES, AUFTRAEGE, PFLICHTDOK, KANZLEI_FALL_ID, SV_SACHVERSTAENDIGE_ID, ACCOUNTS } from '../ids'

// Fake-db: sammelt upsert-Rows je Tabelle.
function fakeDb() {
  const rows: Record<string, Record<string, unknown>[]> = {}
  const db = {
    from(table: string) {
      return {
        upsert: (row: Record<string, unknown>) => {
          ;(rows[table] ??= []).push(row)
          return Promise.resolve({ error: null })
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      }
    },
  }
  return { db: db as never, rows }
}

async function seed() {
  const { db, rows } = fakeDb()
  await ensureSeedGraph(db, { reporter: new Reporter() })
  return rows
}

describe('ensureSeedGraph', () => {
  it('C2: Claim @sv-termin, geschädigter=test-kunde, Auftrag mit angeforderter Stellungnahme (#3729)', async () => {
    const rows = await seed()
    expect((rows['claims'] ?? []).find((r) => r.id === CLAIMS.c2)).toMatchObject({
      operative_status: 'sv-termin',
      sv_id: SV_SACHVERSTAENDIGE_ID,
      lead_id: LEADS.c2,
      sa_unterschrieben: true,
    })
    expect((rows['claim_parties'] ?? []).find((r) => r.id === PARTIES.c2)).toMatchObject({
      claim_id: CLAIMS.c2,
      rolle: 'geschaedigter',
      user_id: ACCOUNTS.kunde,
      quelle: 'manuell_kb',
    })
    expect((rows['auftraege'] ?? []).find((r) => r.id === AUFTRAEGE.c2)).toMatchObject({
      claim_id: CLAIMS.c2,
      fall_id: CLAIMS.c2,
      sv_id: SV_SACHVERSTAENDIGE_ID,
      typ: 'erstgutachten',
      status: 'termin',
      technische_stellungnahme_status: 'beauftragt',
    })
  })

  it('C1: Claim @ersterfassung mit Makler-Attribution + 3 Pflichtdok-Slots', async () => {
    const rows = await seed()
    expect((rows['claims'] ?? []).find((r) => r.id === CLAIMS.c1)).toMatchObject({
      operative_status: 'ersterfassung',
    })
    const slots = (rows['pflichtdokumente'] ?? []).filter((r) => r.fall_id === CLAIMS.c1)
    expect(slots).toHaveLength(3)
    expect(slots.map((s) => s.dokument_typ).sort()).toEqual(['fahrzeugschein', 'schadensfotos', 'unfallfotos'])
    expect(slots.map((s) => s.id).sort()).toEqual(
      [PFLICHTDOK.fahrzeugschein, PFLICHTDOK.unfallfotos, PFLICHTDOK.schadensfotos].sort(),
    )
  })

  it('C3: Claim @kanzlei-uebergeben + kanzlei_faelle-Row', async () => {
    const rows = await seed()
    expect((rows['claims'] ?? []).find((r) => r.id === CLAIMS.c3)).toMatchObject({
      operative_status: 'kanzlei-uebergeben',
    })
    expect((rows['kanzlei_faelle'] ?? []).find((r) => r.id === KANZLEI_FALL_ID)).toMatchObject({
      claim_id: CLAIMS.c3,
      fall_id: CLAIMS.c3,
      status: 'versicherungskontakt',
    })
  })

  it('legt für alle 4 Stages einen geschädigten (test-kunde) + internen Lead an', async () => {
    const rows = await seed()
    expect((rows['claim_parties'] ?? []).filter((r) => r.rolle === 'geschaedigter' && r.user_id === ACCOUNTS.kunde)).toHaveLength(4)
    expect((rows['leads'] ?? [])).toHaveLength(4)
    expect((rows['leads'] ?? []).every((l) => String(l.email).endsWith('@claimondo.de'))).toBe(true)
  })

  it('C4 (KB-Fixture): Auftrag technische_stellungnahme_status=null + kanzlei_faelle vs_kuerzungs_typ=technisch', async () => {
    const rows = await seed()
    expect((rows['auftraege'] ?? []).find((r) => r.id === AUFTRAEGE.c4)).toMatchObject({
      claim_id: CLAIMS.c4,
      technische_stellungnahme_status: null,
    })
    expect((rows['kanzlei_faelle'] ?? []).find((r) => r.claim_id === CLAIMS.c4)).toMatchObject({
      vs_reaktion_typ: 'gekuerzt',
      vs_kuerzungs_typ: 'technisch',
    })
  })
})
