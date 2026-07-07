import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Source-Guard: die migrierten SV-Termin-Surfaces lesen Termine kanonisch aus
// gutachter_termine (assignee_id) — NICHT via .select(... sv_termin ...) aus der stale
// v_faelle_mit_aktuellem_termin. (Kommentare duerfen die alten Namen erwaehnen; geprueft
// wird der echte Query-Pattern.) Phase 1b (erinnerungen/monatsabrechnung/storno) Aaron-gated.
function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8')
}
// Der eigentliche Bug-Pattern: eine .select(...)-Klausel, die sv_termin enthaelt.
const SELECTS_SV_TERMIN = /\.select\([^)]*sv_termin/

describe('SV-Termine kanonische Quelle (gutachter_termine) — Source-Guards', () => {
  it('SV-Kalender nutzt svTermine + selektiert kein sv_termin', () => {
    const s = read('src/app/gutachter/kalender/page.tsx')
    expect(s).toMatch(/svTermine/)
    expect(s).not.toMatch(SELECTS_SV_TERMIN)
  })

  it('Tagesroute nutzt svTermine', () => {
    expect(read('src/app/gutachter/heute/page.tsx')).toMatch(/svTermine/)
  })

  it('no-show-timeout prueft neuen Termin via gutachter_termine + selektiert kein sv_termin', () => {
    const s = read('src/app/api/cron/no-show-timeout/route.ts')
    expect(s).toMatch(/from\(['"]gutachter_termine['"]\)/)
    expect(s).not.toMatch(SELECTS_SV_TERMIN)
  })

  it('Admin-Kalender nutzt gutachter_termine + selektiert kein sv_termin', () => {
    const s = read('src/app/admin/kalender/page.tsx')
    expect(s).toMatch(/from\(['"]gutachter_termine['"]\)/)
    expect(s).not.toMatch(SELECTS_SV_TERMIN)
  })

  it('TageskalenderWidget nutzt gutachter_termine + selektiert kein sv_termin', () => {
    const s = read('src/app/admin/_components/TageskalenderWidget.tsx')
    expect(s).toMatch(/from\(['"]gutachter_termine['"]\)/)
    expect(s).not.toMatch(SELECTS_SV_TERMIN)
  })
})
