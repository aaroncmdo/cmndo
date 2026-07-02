import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('golden-path-fixtures', () => {
  const src = readFileSync('src/lib/health/golden-path-fixtures.ts', 'utf8')
  it('nutzt @claimondo.test-Marker', () => { expect(src).toMatch(/@claimondo\.test/) })
  it('legt Test-SV inaktiv an (nicht im Dispatch)', () => { expect(src).toMatch(/ist_aktiv:\s*false/) })
  it('ist idempotent (upsert/select-vor-insert)', () => { expect(src).toMatch(/maybeSingle|upsert|onConflict/) })
})
