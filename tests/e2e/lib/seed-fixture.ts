// Crash-sicheres Laden von Seed-Fixture-Dateien (scripts/smoke/.*.json) fuer e2e-Specs.
//
// WARUM ES DAS GIBT — der teuerste Fehler dieser Suite:
// Ein `const seed = JSON.parse(readFileSync(...))` auf MODUL-TOP-LEVEL wirft beim Import, wenn
// die Datei fehlt. Playwright importiert beim COLLECTEN aber jede Spec — ein einziger Throw
// killt damit nicht nur die eigene Datei, sondern den GANZEN Lauf:
//   * CI: main-e2e war 05.-11.08. durchgehend rot (feststellung-flow-gate ENOENT), ALLE
//     Journey-Smokes fielen als Kollateral aus -> das Regressions-Netz war eine Woche tot.
//   * lokal: `npx playwright test` meldet "Total: 0 tests in 0 files" — es sieht aus wie
//     "nichts zu tun", ist aber ein Totalausfall.
//
// SKIP vs. FAIL — bewusste Unterscheidung nach Seed-HERKUNFT:
//   * `ciErzeugt: false` (local-only Seeds, Generator laeuft nur lokal gegen prod):
//     fehlt die Datei -> in CI wie lokal sauber SKIPPEN. Muster: feststellung-flow-gate.
//   * `ciErzeugt: true` (der e2e-Job erzeugt die Datei in einem Seed-Step):
//     lokal SKIPPEN (Fehlen ist dort der Normalfall), in CI aber HART FEHLSCHLAGEN.
//     Stilles Skippen waere hier gefaehrlich: faellt der Seed-Step aus (oder schreibt er die
//     Datei woanders hin), meldete der e2e-Job gruen, obwohl die Journey nie gelaufen ist —
//     ein gruenes Sicherheitsnetz mit Loch ist schlimmer als ein rotes.

import { test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type SeedFixture<T> = {
  /**
   * Der geparste Seed. Zugriff ist erst nach `guard()` gueltig — fehlt die Datei, wirft JEDER
   * Feldzugriff mit klarer Meldung (statt eines `null`-Dereferenz-Rauschens). Dadurch bleibt der
   * Typ `T` ehrlich und die Call-Sites schreiben weiter schlicht `seed.feld`.
   */
  daten: T
  /** In `test.beforeEach(...)` haengen: skippt lokal sauber bzw. schlaegt in CI hart fehl. */
  guard: () => void
}

/**
 * Laedt eine Seed-Fixture aus `scripts/smoke/` crash-sicher (nie Throw beim Import).
 *
 * @param dateiname Dateiname inkl. fuehrendem Punkt, z.B. `.reparatur-weg-e2e-seed.json`
 * @param generator Pfad des erzeugenden Scripts (fuer die Fehlermeldung), z.B. `scripts/smoke/x.mjs`
 * @param opts.ciErzeugt `true`, wenn ein CI-Step die Datei erzeugt -> Fehlen in CI = harter Fehler
 *
 * Nutzung (Call-Sites bleiben unveraendert `seed.feld`):
 * ```ts
 * const fixture = ladeSeedFixture('.x-seed.json', 'scripts/smoke/x.mjs', { ciErzeugt: true })
 * const seed = fixture.daten
 * test.beforeEach(() => fixture.guard())   // <- PFLICHT: ohne diesen Hook greift kein skip/fail
 * ```
 */
export function ladeSeedFixture<T extends object = Record<string, string>>(
  dateiname: string,
  generator: string,
  opts: { ciErzeugt: boolean },
): SeedFixture<T> {
  let roh: T | null = null
  try {
    roh = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke', dateiname), 'utf8')) as T
  } catch {
    /* fehlt/kaputt -> guard() entscheidet skip vs. fail. NIE hier werfen (Collection-Crash). */
  }

  // Zugriffs-Proxy: liefert die Seed-Felder durch, solange geladen. Ist nichts geladen (guard()
  // vergessen oder ausserhalb eines Tests gelesen), wirft der Zugriff mit einer Meldung, die das
  // Problem benennt — statt eines nichtssagenden "Cannot read properties of null".
  const daten = new Proxy({} as T, {
    get(_ziel, feld) {
      if (!roh) {
        throw new Error(
          `Seed-Fixture ${dateiname} ist nicht geladen (Zugriff auf "${String(feld)}"). ` +
            `Fehlt in dieser Spec das test.beforeEach(() => fixture.guard())? ` +
            `Seed erzeugen mit: node ${generator}`,
        )
      }
      return Reflect.get(roh, feld)
    },
  })

  return {
    daten,
    guard() {
      if (roh) return
      const basis = `Seed-Fixture ${dateiname} fehlt oder ist unlesbar — erzeugen mit: node ${generator}`
      if (opts.ciErzeugt && process.env.CI) {
        // Hart fehlschlagen: in CI MUSS der Seed-Step die Datei erzeugt haben.
        throw new Error(
          `${basis}\nIn CI erzeugt sie der Seed-Step des e2e-Jobs — fehlt sie hier, ist dieser Step defekt. ` +
            `Bewusst KEIN Skip: ein stiller Skip liesse den Job gruen, obwohl die Journey nie lief.`,
        )
      }
      test.skip(true, basis)
    },
  }
}
