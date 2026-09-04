import { describe, it, expect } from 'vitest'
import { findeSchalter, hatFallback, wirdGesetzt, scanne, diffBaseline } from './stumme-waechter-scan.mjs'

const spec = (inhalt) => [{ datei: 'tests/e2e/flows/x.spec.ts', inhalt }]

describe('findeSchalter', () => {
  it('findet einen RUN_-Schalter ohne Fallback', () => {
    expect(findeSchalter("test.skip(!process.env.RUN_X_SMOKE, 'set RUN_X_SMOKE=1')")).toEqual(['RUN_X_SMOKE'])
  })

  it('faengt Ziffern im Namen — RUN_CMM65_SMOKE darf nicht zu RUN_CMM verstuemmelt werden', () => {
    // Genau dieser Fehler ist beim ersten Zaehlen passiert: [A-Z_]+ bricht an der 6 ab,
    // und der Teilstring RUN_CMM traf danach faelschlich in ci.yml.
    expect(findeSchalter('const R = process.env.RUN_CMM65_SMOKE')).toEqual(['RUN_CMM65_SMOKE'])
  })

  it('ignoriert einen Schalter MIT ??-Fallback (der Test laeuft auch ohne)', () => {
    expect(findeSchalter("const r = process.env.RUN_X ?? '1'")).toEqual([])
  })

  it('ignoriert einen Schalter MIT ||-Fallback', () => {
    expect(findeSchalter("const r = process.env.RUN_X || '1'")).toEqual([])
  })

  it('ignoriert Nicht-RUN-Variablen (TEST_*/SMOKE_* sind keine Opt-in-Schalter)', () => {
    expect(findeSchalter('process.env.TEST_KB_PASSWORD; process.env.SMOKE_APP_URL')).toEqual([])
  })

  it('meldet jeden Schalter nur einmal, auch bei mehreren Vorkommen', () => {
    expect(findeSchalter('process.env.RUN_X; process.env.RUN_X; process.env.RUN_X')).toEqual(['RUN_X'])
  })

  it('respektiert den Skip-Marker', () => {
    expect(findeSchalter('// stumme-waechter-skip: laeuft nur manuell\nprocess.env.RUN_X')).toEqual([])
  })

  it('findet mehrere verschiedene Schalter in einem File', () => {
    expect(findeSchalter('process.env.RUN_A; process.env.RUN_B').sort()).toEqual(['RUN_A', 'RUN_B'])
  })
})

describe('hatFallback', () => {
  it('erkennt ?? und ||, auch mit Leerraum', () => {
    expect(hatFallback("process.env.RUN_X ?? '1'", 'RUN_X')).toBe(true)
    expect(hatFallback('process.env.RUN_X||1', 'RUN_X')).toBe(true)
  })

  it('meldet keinen Fallback bei blosser Referenz', () => {
    expect(hatFallback('process.env.RUN_X', 'RUN_X')).toBe(false)
  })
})

describe('wirdGesetzt', () => {
  it('trifft wortgenau', () => {
    expect(wirdGesetzt('RUN_X', ['env:\n  RUN_X: 1'])).toBe(true)
  })

  it('⭐ zaehlt einen TEILSTRING NICHT als gesetzt', () => {
    // RUN_CMM65_SMOKE enthaelt RUN_CMM — ohne Wortgrenze meldet der Check den Waechter
    // faelschlich als aktiv. Das ist die teuerste Variante: sie VERSTECKT einen Verstoss.
    expect(wirdGesetzt('RUN_CMM', ['env:\n  RUN_CMM65_SMOKE: 1'])).toBe(false)
  })

  it('durchsucht alle uebergebenen Workflows, nicht nur den ersten', () => {
    expect(wirdGesetzt('RUN_X', ['nichts hier', 'env:\n  RUN_X: 1'])).toBe(true)
  })
})

describe('scanne', () => {
  it('meldet einen Schalter, den kein Workflow setzt', () => {
    expect(scanne(spec('process.env.RUN_X'), ['leer'])).toEqual([
      { datei: 'tests/e2e/flows/x.spec.ts', schalter: 'RUN_X' },
    ])
  })

  it('meldet nichts, wenn der Schalter gesetzt wird', () => {
    expect(scanne(spec('process.env.RUN_X'), ['env:\n  RUN_X: 1'])).toEqual([])
  })

  it('liefert stabil sortiert (damit die Baseline nicht bei jedem Lauf rauscht)', () => {
    const specs = [
      { datei: 'b.spec.ts', inhalt: 'process.env.RUN_B' },
      { datei: 'a.spec.ts', inhalt: 'process.env.RUN_A' },
    ]
    expect(scanne(specs, []).map((t) => t.datei)).toEqual(['a.spec.ts', 'b.spec.ts'])
  })
})

describe('diffBaseline', () => {
  it('meldet nur NEUE Eintraege', () => {
    const treffer = [
      { datei: 'a.spec.ts', schalter: 'RUN_A' },
      { datei: 'b.spec.ts', schalter: 'RUN_B' },
    ]
    expect(diffBaseline(treffer, ['a.spec.ts::RUN_A'])).toEqual(['b.spec.ts::RUN_B'])
  })

  it('meldet nichts, wenn alles bekannt ist', () => {
    expect(diffBaseline([{ datei: 'a.spec.ts', schalter: 'RUN_A' }], ['a.spec.ts::RUN_A'])).toEqual([])
  })

  it('unterscheidet denselben Schalter in verschiedenen Dateien', () => {
    // golden-path-* nutzen alle RUN_GOLDEN_PATH_PROD — jede Datei ist ein eigener Eintrag.
    const treffer = [
      { datei: 'a.spec.ts', schalter: 'RUN_G' },
      { datei: 'b.spec.ts', schalter: 'RUN_G' },
    ]
    expect(diffBaseline(treffer, ['a.spec.ts::RUN_G'])).toEqual(['b.spec.ts::RUN_G'])
  })
})
