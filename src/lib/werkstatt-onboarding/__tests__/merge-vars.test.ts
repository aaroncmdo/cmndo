// Werkstatt-Onboarding-Drip — buildWerkstattMergeVars: SV-Aufloesung NUR bei
// sv_vorstellung, ueber die leak-sichere planeTerminOeffentlich (AAR-941
// Self-Service-Matching-Modul, s. AGENTS.md SV-Resolver-Override). KEIN
// findeBestePerson/toOeffentlichesSvProfil-Adapter (Brief-Entwurf war hier falsch).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sv-matching-modul', () => ({ planeTerminOeffentlich: vi.fn() }))

import { planeTerminOeffentlich } from '@/lib/sv-matching-modul'
import { buildWerkstattMergeVars } from '../merge-vars'

const wk = { id: 'w1', name: 'Muster GmbH', adresse_ort: 'Köln', lat: 50.9, lng: 6.9 }
const config = { ansprechpartner: 'Nicolas', tel: '+49 170', portalBaseUrl: 'https://app.claimondo.de' }

function svProfil(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    svId: 'sv1',
    vorname: 'Kelvin',
    profilbild: 'https://cdn.example/kelvin.jpg',
    profilbeschreibung: null,
    bewertungDurchschnitt: null,
    bewertungAnzahl: null,
    bewertungAktualisiert: null,
    distanzGerundet: 'ca. 10 km',
    istWunschterminFrei: false,
    istTopPartner: false,
    rang: null,
    rangSinnsatz: null,
    slots: [],
    ...overrides,
  }
}

describe('buildWerkstattMergeVars', () => {
  beforeEach(() => {
    vi.mocked(planeTerminOeffentlich).mockReset()
  })

  it('loest SV NUR bei sv_vorstellung auf', async () => {
    vi.mocked(planeTerminOeffentlich).mockResolvedValue([svProfil()])

    const nutzen = await buildWerkstattMergeVars({ db: {} as never, werkstatt: wk, templateKey: 'nutzen', config })
    expect(nutzen.sv).toBeUndefined()
    expect(planeTerminOeffentlich).not.toHaveBeenCalled()

    const sv = await buildWerkstattMergeVars({ db: {} as never, werkstatt: wk, templateKey: 'sv_vorstellung', config })
    expect(planeTerminOeffentlich).toHaveBeenCalledWith({ lat: 50.9, lng: 6.9 })
    expect(sv.sv?.name).toBe('Kelvin') // name === vorname
    expect(sv.sv?.region).toBe('Köln') // region === werkstatt.adresse_ort
    expect(sv.werkstattName).toBe('Muster GmbH')
    expect(sv.sv?.photoUrl).toBe('https://cdn.example/kelvin.jpg')
    expect(sv.sv?.contact).toBe('')
  })

  it('sv=null wenn der Resolver leer liefert', async () => {
    vi.mocked(planeTerminOeffentlich).mockResolvedValue([])
    const sv = await buildWerkstattMergeVars({ db: {} as never, werkstatt: wk, templateKey: 'sv_vorstellung', config })
    expect(sv.sv).toBeNull()
  })

  it('sv=null + KEIN Resolver-Call wenn lat/lng fehlen', async () => {
    const wkOhneGeo = { ...wk, lat: null, lng: null }
    const sv = await buildWerkstattMergeVars({ db: {} as never, werkstatt: wkOhneGeo, templateKey: 'sv_vorstellung', config })
    expect(sv.sv).toBeNull()
    expect(planeTerminOeffentlich).not.toHaveBeenCalled()
  })

  it('region faellt auf "deiner Region" zurueck ohne adresse_ort', async () => {
    vi.mocked(planeTerminOeffentlich).mockResolvedValue([svProfil()])
    const wkOhneOrt = { ...wk, adresse_ort: null }
    const sv = await buildWerkstattMergeVars({ db: {} as never, werkstatt: wkOhneOrt, templateKey: 'sv_vorstellung', config })
    expect(sv.sv?.region).toBe('deiner Region')
  })

  it('setzt die statischen Merge-Vars aus config/werkstatt', async () => {
    const willkommen = await buildWerkstattMergeVars({ db: {} as never, werkstatt: wk, templateKey: 'willkommen', config })
    expect(willkommen).toEqual({
      werkstattName: 'Muster GmbH',
      ansprechpartner: 'Nicolas',
      tel: '+49 170',
      portalLink: 'https://app.claimondo.de/werkstatt',
    })
  })
})
