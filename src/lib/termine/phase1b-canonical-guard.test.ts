import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Phase-1b Source-Guard: die reaktivierten Termin-Consumer lesen den Termin kanonisch aus
// gutachter_termine (via aktuellerTerminFuerFall bzw. direkt) — NICHT via .select(... sv_termin ...)
// aus der stale, DEFINER-gated v_faelle_mit_aktuellem_termin. (Kommentare duerfen die alten Namen
// erwaehnen; geprueft wird der echte Query-Pattern.)
function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8')
}
const SELECTS_SV_TERMIN = /\.select\([^)]*sv_termin/

describe('Phase 1b — reaktivierte Termin-Consumer lesen kanonisch (gutachter_termine)', () => {
  it('storno-actions stornoFall nutzt aktuellerTerminFuerFall + selektiert kein sv_termin', () => {
    const s = read('src/lib/actions/storno-actions.ts')
    expect(s).toMatch(/aktuellerTerminFuerFall/)
    expect(s).not.toMatch(SELECTS_SV_TERMIN)
  })

  it('gutachter-erinnerungen liest gutachter_termine + selektiert kein sv_termin', () => {
    const s = read('src/app/api/cron/gutachter-erinnerungen/route.ts')
    expect(s).toMatch(/from\(['"]gutachter_termine['"]\)/)
    expect(s).not.toMatch(SELECTS_SV_TERMIN)
  })
})
