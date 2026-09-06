import { describe, it, expect } from 'vitest'
import {
  findeSchalter,
  hatFallback,
  wirdGesetzt,
  scanne,
  diffBaseline,
  ohneKommentare,
  nenntDatei,
  ruftNpmKey,
  erreichbareNpmKeys,
  skripteOhneAufrufer,
  KEIN_AUFRUFER,
} from './stumme-waechter-scan.mjs'

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

// ---------------------------------------------------------------------------------------------
// Achse 2: Pruefskript ohne Aufrufer

describe('ohneKommentare', () => {
  it('entfernt YAML-Kommentarzeilen und Zeilenend-Kommentare', () => {
    expect(ohneKommentare('  # Siehe scripts/check-x.mjs\n  run: npm run check:y # ratchet')).toBe(
      '  \n  run: npm run check:y ',
    )
  })

  it('laesst ein # ohne Leerraum davor stehen (kein Kommentar)', () => {
    expect(ohneKommentare('run: echo PR#5862')).toBe('run: echo PR#5862')
  })
})

describe('nenntDatei', () => {
  it('trifft den Dateinamen mit Pfad und Flags', () => {
    expect(nenntDatei('check-x.mjs', 'run: node --env-file=.env.local scripts/check-x.mjs --ratchet')).toBe(true)
  })

  it('⭐ trifft NICHT als Teilstring eines laengeren Namens', () => {
    // check-rls.mjs darf nicht in check-rls-policies.mjs "gefunden" werden — das wuerde
    // ein unverdrahtetes Skript VERSTECKEN.
    expect(nenntDatei('check-rls.mjs', 'run: node scripts/check-rls-policies.mjs')).toBe(false)
    expect(nenntDatei('check-x.mjs', 'run: node scripts/check-x-y.mjs')).toBe(false)
  })
})

describe('ruftNpmKey', () => {
  it('trifft `npm run key`, mit `--` Argumenten und mit --silent', () => {
    expect(ruftNpmKey('check:x', 'run: npm run check:x -- --ratchet')).toBe(true)
    expect(ruftNpmKey('check:x', 'run: npm run --silent check:x')).toBe(true)
  })

  it('⭐ trifft NICHT den Praefix eines laengeren Keys', () => {
    expect(ruftNpmKey('check:rls', 'run: npm run check:rls-policies -- --ratchet')).toBe(false)
  })

  it('trifft nicht die blosse Nennung ohne `npm run`', () => {
    expect(ruftNpmKey('check:x', 'siehe check:x in package.json')).toBe(false)
  })
})

describe('erreichbareNpmKeys', () => {
  it('loest npm-Keys transitiv ueber ihre Kommandos auf', () => {
    const npm = { 'check:all': 'npm run check:a && npm run check:b', 'check:a': 'node scripts/check-a.mjs', 'check:b': 'node scripts/check-b.mjs', 'check:c': 'node scripts/check-c.mjs' }
    const erreicht = erreichbareNpmKeys(npm, ['run: npm run check:all'])
    expect([...erreicht].sort()).toEqual(['check:a', 'check:all', 'check:b'])
  })
})

describe('skripteOhneAufrufer', () => {
  const npm = {
    'check:a': 'node scripts/check-a.mjs',
    'check:b': 'node --env-file=.env.local scripts/check-b.mjs',
    'check:rls': 'node scripts/check-rls.mjs',
    'check:rls-policies': 'node scripts/check-rls-policies.mjs',
  }
  const skripte = ['scripts/check-a.mjs', 'scripts/check-b.mjs', 'scripts/check-c.mjs', 'scripts/check-rls.mjs', 'scripts/check-rls-policies.mjs']

  it('meldet das Skript, das weder per npm-Key noch per Dateiname aufgerufen wird', () => {
    const wf = ['run: npm run check:a -- --ratchet\nrun: node scripts/check-b.mjs\nrun: npm run check:rls-policies -- --ratchet']
    expect(skripteOhneAufrufer(skripte, npm, wf)).toEqual([
      { datei: 'scripts/check-c.mjs', schalter: KEIN_AUFRUFER },
      { datei: 'scripts/check-rls.mjs', schalter: KEIN_AUFRUFER },
    ])
  })

  it('zaehlt den Aufruf per Dateiname (auch mit --env-file) — die Sicherheits-Ratchets laufen so', () => {
    // Genau hier lag der Messfehler der Abnahme-Session: nur nach npm-Keys gesucht → die
    // per Dateiname aufgerufenen RLS-/Grant-Ratchets galten faelschlich als unverdrahtet.
    expect(skripteOhneAufrufer(['scripts/check-b.mjs'], npm, ['run: node --env-file=.env.local scripts/check-b.mjs'])).toEqual([])
  })

  it('⭐ zaehlt eine Nennung im YAML-Kommentar NICHT als Aufruf', () => {
    expect(skripteOhneAufrufer(['scripts/check-c.mjs'], npm, ['# Siehe scripts/check-c.mjs + AGENTS.md'])).toEqual([
      { datei: 'scripts/check-c.mjs', schalter: KEIN_AUFRUFER },
    ])
  })

  it('respektiert die Allowlist', () => {
    expect(skripteOhneAufrufer(['scripts/check-c.mjs'], npm, [], { 'scripts/check-c.mjs': 'manuell' })).toEqual([])
  })

  it('erkennt den Aufruf ueber einen transitiven npm-Key', () => {
    const npm2 = { 'check:all': 'npm run check:a', 'check:a': 'node scripts/check-a.mjs' }
    expect(skripteOhneAufrufer(['scripts/check-a.mjs'], npm2, ['run: npm run check:all'])).toEqual([])
  })

  it('liefert stabil sortiert', () => {
    expect(skripteOhneAufrufer(['scripts/check-z.mjs', 'scripts/check-a.mjs'], {}, []).map((t) => t.datei)).toEqual([
      'scripts/check-a.mjs',
      'scripts/check-z.mjs',
    ])
  })
})
