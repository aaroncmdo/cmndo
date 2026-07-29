import { describe, it, expect } from 'vitest'
import { bewerteSvKandidat } from '../matching-score'

// Sub-A.1: findeBestePerson erbt findBestSVs Sticky-Bonus (+1000) + reiche Felder.
// Der End-to-End-Pfad (DB/Mapbox/freieSlots) wird im A.2-Shadow-Diff geprüft;
// dieser Pure-Test sichert, dass der Bonus-Betrag stark genug ist, das Ranking
// zu drehen (Kontinuität > Optimierung, wie in findBestSV).
describe('findeBestePerson Parität (Sub-A.1) — Sticky-Bonus', () => {
  it('Sticky +1000 hebt einen sonst schwächeren Kandidaten über den Best-Score', () => {
    const schwach = bewerteSvKandidat({ istNetzwerkpartner: false, kontingentGenutzt: 5, ablehnungen30d: 0, etaVomBueroMin: 30, distanzKm: 20 })
    const stark = bewerteSvKandidat({ istNetzwerkpartner: true, kontingentGenutzt: 0, ablehnungen30d: 0, etaVomBueroMin: 10, distanzKm: 5 })
    expect(stark).toBeGreaterThan(schwach)        // ohne Sticky: der starke Kandidat gewinnt
    expect(schwach + 1000).toBeGreaterThan(stark) // mit Sticky-Bonus: der sticky (schwächere) gewinnt
  })
})
