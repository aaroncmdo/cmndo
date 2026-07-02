import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Guard (Phase 5): kategorie='task' ist retired. Tasks werden via
// get_updates_action/offene_aufgabe ABGELEITET, nicht als Mitteilung
// materialisiert. Kein createMitteilung*-Aufruf darf mehr kategorie:'task'
// schreiben (create-task-Spiegel entfernt; Standalone-Notifs -> 'update').
// Node-env (kein jsdom) -> Quell-Assertion.
//
// NICHT gelistet: lib/fall/event-stream.ts — dort ist `kategorie:'task'` ein
// FallEvent-Feld (Type `string`, KEIN MitteilungKategorie), legitim.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..') // -> src/

const MITTEILUNG_WRITE_FILES = [
  'app/admin/marketing/linkedin/actions.ts',
  'app/api/cron/vs-korrespondenz-review/route.ts',
  'app/api/cron/re-termin-eskalation/route.ts',
  'lib/actions/sv-verifizierung-actions.ts',
  'lib/lexdrive/process-event.ts',
  'lib/tasks/create-task.ts',
]

const TASK_KATEGORIE = /kategorie:\s*['"]task['"]/

describe('mitteilungen: kategorie=task ist retired (Phase 5)', () => {
  for (const f of MITTEILUNG_WRITE_FILES) {
    it(`${f} schreibt kein kategorie:'task' mehr`, () => {
      const src = readFileSync(join(SRC, f), 'utf8')
      expect(src, `${f}: kategorie:'task' ist deprecated -> entfernen oder 'update'`).not.toMatch(
        TASK_KATEGORIE,
      )
    })
  }
})
