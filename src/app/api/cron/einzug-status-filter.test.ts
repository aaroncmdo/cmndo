import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Schuetzt, dass Dunning/Reminder eine laufende Lastschrift (im_einzug) NICHT mahnen.
const files = ['sv-mahnung-saeumnis', 'abrechnung-reminder']
describe('Dunning/Reminder schliessen im_einzug aus', () => {
  for (const f of files) {
    it(`${f} filtert status != im_einzug`, () => {
      const src = readFileSync(join(process.cwd(), 'src/app/api/cron', f, 'route.ts'), 'utf8')
      expect(src).toMatch(/\.neq\(\s*['"]status['"]\s*,\s*['"]im_einzug['"]\s*\)/)
    })
  }
})
