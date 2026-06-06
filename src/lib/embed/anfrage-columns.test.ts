import { describe, it, expect } from 'vitest'
import { buildAnfrageColumns, splitName } from './anfrage-columns'

const base = { name: 'Max Mustermann', telefon: '0151 1', source: 'sv_embed' as const }

describe('splitName', () => {
  it('teilt Vor-/Nachname', () => expect(splitName('Max Mustermann')).toEqual({ vorname: 'Max', nachname: 'Mustermann' }))
  it('nur Vorname → leerer Nachname', () => expect(splitName('Max')).toEqual({ vorname: 'Max', nachname: '' }))
})

describe('buildAnfrageColumns — Monika-A-Flow', () => {
  it('mappt die 6 Diskriminatoren', () => {
    const c = buildAnfrageColumns({
      payload: {
        ...base,
        anliegen: 'haftpflichtgutachten',
        unfalltyp: 'auffahrunfall',
        schuld_einschaetzung: 'unverschuldet',
        wunsch_tag: 'morgen',
        wunsch_zeit: 'vormittag',
      },
      variante: 'A',
      embedSiteId: 'site-1',
      originDomain: 'example.de',
    })
    expect(c.anliegen).toBe('haftpflichtgutachten')
    expect(c.unfalltyp).toBe('auffahrunfall')
    expect(c.schuld_einschaetzung).toBe('unverschuldet')
    expect(c.wunsch_tag).toBe('morgen')
    expect(c.wunsch_zeit).toBe('vormittag')
  })

  it('komponiert wunschtermin_wann aus tag+zeit (menschenlesbar)', () => {
    const c = buildAnfrageColumns({
      payload: { ...base, wunsch_tag: 'morgen', wunsch_zeit: 'vormittag' },
      variante: 'A',
      embedSiteId: null,
      originDomain: null,
    })
    expect(c.wunschtermin_wann).toBe('Morgen, Vormittag')
  })

  it('Variante A → status embed_free; Cluster (null) → neu', () => {
    expect(
      buildAnfrageColumns({ payload: { ...base, source: 'kfz_gutachter_lp' }, variante: null, embedSiteId: null, originDomain: null }).status,
    ).toBe('neu')
    expect(buildAnfrageColumns({ payload: base, variante: 'A', embedSiteId: null, originDomain: null }).status).toBe('embed_free')
  })

  it('NOT-NULL-Defaults bleiben (email/schadentyp nie null)', () => {
    const c = buildAnfrageColumns({ payload: base, variante: 'A', embedSiteId: null, originDomain: null })
    expect(c.email).toBe('')
    expect(c.schadentyp).toBe('unbekannt')
  })
})
