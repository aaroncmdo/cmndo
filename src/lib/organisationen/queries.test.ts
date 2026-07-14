import { describe, it, expect, vi, beforeEach } from 'vitest'

// Repo-Idiom (siehe lib/community/actions.test.ts): supabase/server wird gemockt.
// Der Query-Builder ist chainable UND thenable — `.eq()` ohne `.single()` wird
// direkt awaited (Listen-Query), `.single()/.maybeSingle()` terminieren.
type Result = { data: unknown; error: unknown }

function makeQuery(result: Result) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => q
  q.single = async () => result
  q.maybeSingle = async () => result
  // thenable: `await supabase.from(x).select(y).eq(z)` liefert das Result
  q.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve)
  return q
}

const from = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from }),
}))

import { getOrganisationDetail, getOrganisationMitglieder } from './queries'

const ORG_ROW = {
  id: 'o1',
  name: 'Muster Büro GmbH',
  typ: 'buero',
  rechtsform: 'GmbH',
  onboarding_status: 'aktiv',
  anschrift: 'Musterweg 1',
  standort_adresse: 'Musterweg 1, 10115 Berlin',
  standort_plz: '10115',
  steuernummer: '12/345/67890',
  ust_id: 'DE123456789',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  parent_stripe_customer_id: 'cus_1',
  parent_stripe_default_pm_id: null,
  vertrag_unterzeichnet_id: null,
  akademie_erst_anzahlung_eur: null,
  akademie_max_faelle_monat: null,
  akademie_radius_km: null,
  use_custom_branding: true,
  brand_primary: '#123456',
  brand_secondary: null,
  brand_accent: null,
  brand_extracted_at: null,
  logo_url: null,
  hauptansprechpartner_user_id: 'u1',
}

beforeEach(() => from.mockReset())

describe('getOrganisationDetail', () => {
  it('liefert ok:false wenn die Org-Query fehlschlaegt', async () => {
    from.mockImplementation(() => makeQuery({ data: null, error: { message: 'boom' } }))
    const res = await getOrganisationDetail('o1')
    expect(res).toEqual({ ok: false, error: 'boom' })
  })

  it('liefert ok:false wenn die Org nicht existiert', async () => {
    from.mockImplementation(() => makeQuery({ data: null, error: null }))
    const res = await getOrganisationDetail('nope')
    expect(res.ok).toBe(false)
  })

  it('mappt die Org und laedt den Verwalter separat (kein FK-Embed-Raten)', async () => {
    from
      .mockReturnValueOnce(makeQuery({ data: ORG_ROW, error: null })) // organisationen
      .mockReturnValueOnce(
        makeQuery({
          data: { id: 'u1', vorname: 'Anna', nachname: 'Admin', email: 'a@b.de' },
          error: null,
        }),
      ) // profiles

    const res = await getOrganisationDetail('o1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.name).toBe('Muster Büro GmbH')
    expect(res.data.useCustomBranding).toBe(true)
    expect(res.data.brandPrimary).toBe('#123456')
    expect(res.data.stripeCustomerId).toBe('cus_1')
    expect(res.data.verwalter).toEqual({
      id: 'u1',
      vorname: 'Anna',
      nachname: 'Admin',
      email: 'a@b.de',
    })
    // Genau zwei Tabellen, in dieser Reihenfolge — KEIN FK-Embed auf profiles.
    expect(from.mock.calls.map((c) => c[0])).toEqual(['organisationen', 'profiles'])
  })

  it('verwalter=null wenn kein hauptansprechpartner gesetzt ist (profiles wird nicht gequeryt)', async () => {
    from.mockReturnValueOnce(
      makeQuery({ data: { ...ORG_ROW, hauptansprechpartner_user_id: null }, error: null }),
    )

    const res = await getOrganisationDetail('o1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.verwalter).toBeNull()
    // profiles darf gar nicht erst gequeryt worden sein (spart die Query).
    expect(from.mock.calls.map((c) => c[0])).toEqual(['organisationen'])
  })
})

describe('getOrganisationMitglieder', () => {
  // AGENTS.md: Supabase liefert nested FKs je nach Cardinality als Array ODER Objekt
  // -> IMMER mit Array.isArray(x) ? x[0] : x normalisieren. Genau das prueft dieser Test.
  it('normalisiert das nested profiles-Embed wenn es als ARRAY kommt', async () => {
    from.mockImplementation(() =>
      makeQuery({
        data: [
          {
            id: 'sv1',
            paket: 'pro',
            ist_aktiv: true,
            verifiziert: true,
            profiles: [{ vorname: 'Max', nachname: 'Muster', email: 'm@x.de' }],
          },
        ],
        error: null,
      }),
    )

    const rows = await getOrganisationMitglieder('o1')
    expect(rows).toHaveLength(1)
    expect(rows[0].vorname).toBe('Max')
    expect(rows[0].email).toBe('m@x.de')
  })

  it('normalisiert das nested profiles-Embed wenn es als OBJEKT kommt', async () => {
    from.mockImplementation(() =>
      makeQuery({
        data: [
          {
            id: 'sv1',
            paket: null,
            ist_aktiv: false,
            verifiziert: false,
            profiles: { vorname: 'Erika', nachname: 'Beispiel', email: 'e@b.de' },
          },
        ],
        error: null,
      }),
    )

    const rows = await getOrganisationMitglieder('o1')
    expect(rows[0].nachname).toBe('Beispiel')
    expect(rows[0].istAktiv).toBe(false)
  })

  it('liefert [] bei Fehler (Liste soll nicht crashen)', async () => {
    from.mockImplementation(() => makeQuery({ data: null, error: { message: 'boom' } }))
    expect(await getOrganisationMitglieder('o1')).toEqual([])
  })
})
