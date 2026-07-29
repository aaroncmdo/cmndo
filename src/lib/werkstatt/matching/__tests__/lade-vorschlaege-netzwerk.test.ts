// P2-T6 Wire-Test (Stack B): die relationale Partition laeuft als ALLERLETZTER Schritt in
// ladeWerkstattVorschlaege — Freund-Werkstatt floatet nach oben, ohne Owner unveraendert.
import { describe, it, expect, vi } from 'vitest'

let werkstattRows: unknown[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const make = (table: string) => {
      const c: any = {}
      c.select = () => c
      c.eq = () => c
      c.maybeSingle = () => Promise.resolve({ data: null, error: null })
      c.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === 'werkstaetten' ? werkstattRows : [], error: null }).then(res)
      return c
    }
    return { from: (t: string) => make(t) } as any
  },
}))
vi.mock('@/lib/netzwerk/freunde', () => ({
  ladeFreundKandidatIds: vi.fn(async () => new Set<string>()),
}))

import { ladeWerkstattVorschlaege } from '../lade-vorschlaege'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'

// Voll qualifizierte Kandidaten: faehigkeiten decken den Bedarf -> passt=true (Partition-Eingang).
const kandidat = (id: string) => ({
  id,
  name: `Werkstatt ${id}`,
  adresse_strasse: null,
  adresse_plz: null,
  adresse_ort: null,
  telefon: null,
  lat: null,
  lng: null,
  status: 'aktiv',
  faehigkeiten: ['karosserie'],
  verifiziert: true,
  marken: null,
  ist_freie_werkstatt: true,
  fahrzeug_gruppen: null,
  google_rating: null,
  google_review_count: null,
  email: null,
})

const basisInput = {
  fahrzeugklasse: null,
  marke: null,
  bedarf: ['karosserie'],
  bedarfConfidence: 40,
  anker: null,
}

describe('ladeWerkstattVorschlaege — Netzwerk-Partition (Stack B)', () => {
  it('mit ownerProfilId: Freund-Werkstatt floatet an Position 0 mit imNetzwerk=true', async () => {
    werkstattRows = [kandidat('w1'), kandidat('w2'), kandidat('w3')]
    vi.mocked(ladeFreundKandidatIds).mockResolvedValueOnce(new Set(['w2']))

    const res = await ladeWerkstattVorschlaege({ ...basisInput, ownerProfilId: 'owner-1' })

    expect(res.map((v) => v.id)).toEqual(['w2', 'w1', 'w3'])
    expect(res[0].imNetzwerk).toBe(true)
    expect(res[1].imNetzwerk).toBeUndefined()
    expect(ladeFreundKandidatIds).toHaveBeenCalledTimes(1) // K10: EIN Batch pro Aufruf
  })

  it('ohne ownerProfilId: Reihenfolge unveraendert, kein Freund-Read', async () => {
    werkstattRows = [kandidat('w1'), kandidat('w2'), kandidat('w3')]
    vi.mocked(ladeFreundKandidatIds).mockClear()

    const res = await ladeWerkstattVorschlaege(basisInput)

    expect(res.map((v) => v.id)).toEqual(['w1', 'w2', 'w3'])
    expect(res.every((v) => v.imNetzwerk === undefined)).toBe(true)
    expect(ladeFreundKandidatIds).not.toHaveBeenCalled()
  })

  it('Owner ohne Freunde (leeres Set): Reihenfolge unveraendert (No-op)', async () => {
    werkstattRows = [kandidat('w1'), kandidat('w2')]
    vi.mocked(ladeFreundKandidatIds).mockResolvedValueOnce(new Set())

    const res = await ladeWerkstattVorschlaege({ ...basisInput, ownerProfilId: 'owner-1' })

    expect(res.map((v) => v.id)).toEqual(['w1', 'w2'])
  })
})
